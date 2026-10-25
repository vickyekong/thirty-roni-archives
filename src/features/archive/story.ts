import { extensionFor, forgetSignedUrl, MAX_ARCHIVE_BYTES, mediaKindFor, probeMedia } from '@/lib/media'
import { supabase } from '@/lib/supabase'
import type { ExpMedia } from '@/features/experience/data'

/**
 * Roni's Continuing Story. Everything here lives in her own `continuing_story` collection;
 * row-level security only lets her write to that collection (and only after launch), so
 * nothing in this module can touch the Original Thirty.
 */

export type EntryKind = 'memory' | 'moment' | 'milestone' | 'reflection'

export const KINDS: { kind: EntryKind; label: string; plural: string; add: string }[] = [
  { kind: 'memory', label: 'Memory', plural: 'Memories', add: 'Add a memory' },
  { kind: 'moment', label: 'Moment', plural: 'Moments', add: 'Add photos or videos' },
  { kind: 'milestone', label: 'Milestone', plural: 'Milestones', add: 'Add a milestone' },
  { kind: 'reflection', label: 'Reflection', plural: 'Reflections', add: 'Write a reflection' },
]

export const kindLabel = (k: EntryKind) => KINDS.find((x) => x.kind === k)!.label

export type StoryMedia = ExpMedia

export type StoryEntry = {
  id: string
  kind: EntryKind
  title: string
  body: string
  year: number | null
  sortOrder: number
  createdAt: string
  mediaIds: string[]
}

export type Story = { entries: StoryEntry[]; media: Record<string, StoryMedia> }

export const LIMITS = { title: 200, memoryBody: 20000, milestoneBody: 8000, files: 20, alt: 1000 }
export const FIRST_YEAR = 1996
export const LAST_YEAR = 2100

