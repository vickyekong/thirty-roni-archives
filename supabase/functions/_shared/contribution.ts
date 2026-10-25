// Shared between the browser (Vite) and the `contribute` edge function (Deno).
// Keep this file dependency-free apart from zod.
import { z } from 'zod'

// The site's CSP has no 'unsafe-eval'; without this Zod probes `new Function` and logs a violation.
z.config({ jitless: true })

export const CONTRIBUTOR_CATEGORIES = ['parent', 'sibling', 'friend'] as const
export const NAME_VISIBILITY = ['full_name', 'first_name', 'anonymous'] as const
export const MESSAGE_VISIBILITY = ['everyone', 'roni_only', 'curator_only'] as const
export const DATE_PRECISION = ['specific_year', 'approximate_year', 'life_stage', 'unknown'] as const
export const LIFE_STAGES = ['early_childhood', 'childhood', 'teens', 'twenties', 'recent'] as const
export const MEDIA_PURPOSES = ['profile_photo', 'photo', 'video', 'voice'] as const

export type ContributorCategory = (typeof CONTRIBUTOR_CATEGORIES)[number]
export type NameVisibility = (typeof NAME_VISIBILITY)[number]
export type MessageVisibility = (typeof MESSAGE_VISIBILITY)[number]
export type DatePrecision = (typeof DATE_PRECISION)[number]
export type LifeStage = (typeof LIFE_STAGES)[number]
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number]

export const BIRTH_YEAR = 1996
export const THIRTIETH_YEAR = 2026

export const CATEGORY_QUESTION_KEYS = {
  parent: ['birthDay', 'childhoodPersonality', 'childhoodMemories', 'milestones', 'lessons', 'hopes'],
  sibling: ['adventures', 'traditions', 'funnyMemories', 'insideJokes', 'admireToday'],
  friend: ['howWeMet', 'firstImpressions', 'sharedExperiences', 'friendshipMoments', 'nextDecadeHopes'],
} as const satisfies Record<ContributorCategory, readonly string[]>

const ALL_CATEGORY_KEYS = [
  ...CATEGORY_QUESTION_KEYS.parent,
  ...CATEGORY_QUESTION_KEYS.sibling,
  ...CATEGORY_QUESTION_KEYS.friend,
] as const
export type CategoryQuestionKey = (typeof ALL_CATEGORY_KEYS)[number]

export const LIMITS = {
  name: 120,
  short: 300,
  word: 40,
  answer: 5000,
  message: 6000,
  letter: 20000,
} as const

const text = (max: number) => z.string().max(max).default('')

export const payloadSchema = z.strictObject({
  introduction: z
    .strictObject({ fullName: text(LIMITS.name), relationship: text(LIMITS.name) })
    .prefault({}),
  memories: z
    .strictObject({
      earliest: text(LIMITS.answer),
      favourite: text(LIMITS.answer),
      unknownFact: text(LIMITS.answer),
      funniest: text(LIMITS.answer),
    })
    .prefault({}),
  categoryAnswers: z.partialRecord(z.enum(ALL_CATEGORY_KEYS), z.string().max(LIMITS.answer)).default({}),
  celebrating: z
    .strictObject({
      specialThings: z.array(z.string().max(LIMITS.short)).max(3).default([]),
      admire: text(LIMITS.answer),
      threeWords: z.array(z.string().max(LIMITS.word)).max(3).default([]),
    })
    .prefault({}),
  message: z
    .strictObject({ turningThirty: text(LIMITS.message), nextDecadeWish: text(LIMITS.answer) })
    .prefault({}),
  letter: z.strictObject({ body: text(LIMITS.letter) }).prefault({}),
  timeline: z
    .strictObject({
      precision: z.enum(DATE_PRECISION).nullable().default(null),
      year: z.number().int().min(BIRTH_YEAR).max(THIRTIETH_YEAR).nullable().default(null),
      lifeStage: z.enum(LIFE_STAGES).nullable().default(null),
    })
    .prefault({}),
  consent: z
    .strictObject({
      permission: z.boolean().default(false),
      nameVisibility: z.enum(NAME_VISIBILITY).default('full_name'),
      messageVisibility: z.enum(MESSAGE_VISIBILITY).default('everyone'),
    })
    .prefault({}),
})

export type ContributionPayload = z.output<typeof payloadSchema>

export function emptyPayload(init?: { fullName?: string; relationship?: string }): ContributionPayload {
  return payloadSchema.parse({
    introduction: { fullName: init?.fullName ?? '', relationship: init?.relationship ?? '' },
  })
}

const trimAll = (values: string[]) => values.map((v) => v.trim()).filter(Boolean)

