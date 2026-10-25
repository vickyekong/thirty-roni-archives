import { createContext, use, useCallback, useEffect, useState } from 'react'
import { signMedia, type MediaRef } from '@/lib/media'
import { supabase } from '@/lib/supabase'
import {
  DEFAULT_FINALE,
  DEFAULT_MUSIC,
  DEFAULT_OPENING,
  DEFAULT_TIMES,
  parseEditorial,
  timesHasStories,
  type FinaleContent,
  type MusicContent,
  type OpeningContent,
  type TimesContent,
} from './editorial'

export type ChapterKey = 'beginning' | 'becoming' | 'finding_her_way' | 'thirty'

export type ExpMedia = MediaRef & {
  kind: 'image' | 'video' | 'audio' | 'document'
  mime_type: string
  alt_text: string | null
  caption: string | null
  transcript: string | null
  width: number | null
  height: number | null
}

/** Where an item came from. Only loaded for curators, to label the preview. */
export type Source = {
  sample: boolean
  contributor: string | null
  relationship: string | null
  contributionId: string | null
}

export type Chapter = {
  key: ChapterKey
  kicker: string
  title: string
  period: string
  description: string | null
  startYear: number
  endYear: number
}

export type Milestone = {
  id: string
  chapter: ChapterKey
  year: number
  age: number | null
  title: string
  description: string | null
  featuredId: string | null
  photoIds: string[]
  memoryIds: string[]
  source?: Source
}

export type Memory = {
  id: string
  title: string
  story: string | null
  caption: string | null
  year: number | null
  approximate: boolean
  chapter: ChapterKey | null
  category: string | null
  attribution: string | null
  featured: boolean
  mediaIds: string[]
  source?: Source
}

export type Person = {
  id: string
  name: string
  relationship: string | null
  message: string | null
  tone: string | null
  portraitId: string | null
  voiceId: string | null
  videoId: string | null
  source?: Source
}

export type Wish = { id: string; author: string | null; message: string; star: number | null; final: boolean; source?: Source }

export type Letter = {
  id: string
  author: string | null
  salutation: string | null
  body: string
  voiceId: string | null
  photoId: string | null
  featured: boolean
  source?: Source
}

export type Experience = {
  chapters: Chapter[]
  milestones: Milestone[]
  memories: Memory[]
  people: Person[]
  wishes: Wish[]
  letters: Letter[]
  opening: OpeningContent
  finale: FinaleContent
  /** Null when the Roni Times is unpublished or has nothing written in it. */
  times: TimesContent | null
  music: MusicContent | null
  media: Record<string, ExpMedia>
  /** Editorial slots currently filled with sample copy (curators only). */
  sampleEditorial: string[]
}

/** Presentation copy from the brief. Used when a chapter row has not been published. */
export const CHAPTER_DEFAULTS: Chapter[] = [
  { key: 'beginning', kicker: 'Chapter One — The Beginning', title: 'Before the world knew her name.', period: '1996–2005', description: null, startYear: 1996, endYear: 2005 },
  { key: 'becoming', kicker: 'Chapter Two — The Becoming', title: 'Somewhere between dreams and discoveries.', period: '2006–2015', description: null, startYear: 2006, endYear: 2015 },
  { key: 'finding_her_way', kicker: 'Chapter Three — Finding Her Way', title: 'The woman she became.', period: '2016–2025', description: null, startYear: 2016, endYear: 2025 },
  { key: 'thirty', kicker: 'Chapter Four — Thirty', title: 'The next chapter begins.', period: '2026', description: null, startYear: 2026, endYear: 2026 },
]

export const MEMORY_CATEGORIES = [
  { value: 'childhood', label: 'Childhood' },
  { value: 'family', label: 'Family' },
  { value: 'friendship', label: 'Friendship' },
  { value: 'funny', label: 'Funny moments' },
  { value: 'milestone', label: 'Milestones' },
  { value: 'travel', label: 'Travel & adventures' },
  { value: 'celebration', label: 'Celebrations' },
  { value: 'reflection', label: 'Reflections' },
] as const

