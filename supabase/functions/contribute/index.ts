// The single gateway for invited contributors. Contributors never receive database
// credentials: every request carries the raw invitation token, which is hashed and
// matched here, and all reads/writes are scoped to that invitation's contributor
// (so a replacement link still reaches the same unfinished draft). A shared group link
// only grants `join`, which creates a contributor with their own personal invitation.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { z } from 'zod'
import {
  CONTRIBUTOR_CATEGORIES,
  MEDIA_PURPOSES,
  MEDIA_RULES,
  MIME_EXTENSIONS,
  baseMimeType,
  normalizeForSubmission,
  payloadSchema,
  suggestChapter,
  validateForSubmission,
  type MediaPurpose,
} from '../_shared/contribution.ts'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const secretKeys = Deno.env.get('SUPABASE_SECRET_KEYS')
const SERVICE_KEY: string = secretKeys
  ? JSON.parse(secretKeys).default
  : Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
const IP_SALT = Deno.env.get('RATE_LIMIT_SALT') ?? SUPABASE_URL

const BUCKET = 'contributions'
const MAX_BODY_BYTES = 400_000
const EDITABLE = ['draft', 'changes_requested'] as const
const PENDING_UPLOAD_WINDOW_MS = 2 * 60 * 60 * 1000

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

// ---------------------------------------------------------------------------
// HTTP helpers
// ---------------------------------------------------------------------------
class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message)
  }
}

function corsHeaders(origin: string | null): Record<string, string> {
  const allowed =
    ALLOWED_ORIGINS.length === 0 ? '*' : origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  }
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(origin),
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
    },
  })
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

function clientIp(req: Request): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('cf-connecting-ip') ||
    'unknown'
  )
}

async function rateLimit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const { data, error } = await db.rpc('consume_rate_limit', {
    p_key: key,
    p_limit: limit,
    p_window_seconds: windowSeconds,
  })
  if (error) {
    console.error('rate limit error', error.message)
    return true
  }
  return data === true
}

async function audit(
  action: string,
  entityType: string,
  entityId: string | null,
  contributorId: string,
  ipHash: string,
  details: Record<string, unknown> = {},
) {
  const { error } = await db.from('audit_logs').insert({
    actor_type: 'contributor',
    actor_id: contributorId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    details,
    ip_hash: ipHash,
  })
  if (error) console.error('audit insert failed', error.message)
}

// ---------------------------------------------------------------------------
// Request validation
// ---------------------------------------------------------------------------
const token = z.string().regex(/^[A-Za-z0-9_-]{43}$/, 'Invalid invitation link')
const contributionId = z.uuid()

const requestSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('link'), token }),
  z.object({
    action: z.literal('join'),
    token,
    fullName: z.string().trim().min(1, 'Please tell us your name').max(120),
    relationship: z.string().trim().max(120).default(''),
    category: z.enum(CONTRIBUTOR_CATEGORIES),
  }),
  z.object({ action: z.literal('session'), token }),
  z.object({ action: z.literal('start'), token }),
  z.object({
    action: z.literal('save'),
    token,
    contributionId,
    payload: payloadSchema,
    step: z.number().int().min(0).max(20),
    version: z.number().int().min(1),
  }),
  z.object({
    action: z.literal('upload-url'),
    token,
    contributionId,
    purpose: z.enum(MEDIA_PURPOSES),
    fileName: z.string().min(1).max(255),
    mimeType: z.string().min(3).max(100),
    size: z.number().int().positive(),
  }),
  z.object({ action: z.literal('finalize-upload'), token, contributionId, mediaId: z.uuid() }),
  z.object({ action: z.literal('delete-media'), token, contributionId, mediaId: z.uuid() }),
  z.object({
    action: z.literal('submit'),
    token,
    contributionId,
    payload: payloadSchema,
    idempotencyKey: z.uuid(),
  }),
  z.object({
    action: z.literal('removal-request'),
    token,
    details: z.string().trim().min(1).max(4000),
    contributionId: contributionId.optional(),
  }),
])

type ApiRequest = z.infer<typeof requestSchema>