export function normalizeForSubmission(p: ContributionPayload): ContributionPayload {
  const categoryAnswers: ContributionPayload['categoryAnswers'] = {}
  for (const [key, value] of Object.entries(p.categoryAnswers)) {
    const trimmed = value?.trim()
    if (trimmed) categoryAnswers[key as CategoryQuestionKey] = trimmed
  }
  const timeline = { ...p.timeline }
  if (timeline.precision !== 'specific_year' && timeline.precision !== 'approximate_year') timeline.year = null
  if (timeline.precision !== 'life_stage') timeline.lifeStage = null

  return {
    introduction: {
      fullName: p.introduction.fullName.trim(),
      relationship: p.introduction.relationship.trim(),
    },
    memories: {
      earliest: p.memories.earliest.trim(),
      favourite: p.memories.favourite.trim(),
      unknownFact: p.memories.unknownFact.trim(),
      funniest: p.memories.funniest.trim(),
    },
    categoryAnswers,
    celebrating: {
      specialThings: trimAll(p.celebrating.specialThings),
      admire: p.celebrating.admire.trim(),
      threeWords: trimAll(p.celebrating.threeWords),
    },
    message: {
      turningThirty: p.message.turningThirty.trim(),
      nextDecadeWish: p.message.nextDecadeWish.trim(),
    },
    letter: { body: p.letter.body.trim() },
    timeline,
    consent: p.consent,
  }
}

export function hasWrittenContent(p: ContributionPayload): boolean {
  const n = normalizeForSubmission(p)
  return [
    ...Object.values(n.memories),
    ...Object.values(n.categoryAnswers),
    n.celebrating.admire,
    ...n.celebrating.specialThings,
    ...n.celebrating.threeWords,
    n.message.turningThirty,
    n.message.nextDecadeWish,
    n.letter.body,
  ].some((v) => Boolean(v))
}

export type SubmissionIssue = { step: StepKey; message: string }

/** Returns an empty array when the contribution is ready to submit. */
export function validateForSubmission(p: ContributionPayload, verifiedMediaCount: number): SubmissionIssue[] {
  const issues: SubmissionIssue[] = []
  const n = normalizeForSubmission(p)
  if (!n.introduction.fullName) issues.push({ step: 'introduction', message: 'Please tell us your name.' })
  if (!n.introduction.relationship)
    issues.push({ step: 'introduction', message: 'Please tell us how you know Roni.' })
  if (!hasWrittenContent(p) && verifiedMediaCount === 0)
    issues.push({ step: 'memories', message: 'Share at least one memory, message, letter or photograph.' })
  if ((n.timeline.precision === 'specific_year' || n.timeline.precision === 'approximate_year') && !n.timeline.year)
    issues.push({ step: 'timeline', message: 'Choose the year, or select “I’m not sure”.' })
  if (n.timeline.precision === 'life_stage' && !n.timeline.lifeStage)
    issues.push({ step: 'timeline', message: 'Choose a stage of life, or select “I’m not sure”.' })
  if (!n.consent.permission)
    issues.push({ step: 'consent', message: 'Please confirm you have permission to share what you uploaded.' })
  return issues
}

export const STEP_KEYS = [
  'introduction',
  'memories',
  'celebrating',
  'message',
  'media',
  'timeline',
  'consent',
  'review',
] as const
export type StepKey = (typeof STEP_KEYS)[number]

export type ChapterKey = 'beginning' | 'becoming' | 'finding_her_way' | 'thirty'

export function suggestChapter(t: ContributionPayload['timeline']): ChapterKey | null {
  if (t.year) {
    if (t.year <= 2005) return 'beginning'
    if (t.year <= 2015) return 'becoming'
    if (t.year <= 2025) return 'finding_her_way'
    return 'thirty'
  }
  switch (t.lifeStage) {
    case 'early_childhood':
    case 'childhood':
      return 'beginning'
    case 'teens':
      return 'becoming'
    case 'twenties':
    case 'recent':
      return 'finding_her_way'
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Media rules
// ---------------------------------------------------------------------------
const MB = 1024 * 1024

export const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] as const
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/quicktime', 'video/webm'] as const
export const AUDIO_MIME_TYPES = [
  'audio/mpeg',
  'audio/mp4',
  'audio/x-m4a',
  'audio/aac',
  'audio/webm',
  'audio/ogg',
  'audio/wav',
  'audio/x-wav',
] as const

type MediaRule = {
  kind: 'image' | 'video' | 'audio'
  maxCount: number
  maxBytes: number
  mimeTypes: readonly string[]
}

// The 50 MB ceiling matches the Supabase Free plan's per-file upload limit.
export const MEDIA_RULES: Record<MediaPurpose, MediaRule> = {
  profile_photo: { kind: 'image', maxCount: 1, maxBytes: 15 * MB, mimeTypes: IMAGE_MIME_TYPES },
  photo: { kind: 'image', maxCount: 10, maxBytes: 25 * MB, mimeTypes: IMAGE_MIME_TYPES },
  video: { kind: 'video', maxCount: 1, maxBytes: 50 * MB, mimeTypes: VIDEO_MIME_TYPES },
  voice: { kind: 'audio', maxCount: 1, maxBytes: 20 * MB, mimeTypes: AUDIO_MIME_TYPES },
}

export const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/x-m4a': 'm4a',
  'audio/aac': 'aac',
  'audio/webm': 'weba',
  'audio/ogg': 'ogg',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
}

/** Strips codec parameters ("audio/webm;codecs=opus" → "audio/webm") and lower-cases. */
export function baseMimeType(mime: string): string {
  return (mime.split(';')[0] ?? '').trim().toLowerCase()
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < MB) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / MB).toFixed(bytes < 10 * MB ? 1 : 0)} MB`
}