const MEDIA_COLUMNS = 'id, bucket, storage_path, kind, mime_type, alt_text, caption, transcript, width, height'
const MEMORY_KINDS = new Set<EntryKind>(['memory', 'moment', 'reflection'])
const bySort = (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order

export const isMilestone = (k: EntryKind) => k === 'milestone'

/** Creates Roni's collection on first visit. The database refuses before launch or for anyone else. */
export async function ensureCollection(): Promise<string> {
  const { data, error } = await supabase.rpc('ensure_my_collection')
  if (error || !data) throw error ?? new Error('No collection')
  return data as string
}

export async function loadStory(collectionId: string): Promise<Story> {
  const [memories, milestones, media] = await Promise.all([
    supabase
      .from('memories')
      .select('id, title, story, year, category, sort_order, created_at, memory_media(media_id, sort_order)')
      .eq('collection_id', collectionId),
    supabase
      .from('timeline_milestones')
      .select('id, title, description, year, sort_order, created_at, milestone_media(media_id, sort_order)')
      .eq('collection_id', collectionId),
    supabase.from('media_assets').select(MEDIA_COLUMNS).eq('collection_id', collectionId).eq('status', 'verified'),
  ])
  for (const r of [memories, milestones, media]) if (r.error) throw r.error

  const entries: StoryEntry[] = [
    ...(memories.data ?? []).map((m) => ({
      id: m.id as string,
      kind: (MEMORY_KINDS.has(m.category as EntryKind) ? m.category : 'memory') as EntryKind,
      title: m.title as string,
      body: (m.story as string | null) ?? '',
      year: m.year as number | null,
      sortOrder: m.sort_order as number,
      createdAt: m.created_at as string,
      mediaIds: [...(m.memory_media ?? [])].sort(bySort).map((x) => x.media_id as string),
    })),
    ...(milestones.data ?? []).map((m) => ({
      id: m.id as string,
      kind: 'milestone' as const,
      title: m.title as string,
      body: (m.description as string | null) ?? '',
      year: m.year as number,
      sortOrder: m.sort_order as number,
      createdAt: m.created_at as string,
      mediaIds: [...(m.milestone_media ?? [])].sort(bySort).map((x) => x.media_id as string),
    })),
  ].sort((a, b) => a.sortOrder - b.sortOrder || b.createdAt.localeCompare(a.createdAt))

  return { entries, media: Object.fromEntries(((media.data ?? []) as StoryMedia[]).map((m) => [m.id, m])) }
}

export type NewFile = { key: string; file: File; preview: string; alt: string }

export type Draft = {
  kind: EntryKind
  title: string
  body: string
  year: string
  /** Existing media to keep, in display order. */
  keep: string[]
  /** Existing media whose description changed. */
  altEdits: Record<string, string>
  added: NewFile[]
}

export function validateFile(file: File): string | null {
  const kind = mediaKindFor(file.type)
  if (kind !== 'image' && kind !== 'video') return `${file.name}: only photos and videos can be added here.`
  if (file.size === 0) return `${file.name}: the file is empty.`
  if (file.size > MAX_ARCHIVE_BYTES) return `${file.name}: larger than 50 MB.`
  return null
}

async function uploadOne(item: NewFile, collectionId: string, userId: string) {
  const kind = mediaKindFor(item.file.type) as 'image' | 'video'
  const path = `continuing/${userId}/${crypto.randomUUID()}.${extensionFor(item.file)}`
  const meta = await probeMedia(item.file, kind)
  const { error: upErr } = await supabase.storage.from('archive').upload(path, item.file, { contentType: item.file.type, upsert: false })
  if (upErr) throw new Error(`${item.file.name} could not be uploaded.`)
  const { data, error } = await supabase
    .from('media_assets')
    .insert({
      bucket: 'archive',
      storage_path: path,
      kind,
      purpose: kind === 'image' ? 'photo' : 'video',
      status: 'verified',
      verified_at: new Date().toISOString(),
      mime_type: item.file.type,
      size_bytes: item.file.size,
      original_filename: item.file.name.slice(0, 255),
      width: meta.width ?? null,
      height: meta.height ?? null,
      duration_seconds: meta.duration ? Math.round(meta.duration * 100) / 100 : null,
      alt_text: item.alt.trim().slice(0, LIMITS.alt) || null,
      collection_id: collectionId,
      uploaded_by: userId,
    })
    .select('id')
    .single()
  if (error || !data) {
    await supabase.storage.from('archive').remove([path])
    throw new Error(`${item.file.name} could not be saved.`)
  }
  return { id: data.id as string, kind }
}

/** Rows go first: a leftover file is invisible, but a row without its file would show as broken. */
async function removeMedia(ids: string[], media: Record<string, StoryMedia>) {
  const rows = ids.map((id) => media[id]).filter((m): m is StoryMedia => Boolean(m))
  if (!rows.length) return
  const { error } = await supabase.from('media_assets').delete().in('id', rows.map((m) => m.id))
  if (error) return
  rows.forEach(forgetSignedUrl)
  await supabase.storage.from('archive').remove(rows.map((m) => m.storage_path))
}

const yearOf = (value: string) => {
  const n = Number(value)
  return value.trim() && Number.isInteger(n) ? n : null
}

export function validateDraft(d: Draft): Partial<Record<'title' | 'body' | 'year' | 'media', string>> {
  const errors: Partial<Record<'title' | 'body' | 'year' | 'media', string>> = {}
  const year = yearOf(d.year)
  const media = d.keep.length + d.added.length
  if (d.kind !== 'moment' && !d.title.trim()) errors.title = 'Give it a title.'
  if (d.kind === 'reflection' && !d.body.trim()) errors.body = 'Write a few words first.'
  if (d.kind === 'moment' && media === 0) errors.media = 'Choose at least one photo or video.'
  if (media > LIMITS.files) errors.media = `Up to ${LIMITS.files} photos and videos per entry.`
  if (d.year.trim() && (year === null || year < FIRST_YEAR || year > LAST_YEAR)) errors.year = `Use a year between ${FIRST_YEAR} and ${LAST_YEAR}.`
  if (d.kind === 'milestone' && year === null && !errors.year) errors.year = 'Milestones need a year.'
  return errors
}

function defaultTitle(d: Draft) {
  if (d.title.trim()) return d.title.trim()
  return `Moments from ${new Intl.DateTimeFormat('en-GB', { dateStyle: 'long', timeZone: 'Africa/Lagos' }).format(new Date())}`
}

/**
 * Saves a new or edited entry. New files are uploaded first; if anything fails, files
 * uploaded in this attempt are removed again so nothing is left half-saved.
 */
export async function saveEntry({
  draft,
  existing,
  collectionId,
  userId,
  story,
  topSortOrder,
}: {
  draft: Draft
  existing: StoryEntry | null
  collectionId: string
  userId: string
  story: Story
  topSortOrder: number
}) {
  const added: { id: string; kind: 'image' | 'video' }[] = []
  const uploaded = () => added.map((a) => a.id)
  try {
    for (const item of draft.added) added.push(await uploadOne(item, collectionId, userId))
  } catch (e) {
    await removeUploaded(uploaded())
    throw e
  }
  const mediaIds = [...draft.keep, ...uploaded()]
  const kindOf = (m: string) => story.media[m]?.kind ?? added.find((a) => a.id === m)?.kind
  const year = yearOf(draft.year)
  const title = defaultTitle(draft).slice(0, LIMITS.title)
  const milestone = isMilestone(draft.kind)

  try {
    let id = existing?.id ?? null
    if (milestone) {
      const firstImage = mediaIds.find((m) => kindOf(m) === 'image') ?? null
      const row = {
        title,
        description: draft.body.trim() || null,
        year: year!,
        chapter: 'thirty' as const,
        featured_media_id: firstImage,
      }
      if (id) {
        const { error } = await supabase.from('timeline_milestones').update(row).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('timeline_milestones')
          .insert({ ...row, collection_id: collectionId, created_by: userId, sort_order: topSortOrder })
          .select('id')
          .single()
        if (error || !data) throw error
        id = data.id as string
      }
      await relink('milestone_media', 'milestone_id', id, mediaIds)
    } else {
      const row = {
        title,
        story: draft.body.trim() || null,
        year,
        date_precision: year ? ('specific_year' as const) : ('unknown' as const),
        category: draft.kind,
      }
      if (id) {
        const { error } = await supabase.from('memories').update(row).eq('id', id)
        if (error) throw error
      } else {
        const { data, error } = await supabase
          .from('memories')
          .insert({ ...row, collection_id: collectionId, created_by: userId, sort_order: topSortOrder })
          .select('id')
          .single()
        if (error || !data) throw error
        id = data.id as string
      }
      await relink('memory_media', 'memory_id', id, mediaIds)
    }
  } catch {
    await removeUploaded(uploaded())
    throw new Error('Your entry could not be saved. Please try again.')
  }

  for (const [mediaId, alt] of Object.entries(draft.altEdits)) {
    if (draft.keep.includes(mediaId)) await supabase.from('media_assets').update({ alt_text: alt.trim().slice(0, LIMITS.alt) || null }).eq('id', mediaId)
  }
  const dropped = existing ? existing.mediaIds.filter((m) => !draft.keep.includes(m)) : []
  await removeMedia(dropped, story.media)
}

async function removeUploaded(ids: string[]) {
  if (!ids.length) return
  const { data } = await supabase.from('media_assets').delete().in('id', ids).select('storage_path')
  if (data?.length) await supabase.storage.from('archive').remove(data.map((m) => m.storage_path as string))
}

async function relink(table: 'memory_media' | 'milestone_media', key: 'memory_id' | 'milestone_id', id: string, mediaIds: string[]) {
  const { error: delErr } = await supabase.from(table).delete().eq(key, id)
  if (delErr) throw delErr
  if (!mediaIds.length) return
  const { error } = await supabase.from(table).insert(mediaIds.map((media_id, i) => ({ [key]: id, media_id, sort_order: i })))
  if (error) throw error
}

export async function deleteEntry(entry: StoryEntry, story: Story) {
  const { error } = await supabase
    .from(isMilestone(entry.kind) ? 'timeline_milestones' : 'memories')
    .delete()
    .eq('id', entry.id)
  if (error) throw new Error('This entry could not be deleted. Please try again.')
  await removeMedia(entry.mediaIds, story.media)
}

/** Persists a new arrangement, writing only the entries whose position changed. */
export async function saveOrder(next: StoryEntry[]) {
  const changed = next.map((e, i) => ({ e, i })).filter(({ e, i }) => e.sortOrder !== i)
  const results = await Promise.all(
    changed.map(({ e, i }) =>
      supabase
        .from(isMilestone(e.kind) ? 'timeline_milestones' : 'memories')
        .update({ sort_order: i })
        .eq('id', e.id),
    ),
  )
  if (results.some((r) => r.error)) throw new Error('The new order could not be saved.')
}
