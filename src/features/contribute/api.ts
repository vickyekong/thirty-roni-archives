import type { ContributionPayload, ContributorCategory, MediaPurpose, SubmissionIssue } from '@shared/contribution'
import { env } from '@/lib/env'
import { CONTRIBUTE_ENDPOINT } from '@/lib/supabase'

export type ContributorInfo = {
  fullName: string
  relationship: string | null
  category: ContributorCategory
}

export type MediaItem = {
  id: string
  purpose: MediaPurpose
  mimeType: string
  size: number | null
  fileName: string | null
  previewUrl: string | null
}

export type Draft = {
  payload: ContributionPayload
  step: number
  version: number
  updatedAt: string
}

export type OpenContribution = {
  id: string
  status: 'draft' | 'changes_requested'
  correctionRequest: string | null
  draft: Draft | null
  media: MediaItem[]
}

export type SessionData = {
  contributor: ContributorInfo
  contributionsOpen: boolean
  expiresAt: string
  current: OpenContribution | null
  submitted: { id: string; submittedAt: string | null }[]
}

type Responses = {
  link: { contributionsOpen: boolean }
  join: { token: string }
  session: SessionData
  start: { contributionId: string; created: boolean }
  save: { version: number; updatedAt: string }
  'upload-url': { mediaId: string; path: string; signedUrl: string; mimeType: string }
  'finalize-upload': { media: MediaItem | null }
  'delete-media': { deleted: boolean }
  submit: { contributionId: string; submittedAt: string | null; duplicate: boolean }
  'removal-request': { requestId: string }
}

type Requests = {
  link: Record<string, never>
  join: { fullName: string; relationship: string; category: ContributorCategory }
  session: Record<string, never>
  start: Record<string, never>
  save: { contributionId: string; payload: ContributionPayload; step: number; version: number }
  'upload-url': { contributionId: string; purpose: MediaPurpose; fileName: string; mimeType: string; size: number }
  'finalize-upload': { contributionId: string; mediaId: string }
  'delete-media': { contributionId: string; mediaId: string }
  submit: { contributionId: string; payload: ContributionPayload; idempotencyKey: string }
  'removal-request': { details: string; contributionId?: string }
}

export type Action = keyof Responses

export class ApiError extends Error {
  readonly status: number
  readonly code: string
  readonly extra: Record<string, unknown>

  constructor(status: number, code: string, message: string, extra: Record<string, unknown> = {}) {
    super(message)
    this.status = status
    this.code = code
    this.extra = extra
  }

  get isNetwork() {
    return this.code === 'network_error'
  }

  get latestDraft(): Draft | null {
    return (this.extra.latest as Draft | null | undefined) ?? null
  }

  get issues(): SubmissionIssue[] {
    return (this.extra.issues as SubmissionIssue[] | undefined) ?? []
  }
}

/** Actions that are safe to repeat automatically after a dropped connection. */
const RETRYABLE: ReadonlySet<Action> = new Set(['link', 'session', 'start', 'save', 'finalize-upload', 'delete-media', 'submit'])
const RETRYABLE_STATUS = new Set([502, 503, 504])

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export async function callContribute<A extends Action>(
  action: A,
  token: string,
  body: Requests[A],
  options: { signal?: AbortSignal } = {},
): Promise<Responses[A]> {
  const attempts = RETRYABLE.has(action) ? 3 : 1
  let lastError: ApiError | null = null

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt > 0) await wait(600 * 2 ** (attempt - 1))
    let response: Response
    try {
      response = await fetch(CONTRIBUTE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: env.VITE_SUPABASE_PUBLISHABLE_KEY },
        body: JSON.stringify({ action, token, ...body }),
        signal: options.signal,
        cache: 'no-store',
      })
    } catch (error) {
      if (options.signal?.aborted) throw error
      lastError = new ApiError(0, 'network_error', 'We could not reach the server. Please check your connection.')
      continue
    }

    let json: { ok: true; data: Responses[A] } | { ok: false; error: { code: string; message: string } & Record<string, unknown> }
    try {
      json = await response.json()
    } catch {
      lastError = new ApiError(response.status, 'bad_response', 'The server sent an unexpected response. Please try again.')
      if (RETRYABLE_STATUS.has(response.status)) continue
      throw lastError
    }

    if (json.ok) return json.data
    const { code, message, ...extra } = json.error
    lastError = new ApiError(response.status, code, message, extra)
    if (!RETRYABLE_STATUS.has(response.status)) throw lastError
  }
  throw lastError ?? new ApiError(0, 'network_error', 'We could not reach the server.')
}