// ---------------------------------------------------------------------------
// Invitation resolution
// ---------------------------------------------------------------------------
type Invitation = {
  id: string
  status: 'active' | 'revoked'
  expires_at: string
  last_used_at: string | null
  contributor: {
    id: string
    full_name: string
    relationship: string | null
    category: 'parent' | 'sibling' | 'friend'
  }
}

async function resolveInvitation(rawToken: string, ipHash: string): Promise<Invitation> {
  const tokenHash = await sha256Hex(rawToken)
  const { data, error } = await db
    .from('invitations')
    .select('id, status, expires_at, last_used_at, contributor:contributors!inner(id, full_name, relationship, category)')
    .eq('token_hash', tokenHash)
    .maybeSingle()
  if (error) throw new HttpError(500, 'server_error', 'We could not check your invitation. Please try again.')

  if (!data) {
    const allowed = await rateLimit(`badtoken:${ipHash}`, 20, 3600)
    if (!allowed) throw new HttpError(429, 'rate_limited', 'Too many attempts. Please wait a while and try again.')
    throw new HttpError(401, 'invalid_invitation', 'This invitation link is not valid. Please check the link you were sent.')
  }
  const invitation = data as unknown as Invitation
  if (invitation.status === 'revoked')
    throw new HttpError(403, 'invitation_revoked', 'This invitation is no longer active. Please contact the curator for a new link.')
  if (new Date(invitation.expires_at).getTime() <= Date.now())
    throw new HttpError(403, 'invitation_expired', 'This invitation has expired. Please contact the curator for a new link.')

  if (!invitation.last_used_at || Date.now() - new Date(invitation.last_used_at).getTime() > 5 * 60 * 1000) {
    await db.from('invitations').update({ last_used_at: new Date().toISOString() }).eq('id', invitation.id)
  }
  return invitation
}

type SharedLink = { id: string; status: 'active' | 'revoked'; expires_at: string }

async function resolveSharedLink(rawToken: string, ipHash: string): Promise<SharedLink> {
  const { data, error } = await db
    .from('shared_links')
    .select('id, status, expires_at')
    .eq('token_hash', await sha256Hex(rawToken))
    .maybeSingle()
  if (error) throw new HttpError(500, 'server_error', 'We could not check this link. Please try again.')
  if (!data) {
    const allowed = await rateLimit(`badtoken:${ipHash}`, 20, 3600)
    if (!allowed) throw new HttpError(429, 'rate_limited', 'Too many attempts. Please wait a while and try again.')
    throw new HttpError(401, 'invalid_shared_link', 'This link is not valid. Please check the link you were sent.')
  }
  const link = data as SharedLink
  if (link.status === 'revoked')
    throw new HttpError(403, 'shared_link_off', 'This link has been turned off. Please ask the person who shared it for the new one.')
  if (new Date(link.expires_at).getTime() <= Date.now())
    throw new HttpError(403, 'shared_link_expired', 'This link has expired. Please ask the person who shared it for a new one.')
  return link
}

function randomToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32))
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

async function handleShared(req: Extract<ApiRequest, { action: 'link' | 'join' }>, ipHash: string) {
  const link = await resolveSharedLink(req.token, ipHash)
  if (req.action === 'link') return { contributionsOpen: await contributionsOpen() }

  if (!(await contributionsOpen())) throw new HttpError(403, 'closed', 'Contributions are now closed. Thank you so much.')
  if (!(await rateLimit(`join:${ipHash}`, 8, 3600)))
    throw new HttpError(429, 'rate_limited', 'Several people have already joined from this connection. Please try again a little later.')
  if (!(await rateLimit(`joinlink:${link.id}`, 300, 86400)))
    throw new HttpError(429, 'rate_limited', 'This link is very busy right now. Please try again later.')

  const { data: contributor, error } = await db
    .from('contributors')
    .insert({
      full_name: req.fullName,
      relationship: req.relationship || null,
      category: req.category,
      shared_link_id: link.id,
    })
    .select('id')
    .single()
  if (error || !contributor) throw new HttpError(500, 'server_error', 'We could not set up your contribution. Please try again.')

  const personal = randomToken()
  const { error: inviteError } = await db.from('invitations').insert({
    contributor_id: contributor.id,
    token_hash: await sha256Hex(personal),
    expires_at: new Date(Date.now() + 60 * 86400_000).toISOString(),
  })
  if (inviteError) {
    await db.from('contributors').delete().eq('id', contributor.id)
    throw new HttpError(500, 'server_error', 'We could not set up your contribution. Please try again.')
  }
  await audit('contributor.joined', 'contributors', contributor.id, contributor.id, ipHash, { sharedLinkId: link.id })
  return { token: personal }
}

