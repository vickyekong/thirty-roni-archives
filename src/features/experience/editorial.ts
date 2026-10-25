import { z } from 'zod'

// The CSP has no 'unsafe-eval'; without this Zod probes `new Function` and logs a violation.
z.config({ jitless: true })

// Editorial slots stored in `experience_content`. Defaults are the presentation copy from
// the creative brief (titles, taglines); they contain no memories or biographical facts.
// Anything personal (Roni Times stories, awards, final message) starts empty and must be
// written by the curator.

const text = (max: number) => z.string().max(max).catch('')
const uuid = z.uuid().nullable().catch(null)

export const openingSchema = z.object({
  year: text(4).default('1996'),
  lines: z.array(text(200)).max(5).catch([]),
  name: text(40),
  tagline: text(120),
})

export const finaleSchema = z.object({
  heading: text(120),
  lines: z.array(text(200)).max(5).catch([]),
  finalMessage: text(4000),
  finalSignature: text(160),
})

const story = z.object({ title: text(200), body: text(8000), byline: text(160), mediaId: uuid })

export const timesSchema = z.object({
  masthead: text(80),
  edition: text(120),
  dateline: text(120),
  headline: text(200),
  standfirst: text(600),
  coverStory: story.catch({ title: '', body: '', byline: '', mediaId: null }),
  thirtyThings: z.array(text(300)).max(30).catch([]),
  familyMemories: z.array(story).max(12).catch([]),
  friendshipChronicles: z.array(story).max(12).catch([]),
  awards: z.array(z.object({ title: text(160), citation: text(1000) })).max(20).catch([]),
  forecast: text(2000),
  photoFeatures: z.array(z.object({ mediaId: uuid, caption: text(400) })).max(12).catch([]),
})

export const musicSchema = z.object({
  mediaId: uuid,
  title: text(200),
  credit: text(200),
})

const uuids = (max: number) => z.array(z.uuid()).max(max).catch([])

const momentSchema = z.object({
  /** Stable handle; the four defaults use it to collect unassigned memories. */
  key: text(40),
  marker: text(40),
  title: text(200),
  description: text(1000),
  memoryIds: uuids(40),
  mediaIds: uuids(12),
  narrationId: uuid,
  hidden: z.boolean().catch(false),
})

export const chapterOneSchema = z.object({
  intro: text(2000),
  /** First entry is the large photograph; the next two overlap it. Empty slots fall back to the chapter's own photos. */
  album: z.array(z.object({ mediaId: uuid, caption: text(200) })).max(3).catch([]),
  moments: z.array(momentSchema).max(8).catch([]),
  /** Approved Chapter One memories not assigned to a moment are placed automatically unless left out here. */
  autoCollect: z.boolean().catch(true),
  excludedMemoryIds: uuids(200),
  familyMessages: z.array(z.object({ kind: z.enum(['person', 'letter']), id: z.uuid() })).max(3).catch([]),
})

export type OpeningContent = z.infer<typeof openingSchema>
export type FinaleContent = z.infer<typeof finaleSchema>
export type TimesContent = z.infer<typeof timesSchema>
export type TimesStory = z.infer<typeof story>
export type MusicContent = z.infer<typeof musicSchema>
export type ChapterOneContent = z.infer<typeof chapterOneSchema>
export type ChapterOneMoment = z.infer<typeof momentSchema>

export const DEFAULT_OPENING: OpeningContent = {
  year: '1996',
  lines: ['Every story begins somewhere.', 'Some stories become unforgettable.', 'Thirty years ago, one remarkable story began.'],
  name: 'RONI',
  tagline: 'THIRTY YEARS OF BECOMING.',
}

export const DEFAULT_FINALE: FinaleContent = {
  heading: 'HAPPY 30TH BIRTHDAY, RONI.',
  lines: ['Thirty years of stories.', 'Thirty years of becoming.', 'And a lifetime of beautiful possibilities ahead.'],
  finalMessage: '',
  finalSignature: '',
}