export const categoryLabel = (value: string) => MEMORY_CATEGORIES.find((c) => c.value === value)?.label ?? value

const MEDIA_COLUMNS = 'id, bucket, storage_path, kind, mime_type, alt_text, caption, transcript, width, height'
const bySort = (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order

async function loadMedia(ids: string[]) {
  const unique = [...new Set(ids)]
  const out: Record<string, ExpMedia> = {}
  for (let i = 0; i < unique.length; i += 100) {
    // Published + verified only, so a curator's preview shows exactly what Roni will see.
    const { data, error } = await supabase
      .from('media_assets')
      .select(MEDIA_COLUMNS)
      .in('id', unique.slice(i, i + 100))
      .eq('is_published', true)
      .eq('status', 'verified')
    if (error) throw error
    for (const m of (data ?? []) as ExpMedia[]) out[m.id] = m
  }
  return out
}

type SourceRow = { is_sample: boolean; contribution_id?: string | null; contributor_id?: string | null }
type ContributorName = { full_name: string; relationship: string | null }

/**
 * Loads the published Original Thirty. Row-level security already limits what each viewer
 * may read; the explicit `is_published` filters keep a curator's preview identical to
 * Roni's view, because curators can read drafts too.
 *
 * `curator` adds clearly labelled sample content and where each item came from. Samples are
 * also hidden from everyone else by row-level security.
 */
export async function loadExperience({ curator = false }: { curator?: boolean } = {}): Promise<Experience> {
  const { data: collection, error: collectionError } = await supabase
    .from('archive_collections')
    .select('id')
    .eq('kind', 'original_thirty')
    .single()
  if (collectionError || !collection) throw collectionError ?? new Error('Archive not found')
  const cid = collection.id as string

  const samples = curator ? [true, false] : [false]

  const [chapters, milestones, memories, people, wishes, letters, content] = await Promise.all([
    supabase.from('chapters').select('key, kicker, title, period_label, description, start_year, end_year, sort_order').eq('is_published', true),
    supabase
      .from('timeline_milestones')
      .select('id, chapter, year, age, title, description, featured_media_id, sort_order, is_sample, milestone_media(media_id, sort_order), milestone_memories(memory_id, sort_order)')
      .eq('collection_id', cid)
      .eq('is_published', true)
      .in('is_sample', samples)
      .order('year')
      .order('sort_order'),
    supabase
      .from('memories')
      .select('id, title, story, caption, year, date_precision, chapter, category, attribution, is_featured, sort_order, is_sample, contribution_id, contributor_id, memory_media(media_id, sort_order)')
      .eq('collection_id', cid)
      .eq('is_published', true)
      .in('is_sample', samples)
      .order('sort_order')
      .order('year', { nullsFirst: false }),
    supabase
      .from('contributor_profiles')
      .select('id, display_name, relationship_label, message, tone, portrait_media_id, voice_media_id, video_media_id, is_sample, contributor_id')
      .eq('is_published', true)
      .in('is_sample', samples)
      .order('sort_order'),
    supabase
      .from('birthday_wishes')
      .select('id, author_display, message, star_index, is_final_star, is_sample, contribution_id, contributor_id')
      .eq('collection_id', cid)
      .eq('is_published', true)
      .in('is_sample', samples)
      .order('star_index', { nullsFirst: false }),
    supabase
      .from('letters')
      .select('id, author_display, salutation, body, voice_media_id, photo_media_id, is_featured, sort_order, is_sample, contribution_id, contributor_id')
      .eq('collection_id', cid)
      .eq('is_published', true)
      .in('is_sample', samples)
      .order('sort_order'),
    supabase.from('experience_content').select('key, content, is_sample').eq('is_published', true).in('is_sample', samples),
  ])
  for (const r of [chapters, milestones, memories, people, wishes, letters, content]) if (r.error) throw r.error

  // Contributors' real names (they may be shown differently, or not at all) are for curators only.
  const names = new Map<string, ContributorName>()
  if (curator) {
    const ids = [...new Set([memories, people, wishes, letters].flatMap((r) => (r.data ?? []).map((x) => x.contributor_id as string | null)))]
    const { data: rows } = await supabase
      .from('contributors')
      .select('id, full_name, relationship')
      .in('id', ids.filter((x): x is string => Boolean(x)))
    for (const c of rows ?? []) names.set(c.id as string, c as ContributorName)
  }
  const tag = (row: SourceRow): Source | undefined => {
    if (!curator) return undefined
    const who = row.contributor_id ? names.get(row.contributor_id) : undefined
    return { sample: row.is_sample, contributor: who?.full_name ?? null, relationship: who?.relationship ?? null, contributionId: row.contribution_id ?? null }
  }
  const editorial = new Map((content.data ?? []).map((row) => [row.key as string, row.content as unknown]))
  const opening = editorial.has('opening') ? parseEditorial('opening', editorial.get('opening')) : DEFAULT_OPENING
  const finale = editorial.has('finale') ? parseEditorial('finale', editorial.get('finale')) : DEFAULT_FINALE
  const rawTimes = editorial.has('roni_times') ? parseEditorial('roni_times', editorial.get('roni_times')) : null
  const times = rawTimes && timesHasStories(rawTimes) ? { ...DEFAULT_TIMES, ...rawTimes } : null
  const rawMusic = editorial.has('music') ? parseEditorial('music', editorial.get('music')) : DEFAULT_MUSIC
  const music = rawMusic.mediaId ? rawMusic : null

  const publishedChapters = new Map((chapters.data ?? []).map((c) => [c.key as ChapterKey, c]))
  const chapterList: Chapter[] = CHAPTER_DEFAULTS.map((d) => {
    const row = publishedChapters.get(d.key)
    if (!row) return d
    return {
      key: d.key,
      kicker: row.kicker || d.kicker,
      title: row.title || d.title,
      period: row.period_label || d.period,
      description: row.description,
      startYear: row.start_year ?? d.startYear,
      endYear: row.end_year ?? d.endYear,
    }
  })

  const milestoneList: Milestone[] = (milestones.data ?? []).map((m) => ({
    id: m.id,
    chapter: m.chapter as ChapterKey,
    year: m.year,
    age: m.age,
    title: m.title,
    description: m.description,
    featuredId: m.featured_media_id,
    photoIds: [...(m.milestone_media ?? [])].sort(bySort).map((x) => x.media_id as string),
    memoryIds: [...(m.milestone_memories ?? [])].sort(bySort).map((x) => x.memory_id as string),
    source: tag(m),
  }))

  const memoryList: Memory[] = (memories.data ?? []).map((m) => ({
    id: m.id,
    title: m.title,
    story: m.story,
    caption: m.caption,
    year: m.year,
    approximate: m.date_precision === 'approximate_year',
    chapter: m.chapter as ChapterKey | null,
    category: m.category,
    attribution: m.attribution,
    featured: m.is_featured,
    mediaIds: [...(m.memory_media ?? [])].sort(bySort).map((x) => x.media_id as string),
    source: tag(m),
  }))

  const peopleList: Person[] = (people.data ?? []).map((p) => ({
    id: p.id,
    name: p.display_name,
    relationship: p.relationship_label,
    message: p.message,
    tone: p.tone,
    portraitId: p.portrait_media_id,
    voiceId: p.voice_media_id,
    videoId: p.video_media_id,
    source: tag(p),
  }))

  const wishList: Wish[] = (wishes.data ?? []).map((w) => ({
    id: w.id,
    author: w.author_display,
    message: w.message,
    star: w.star_index,
    final: w.is_final_star,
    source: tag(w),
  }))

  const letterList: Letter[] = (letters.data ?? []).map((l) => ({
    id: l.id,
    author: l.author_display,
    salutation: l.salutation,
    body: l.body,
    voiceId: l.voice_media_id,
    photoId: l.photo_media_id,
    featured: l.is_featured,
    source: tag(l),
  }))

  const mediaIds = [
    ...milestoneList.flatMap((m) => [m.featuredId, ...m.photoIds]),
    ...memoryList.flatMap((m) => m.mediaIds),
    ...peopleList.flatMap((p) => [p.portraitId, p.voiceId, p.videoId]),
    ...letterList.flatMap((l) => [l.voiceId, l.photoId]),
    times?.coverStory.mediaId,
    ...(times ? [...times.familyMemories, ...times.friendshipChronicles, ...times.photoFeatures].map((s) => s.mediaId) : []),
    music?.mediaId,
  ].filter((x): x is string => Boolean(x))
  const media = await loadMedia(mediaIds)

  return {
    chapters: chapterList,
    milestones: milestoneList,
    memories: memoryList,
    people: peopleList,
    wishes: wishList,
    letters: letterList,
    opening,
    finale,
    times,
    music: music && media[music.mediaId!] ? music : null,
    media,
    sampleEditorial: (content.data ?? []).filter((row) => row.is_sample).map((row) => row.key as string),
  }
}

/** The experience with nothing published: every section falls back to its placeholder. */
const EMPTY_EXPERIENCE: Experience = {
  chapters: CHAPTER_DEFAULTS,
  milestones: [],
  memories: [],
  people: [],
  wishes: [],
  letters: [],
  opening: DEFAULT_OPENING,
  finale: DEFAULT_FINALE,
  times: null,
  music: null,
  media: {},
  sampleEditorial: [],
}

// Signed URLs last an hour; refresh well before that for visitors who linger.
const RESIGN_EVERY_MS = 45 * 60 * 1000

/** `peek` never touches the database, so the public sneak peek cannot reveal any content. */
export function useExperienceData({ peek = false, curator = false }: { peek?: boolean; curator?: boolean } = {}) {
  const [data, setData] = useState<Experience | null>(peek ? EMPTY_EXPERIENCE : null)
  const [urls, setUrls] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (peek) return
    let active = true
    loadExperience({ curator })
      .then(async (exp) => {
        const signed = await signMedia(Object.values(exp.media))
        if (!active) return
        setUrls(signed)
        setData(exp)
      })
      .catch(() => active && setError('The archive could not be loaded. Please refresh to try again.'))
    return () => {
      active = false
    }
  }, [peek, curator])

  useEffect(() => {
    if (!data) return
    const id = window.setInterval(() => {
      void signMedia(Object.values(data.media)).then((next) => setUrls((prev) => ({ ...prev, ...next })))
    }, RESIGN_EVERY_MS)
    return () => window.clearInterval(id)
  }, [data])

  return { data, urls, error }
}

type ExperienceContextValue = {
  data: Experience
  urls: Record<string, string>
  /** Curator preview: empty sections show labelled placeholders that Roni never sees. */
  preview: boolean
  /** Public sneak peek before launch: placeholders only, no curator links. */
  peek: boolean
  /** Roni herself, who can carry on in her personal archive. */
  roni: boolean
}

export const ExperienceContext = createContext<ExperienceContextValue | null>(null)

export function useExperience() {
  const value = use(ExperienceContext)
  if (!value) throw new Error('useExperience must be used inside the experience')
  return value
}

/** Resolves a media id to its row and signed URL; returns null for anything unpublished. */
export function useMedia() {
  const { data, urls } = useExperience()
  return useCallback(
    (id: string | null | undefined) => {
      if (!id) return null
      const media = data.media[id]
      const url = urls[id]
      return media && url ? { ...media, url } : null
    },
    [data.media, urls],
  )
}

export type ResolvedMedia = ExpMedia & { url: string }