async function contributionsOpen(): Promise<boolean> {
  const { data } = await db.from('site_settings').select('contributions_open').eq('id', 1).single()
  return data?.contributions_open ?? false
}

type ContributionRow = {
  id: string
  status: string
  invitation_id: string
  contributor_id: string
  idempotency_key: string | null
  submitted_payload: unknown
  correction_request: string | null
  submitted_at: string | null
}

async function loadOwnContribution(invitation: Invitation, id: string): Promise<ContributionRow> {
  const { data, error } = await db
    .from('contributions')
    .select('id, status, invitation_id, contributor_id, idempotency_key, submitted_payload, correction_request, submitted_at')
    .eq('id', id)
    .eq('contributor_id', invitation.contributor.id)
    .maybeSingle()
  if (error) throw new HttpError(500, 'server_error', 'Something went wrong. Please try again.')
  if (!data) throw new HttpError(404, 'not_found', 'We could not find that contribution.')
  return data as ContributionRow
}

function assertEditable(c: ContributionRow) {
  if (!(EDITABLE as readonly string[]).includes(c.status))
    throw new HttpError(409, 'not_editable', 'This contribution has already been submitted.')
}

// ---------------------------------------------------------------------------
// Media helpers
// ---------------------------------------------------------------------------
type MediaRow = {
  id: string
  purpose: MediaPurpose
  status: 'pending_upload' | 'verified' | 'rejected'
  mime_type: string
  size_bytes: number | null
  original_filename: string | null
  storage_path: string
  created_at: string
}

async function listMedia(contributionIdValue: string) {
  const { data, error } = await db
    .from('media_assets')
    .select('id, purpose, status, mime_type, size_bytes, original_filename, storage_path, created_at')
    .eq('contribution_id', contributionIdValue)
    .neq('status', 'rejected')
    .order('created_at')
  if (error) throw new HttpError(500, 'server_error', 'We could not load your uploads.')
  const rows = (data ?? []) as MediaRow[]
  const verifiedImages = rows.filter((m) => m.status === 'verified' && MEDIA_RULES[m.purpose].kind === 'image')
  const previews = new Map<string, string>()
  if (verifiedImages.length) {
    const { data: signed } = await db.storage
      .from(BUCKET)
      .createSignedUrls(verifiedImages.map((m) => m.storage_path), 60 * 30)
    signed?.forEach((s, i) => {
      if (s.signedUrl) previews.set(verifiedImages[i].id, s.signedUrl)
    })
  }
  return rows
    .filter((m) => m.status === 'verified')
    .map((m) => ({
      id: m.id,
      purpose: m.purpose,
      mimeType: m.mime_type,
      size: m.size_bytes,
      fileName: m.original_filename,
      previewUrl: previews.get(m.id) ?? null,
    }))
}

function matchesSignature(bytes: Uint8Array, mime: string): boolean {
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end))
  const isFtyp = ascii(4, 8) === 'ftyp'
  switch (mime) {
    case 'image/jpeg':
      return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
    case 'image/png':
      return bytes[0] === 0x89 && ascii(1, 4) === 'PNG'
    case 'image/webp':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP'
    case 'image/heic':
    case 'image/heif':
      return isFtyp && ['heic', 'heix', 'hevc', 'heim', 'heis', 'mif1', 'msf1', 'avif'].includes(ascii(8, 12))
    case 'video/mp4':
    case 'audio/mp4':
    case 'audio/x-m4a':
      return isFtyp
    case 'video/quicktime':
      return isFtyp || ['moov', 'mdat', 'wide', 'free', 'skip', 'pnot'].includes(ascii(4, 8))
    case 'video/webm':
    case 'audio/webm':
      return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3
    case 'audio/ogg':
      return ascii(0, 4) === 'OggS'
    case 'audio/wav':
    case 'audio/x-wav':
      return ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WAVE'
    case 'audio/mpeg':
      return ascii(0, 3) === 'ID3' || (bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0)
    case 'audio/aac':
      return bytes[0] === 0xff && (bytes[1] & 0xf6) === 0xf0
    default:
      return false
  }
}