export const DEFAULT_TIMES: TimesContent = {
  masthead: 'THE RONI TIMES',
  edition: 'SPECIAL 30TH BIRTHDAY EDITION',
  dateline: 'Thursday, 3 December 2026',
  headline: 'LOCAL ICON TURNS THIRTY.',
  standfirst: '',
  coverStory: { title: '', body: '', byline: '', mediaId: null },
  thirtyThings: [],
  familyMemories: [],
  friendshipChronicles: [],
  awards: [],
  forecast: '',
  photoFeatures: [],
}

export const DEFAULT_MUSIC: MusicContent = { mediaId: null, title: '', credit: '' }

const moment = (key: string, marker: string, title: string, description: string): ChapterOneMoment => ({
  key,
  marker,
  title,
  description,
  memoryIds: [],
  mediaIds: [],
  narrationId: null,
  hidden: false,
})

/** Editorial introductions from the brief. They frame each moment; the memories themselves come from family. */
export const DEFAULT_CHAPTER_ONE: ChapterOneContent = {
  intro:
    'Before the memories, the milestones, and the woman she would become, there was a little girl whose story was just beginning.\n\nA story filled with firsts, laughter, love, and moments that would one day become treasured memories.\n\nThis is where Roni’s story begins.',
  album: [],
  moments: [
    moment(
      'born',
      '1996',
      'A Little Star Was Born.',
      'December 3, 1996. The beginning of a story that would grow into thirty years of memories, friendships, discoveries, and beautiful moments.',
    ),
    moment('little', 'Early childhood', 'Small Steps. Big Personality.', 'Every childhood has its little adventures, unforgettable expressions, and stories that families never stop telling.'),
    moment('family', 'Childhood', 'Home Was Where the Story Began.', 'Some of the most beautiful memories are made in ordinary moments, surrounded by the people who knew us first.'),
    moment('closing', '2005', 'Already Becoming.', 'By the end of her first decade, there were already stories to tell, memories to keep, and so much more waiting to unfold.'),
  ],
  autoCollect: true,
  excludedMemoryIds: [],
  familyMessages: [],
}

/** A memory belongs to Chapter One when assigned to it, or (unassigned) when dated 2005 or earlier or marked as childhood. */
export function belongsToChapterOne(m: { chapter: string | null; year: number | null; category: string | null }) {
  if (m.chapter) return m.chapter === 'beginning'
  return m.year !== null ? m.year <= 2005 : m.category === 'childhood'
}

export const EDITORIAL = {
  opening: { schema: openingSchema, defaults: DEFAULT_OPENING },
  finale: { schema: finaleSchema, defaults: DEFAULT_FINALE },
  roni_times: { schema: timesSchema, defaults: DEFAULT_TIMES },
  music: { schema: musicSchema, defaults: DEFAULT_MUSIC },
  chapter_one: { schema: chapterOneSchema, defaults: DEFAULT_CHAPTER_ONE },
} as const

export type EditorialKey = keyof typeof EDITORIAL

/** Parses stored JSON, falling back to defaults field-by-field for anything missing or malformed. */
export function parseEditorial<K extends EditorialKey>(key: K, raw: unknown): (typeof EDITORIAL)[K]['defaults'] {
  const { schema, defaults } = EDITORIAL[key]
  const merged = { ...defaults, ...(raw && typeof raw === 'object' ? raw : {}) }
  const parsed = schema.safeParse(merged)
  return (parsed.success ? parsed.data : defaults) as (typeof EDITORIAL)[K]['defaults']
}

export const timesHasStories = (t: TimesContent) =>
  Boolean(
    t.standfirst.trim() ||
      t.coverStory.body.trim() ||
      t.thirtyThings.some((x) => x.trim()) ||
      t.familyMemories.length ||
      t.friendshipChronicles.length ||
      t.awards.length ||
      t.forecast.trim() ||
      t.photoFeatures.length,
  )