async function removeMedia(rows: Pick<MediaRow, 'id' | 'storage_path'>[]) {
  if (!rows.length) return
  await db.storage.from(BUCKET).remove(rows.map((r) => r.storage_path))
  await db.from('media_assets').delete().in('id', rows.map((r) => r.id))
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------
async function handle(req: ApiRequest, ipHash: string) {
  if (req.action === 'link' || req.action === 'join') return handleShared(req, ipHash)
  const invitation = await resolveInvitation(req.token, ipHash)
  const contributor = invitation.contributor

  if (!(await rateLimit(`inv:${invitation.id}`, 400, 600)))
    throw new HttpError(429, 'rate_limited', 'You are going a little fast. Please wait a moment and try again.')

  switch (req.action) {
    case 'session': {
      const { data: rows, error } = await db
        .from('contributions')
        .select('id, status, correction_request, submitted_at, created_at')
        .eq('contributor_id', contributor.id)
        .order('created_at', { ascending: false })
      if (error) throw new HttpError(500, 'server_error', 'We could not load your contribution.')

      const open = rows?.find((r) => (EDITABLE as readonly string[]).includes(r.status)) ?? null
      let current = null
      if (open) {
        const { data: draft } = await db
          .from('contribution_drafts')
          .select('payload, current_step, version, updated_at')
          .eq('contribution_id', open.id)
          .single()
        current = {
          id: open.id,
          status: open.status,
          correctionRequest: open.correction_request,
          draft: draft
            ? {
                payload: payloadSchema.parse(draft.payload ?? {}),
                step: draft.current_step,
                version: draft.version,
                updatedAt: draft.updated_at,
              }
            : null,
          media: await listMedia(open.id),
        }
      }
      return {
        contributor: {
          fullName: contributor.full_name,
          relationship: contributor.relationship,
          category: contributor.category,
        },
        contributionsOpen: await contributionsOpen(),
        expiresAt: invitation.expires_at,
        current,
        submitted: (rows ?? [])
          .filter((r) => !(EDITABLE as readonly string[]).includes(r.status))
          .map((r) => ({ id: r.id, submittedAt: r.submitted_at })),
      }
    }

    case 'start': {
      if (!(await contributionsOpen()))
        throw new HttpError(403, 'closed', 'Contributions are now closed. Thank you so much.')

      const existing = await db
        .from('contributions')
        .select('id')
        .eq('contributor_id', contributor.id)
        .in('status', EDITABLE as unknown as string[])
        .maybeSingle()
      if (existing.data) return { contributionId: existing.data.id, created: false }

      const { data: created, error } = await db
        .from('contributions')
        .insert({ contributor_id: contributor.id, invitation_id: invitation.id, status: 'draft' })
        .select('id')
        .single()
      if (error) {
        // Unique partial index: a parallel request already opened a draft.
        const retry = await db
          .from('contributions')
          .select('id')
          .eq('contributor_id', contributor.id)
          .in('status', EDITABLE as unknown as string[])
          .maybeSingle()
        if (retry.data) return { contributionId: retry.data.id, created: false }
        throw new HttpError(500, 'server_error', 'We could not start your contribution. Please try again.')
      }

      const initial = payloadSchema.parse({
        introduction: { fullName: contributor.full_name, relationship: contributor.relationship ?? '' },
      })
      await db.from('contribution_drafts').insert({ contribution_id: created.id, payload: initial })
      await audit('contribution.started', 'contributions', created.id, contributor.id, ipHash)
      return { contributionId: created.id, created: true }
    }

    case 'save': {
      const c = await loadOwnContribution(invitation, req.contributionId)
      assertEditable(c)
      const { data, error } = await db
        .from('contribution_drafts')
        .update({
          payload: req.payload,
          current_step: req.step,
          version: req.version + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('contribution_id', c.id)
        .eq('version', req.version)
        .select('version, updated_at')
      if (error) throw new HttpError(500, 'server_error', 'We could not save your progress.')
      if (!data?.length) {
        const { data: latest } = await db
          .from('contribution_drafts')
          .select('payload, current_step, version, updated_at')
          .eq('contribution_id', c.id)
          .single()
        throw new HttpError(409, 'version_conflict', 'Your contribution was updated in another window.', {
          latest: latest
            ? {
                payload: payloadSchema.parse(latest.payload ?? {}),
                step: latest.current_step,
                version: latest.version,
                updatedAt: latest.updated_at,
              }
            : null,
        })
      }
      return { version: data[0].version, updatedAt: data[0].updated_at }
    }

    case 'upload-url': {
      const c = await loadOwnContribution(invitation, req.contributionId)
      assertEditable(c)
      const rule = MEDIA_RULES[req.purpose]
      const mime = baseMimeType(req.mimeType)
      if (!rule.mimeTypes.includes(mime))
        throw new HttpError(422, 'unsupported_type', 'This file type is not supported here.')
      if (req.size > rule.maxBytes)
        throw new HttpError(422, 'too_large', `This file is too large. The limit is ${Math.round(rule.maxBytes / 1048576)} MB.`)

      if (!(await rateLimit(`upload:${invitation.id}`, 60, 3600)))
        throw new HttpError(429, 'rate_limited', 'Too many uploads in a short time. Please wait a little and try again.')

      const { data: existing } = await db
        .from('media_assets')
        .select('id, status, created_at')
        .eq('contribution_id', c.id)
        .eq('purpose', req.purpose)
        .neq('status', 'rejected')
      const live = (existing ?? []).filter(
        (m) =>
          m.status === 'verified' ||
          (m.status === 'pending_upload' && Date.now() - new Date(m.created_at).getTime() < PENDING_UPLOAD_WINDOW_MS),
      )
      if (live.length >= rule.maxCount)
        throw new HttpError(
          422,
          'limit_reached',
          rule.maxCount === 1 ? 'You have already added one of these.' : `You can add up to ${rule.maxCount} of these.`,
        )

      const mediaId = crypto.randomUUID()
      const path = `${c.id}/${mediaId}.${MIME_EXTENSIONS[mime] ?? 'bin'}`
      const { error: insertError } = await db.from('media_assets').insert({
        id: mediaId,
        bucket: BUCKET,
        storage_path: path,
        kind: rule.kind,
        purpose: req.purpose,
        status: 'pending_upload',
        mime_type: mime,
        size_bytes: req.size,
        original_filename: req.fileName.slice(0, 255),
        contribution_id: c.id,
        contributor_id: contributor.id,
      })
      if (insertError) throw new HttpError(500, 'server_error', 'We could not prepare your upload.')

      const { data: signed, error: signError } = await db.storage.from(BUCKET).createSignedUploadUrl(path)
      if (signError || !signed) throw new HttpError(500, 'server_error', 'We could not prepare your upload.')
      return { mediaId, path, signedUrl: signed.signedUrl, mimeType: mime }
    }

    case 'finalize-upload': {
      const c = await loadOwnContribution(invitation, req.contributionId)
      assertEditable(c)
      const { data: media } = await db
        .from('media_assets')
        .select('id, purpose, status, mime_type, storage_path')
        .eq('id', req.mediaId)
        .eq('contribution_id', c.id)
        .maybeSingle()
      if (!media) throw new HttpError(404, 'not_found', 'We could not find that upload.')
      if (media.status === 'verified') return { media: (await listMedia(c.id)).find((m) => m.id === media.id) }

      const folder = c.id
      const fileName = media.storage_path.split('/').pop()!
      const { data: listing } = await db.storage.from(BUCKET).list(folder, { search: fileName, limit: 1 })
      const object = listing?.find((o) => o.name === fileName)
      if (!object) throw new HttpError(409, 'upload_missing', 'The upload did not finish. Please try again.')

      const size = Number((object.metadata as Record<string, unknown> | null)?.size ?? 0)
      const rule = MEDIA_RULES[media.purpose as MediaPurpose]

      const { data: signedRead } = await db.storage.from(BUCKET).createSignedUrl(media.storage_path, 60)
      let headerOk = false
      if (signedRead?.signedUrl) {
        const head = await fetch(signedRead.signedUrl, { headers: { Range: 'bytes=0-63' } })
        const bytes = new Uint8Array(await head.arrayBuffer()).slice(0, 64)
        headerOk = matchesSignature(bytes, media.mime_type)
      }

      if (!headerOk || size <= 0 || size > rule.maxBytes) {
        await db.storage.from(BUCKET).remove([media.storage_path])
        await db.from('media_assets').update({ status: 'rejected' }).eq('id', media.id)
        await audit('media.rejected', 'media_assets', media.id, contributor.id, ipHash, { reason: headerOk ? 'size' : 'signature' })
        throw new HttpError(
          422,
          'invalid_file',
          headerOk
            ? 'This file is larger than allowed.'
            : 'This file does not look like the type it claims to be. Please choose another file.',
        )
      }

      await db
        .from('media_assets')
        .update({ status: 'verified', size_bytes: size, verified_at: new Date().toISOString() })
        .eq('id', media.id)
      await audit('media.uploaded', 'media_assets', media.id, contributor.id, ipHash, { purpose: media.purpose, size })
      return { media: (await listMedia(c.id)).find((m) => m.id === media.id) ?? null }
    }

    case 'delete-media': {
      const c = await loadOwnContribution(invitation, req.contributionId)
      assertEditable(c)
      const { data: media } = await db
        .from('media_assets')
        .select('id, storage_path')
        .eq('id', req.mediaId)
        .eq('contribution_id', c.id)
        .maybeSingle()
      if (!media) return { deleted: false }
      await removeMedia([media])
      await audit('media.deleted', 'media_assets', media.id, contributor.id, ipHash)
      return { deleted: true }
    }

    case 'submit': {
      const c = await loadOwnContribution(invitation, req.contributionId)
      if (c.idempotency_key === req.idempotencyKey && !(EDITABLE as readonly string[]).includes(c.status)) {
        return { contributionId: c.id, submittedAt: c.submitted_at, duplicate: true }
      }
      assertEditable(c)

      const { data: mediaRows } = await db
        .from('media_assets')
        .select('id, purpose, status, storage_path, created_at')
        .eq('contribution_id', c.id)
      const verified = (mediaRows ?? []).filter((m) => m.status === 'verified')
      const issues = validateForSubmission(req.payload, verified.length)
      if (issues.length) throw new HttpError(422, 'incomplete', issues[0].message, { issues })

      const payload = normalizeForSubmission(req.payload)
      const submittedAt = new Date().toISOString()
      const snapshot = {
        schemaVersion: 1,
        category: contributor.category,
        payload,
        media: verified.map((m) => ({ id: m.id, purpose: m.purpose })),
        submittedAt,
      }

      const { data: updated, error } = await db
        .from('contributions')
        .update({
          status: 'submitted',
          submitted_payload: snapshot,
          consent_given: payload.consent.permission,
          consent_at: submittedAt,
          name_visibility: payload.consent.nameVisibility,
          message_visibility: payload.consent.messageVisibility,
          date_precision: payload.timeline.precision ?? 'unknown',
          memory_year: payload.timeline.year,
          life_stage: payload.timeline.lifeStage,
          suggested_chapter: suggestChapter(payload.timeline),
          idempotency_key: req.idempotencyKey,
          submitted_at: submittedAt,
          correction_request: null,
        })
        .eq('id', c.id)
        .in('status', EDITABLE as unknown as string[])
        .select('id')
      if (error) {
        if (error.code === '23505') {
          const again = await loadOwnContribution(invitation, c.id)
          if (again.idempotency_key === req.idempotencyKey)
            return { contributionId: c.id, submittedAt: again.submitted_at, duplicate: true }
        }
        console.error('submit failed', error.message)
        throw new HttpError(500, 'server_error', 'We could not submit your contribution. Your words are saved — please try again.')
      }
      if (!updated?.length) {
        const again = await loadOwnContribution(invitation, c.id)
        if (again.idempotency_key === req.idempotencyKey)
          return { contributionId: c.id, submittedAt: again.submitted_at, duplicate: true }
        throw new HttpError(409, 'not_editable', 'This contribution has already been submitted.')
      }

      await db.from('contribution_drafts').update({ payload: req.payload }).eq('contribution_id', c.id)
      await db.from('content_approvals').insert({
        contribution_id: c.id,
        action: c.status === 'changes_requested' ? 'resubmitted' : 'submitted',
        payload_snapshot: c.status === 'changes_requested' ? c.submitted_payload : null,
      })
      await removeMedia(
        (mediaRows ?? []).filter((m) => m.status === 'pending_upload').map((m) => ({ id: m.id, storage_path: m.storage_path })),
      )
      await audit('contribution.submitted', 'contributions', c.id, contributor.id, ipHash, {
        media: verified.length,
      })
      return { contributionId: c.id, submittedAt, duplicate: false }
    }

    case 'removal-request': {
      if (!(await rateLimit(`removal:${invitation.id}`, 5, 86400)))
        throw new HttpError(429, 'rate_limited', 'We have already received your requests today. The curator will be in touch.')
      let ownContributionId: string | null = null
      if (req.contributionId) {
        const c = await loadOwnContribution(invitation, req.contributionId)
        ownContributionId = c.id
      }
      const { data, error } = await db
        .from('removal_requests')
        .insert({ contributor_id: contributor.id, contribution_id: ownContributionId, details: req.details })
        .select('id')
        .single()
      if (error) throw new HttpError(500, 'server_error', 'We could not send your request. Please try again.')
      await audit('removal.requested', 'removal_requests', data.id, contributor.id, ipHash)
      return { requestId: data.id }
    }
  }
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin')
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders(origin) })
  if (req.method !== 'POST')
    return json({ ok: false, error: { code: 'method_not_allowed', message: 'Method not allowed' } }, 405, origin)
  if (ALLOWED_ORIGINS.length && origin && !ALLOWED_ORIGINS.includes(origin))
    return json({ ok: false, error: { code: 'forbidden_origin', message: 'Origin not allowed' } }, 403, origin)

  const ipHash = (await sha256Hex(`${IP_SALT}:${clientIp(req)}`)).slice(0, 32)
  try {
    if (!(await rateLimit(`ip:${ipHash}`, 600, 600)))
      throw new HttpError(429, 'rate_limited', 'Too many requests. Please wait a moment and try again.')

    const declared = Number(req.headers.get('content-length') ?? 0)
    if (declared > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', 'That request is too large.')
    const raw = await req.text()
    if (raw.length > MAX_BODY_BYTES) throw new HttpError(413, 'too_large', 'That request is too large.')

    let body: unknown
    try {
      body = JSON.parse(raw)
    } catch {
      throw new HttpError(400, 'bad_request', 'Malformed request.')
    }
    const parsed = requestSchema.safeParse(body)
    if (!parsed.success) {
      const first = parsed.error.issues[0]
      throw new HttpError(400, 'invalid_request', first?.message ?? 'Invalid request.', {
        path: first?.path?.join('.'),
      })
    }

    const data = await handle(parsed.data, ipHash)
    return json({ ok: true, data }, 200, origin)
  } catch (err) {
    if (err instanceof HttpError) {
      return json({ ok: false, error: { code: err.code, message: err.message, ...err.extra } }, err.status, origin)
    }
    console.error('unhandled', err)
    return json({ ok: false, error: { code: 'server_error', message: 'Something went wrong. Please try again.' } }, 500, origin)
  }
})
