import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Button, buttonClasses } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/lib/auth'
import { useSignedUrls } from '@/lib/media'
import { supabase } from '@/lib/supabase'
import { PageTitle } from './AdminLayout'
import { MediaPicker, MediaThumb, loadMediaByIds, type PickerMedia } from './MediaPicker'
import {
  Area,
  CHAPTER_OPTIONS,
  Check,
  Input,
  LockedNotice,
  MakeRealCheck,
  makeReal,
  Panel,
  Pill,
  PublishedPill,
  Select,
  chapterForYear,
  publishMedia,
  useEditParam,
  useOriginalCollection,
  type ChapterKey,
} from './kit'

type Chapter = {
  key: ChapterKey
  kicker: string | null
  title: string
  period_label: string | null
  description: string | null
  is_published: boolean
}

type Milestone = {
  id: string
  chapter: ChapterKey
  year: number
  age: number | null
  title: string
  description: string | null
  featured_media_id: string | null
  is_published: boolean
  is_sample?: boolean
  sort_order: number
  milestone_media: { media_id: string; sort_order: number }[]
  milestone_memories: { memory_id: string; sort_order: number }[]
}

type MemoryOption = { id: string; title: string; attribution: string | null; year: number | null }

export function AdminTimeline() {
  const { collection } = useOriginalCollection()
  const [chapters, setChapters] = useState<Chapter[] | null>(null)
  const [milestones, setMilestones] = useState<Milestone[] | null>(null)
  const [memories, setMemories] = useState<MemoryOption[]>([])
  const [media, setMedia] = useState<Record<string, PickerMedia>>({})
  const [editing, setEditing] = useEditParam(milestones !== null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!collection) return
    const [c, m, mem] = await Promise.all([
      supabase.from('chapters').select('key, kicker, title, period_label, description, is_published').order('sort_order'),
      supabase
        .from('timeline_milestones')
        .select('id, chapter, year, age, title, description, featured_media_id, is_published, is_sample, sort_order, milestone_media(media_id, sort_order), milestone_memories(memory_id, sort_order)')
        .eq('collection_id', collection.id)
        .order('year')
        .order('sort_order'),
      supabase.from('memories').select('id, title, attribution, year').eq('collection_id', collection.id).order('year', { nullsFirst: false }),
    ])
    if (c.error || m.error) setError('Could not load the timeline.')
    setChapters((c.data ?? []) as Chapter[])
    const rows = (m.data ?? []) as Milestone[]
    const ids = [...new Set(rows.flatMap((r) => [r.featured_media_id, ...r.milestone_media.map((x) => x.media_id)]).filter(Boolean) as string[])]
    const loaded = await loadMediaByIds(ids)
    setMedia(Object.fromEntries(loaded.map((x) => [x.id, x])))
    setMilestones(rows)
    setMemories((mem.data ?? []) as MemoryOption[])
  }, [collection])

  useEffect(() => {
    void load()
  }, [load])

  const reorder = async (chapter: ChapterKey, index: number, delta: number) => {
    const inChapter = (milestones ?? []).filter((m) => m.chapter === chapter)
    const a = inChapter[index]
    const b = inChapter[index + delta]
    if (!a || !b) return
    if (a.year !== b.year) {
      setError('Milestones are ordered by year first. Change the year to move a milestone into another year.')
      return
    }
    setError(null)
    const ordered = inChapter.filter((m) => m.year === a.year)
    const ai = ordered.indexOf(a)
    const bi = ordered.indexOf(b)
    ordered[ai] = b
    ordered[bi] = a
    await Promise.all(ordered.map((m, i) => supabase.from('timeline_milestones').update({ sort_order: i }).eq('id', m.id)))
    void load()
  }

  const locked = Boolean(collection?.is_locked)

  return (
    <>
      <PageTitle eyebrow="Story structure" title="Timeline">
        <div className="flex gap-2">
          <a href="/" target="_blank" rel="noreferrer" className={buttonClasses('secondary')}>
            Preview
          </a>
          <Button onClick={() => setEditing('new')} disabled={locked || !collection}>
            Add milestone
          </Button>
        </div>
      </PageTitle>
      <LockedNotice collection={collection} />
      {error && <Notice tone="error" className="mb-6">{error}</Notice>}

      {editing === 'new' && collection && (
        <MilestoneEditor
          collectionId={collection.id}
          milestone={null}
          memories={memories}
          media={media}
          onDone={() => {
            setEditing(null)
            void load()
          }}
        />
      )}

      {!chapters || !milestones ? (
        <Spinner label="Loading…" />
      ) : (
        <div className="flex flex-col gap-12">
          {chapters.map((chapter) => {
            const items = milestones.filter((m) => m.chapter === chapter.key)
            return (
              <section key={chapter.key} aria-labelledby={`chapter-${chapter.key}`}>
                <ChapterEditor chapter={chapter} locked={locked} onSaved={() => void load()} />
                {items.length === 0 ? (
                  <p className="mt-4 text-sm text-grey">No milestones in this chapter yet.</p>
                ) : (
                  <ol className="mt-4 flex flex-col gap-3">
                    {items.map((m, i) =>
                      editing === m.id && collection ? (
                        <li key={m.id} id={`edit-${m.id}`} className="scroll-mt-24">
                          <MilestoneEditor
                            collectionId={collection.id}
                            milestone={m}
                            memories={memories}
                            media={media}
                            onDone={() => {
                              setEditing(null)
                              void load()
                            }}
                          />
                        </li>
                      ) : (
                        <MilestoneRow
                          key={m.id}
                          milestone={m}
                          media={media}
                          locked={locked}
                          canUp={i > 0}
                          canDown={i < items.length - 1}
                          onEdit={() => setEditing(m.id)}
                          onMove={(d) => void reorder(chapter.key, i, d)}
                        />
                      ),
                    )}
                  </ol>
                )}
              </section>
            )
          })}
        </div>
      )}
    </>
  )
}

function ChapterEditor({ chapter, locked, onSaved }: { chapter: Chapter; locked: boolean; onSaved: () => void }) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(chapter)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    setBusy(true)
    setError(null)
    const { error: e } = await supabase
      .from('chapters')
      .update({
        kicker: draft.kicker?.trim() || null,
        title: draft.title.trim(),
        period_label: draft.period_label?.trim() || null,
        description: draft.description?.trim() || null,
        is_published: draft.is_published,
        updated_at: new Date().toISOString(),
      })
      .eq('key', chapter.key)
    setBusy(false)
    if (e) setError('Could not save the chapter.')
    else {
      setOpen(false)
      onSaved()
    }
  }

  return (
    <div className="border-b border-midnight-line pb-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">{chapter.kicker}</p>
          <h2 id={`chapter-${chapter.key}`} className="mt-1 font-serif text-3xl">
            {chapter.title}
          </h2>
          <p className="text-sm text-grey">{chapter.period_label}</p>
        </div>
        <div className="flex items-center gap-3">
          <PublishedPill published={chapter.is_published} />
          <Button size="sm" variant="ghost" onClick={() => setOpen((v) => !v)} disabled={locked}>
            {open ? 'Close' : 'Edit chapter'}
          </Button>
        </div>
      </div>
      {open && (
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Input label="Kicker" value={draft.kicker ?? ''} onValue={(v) => setDraft({ ...draft, kicker: v })} maxLength={120} />
          <Input label="Period" value={draft.period_label ?? ''} onValue={(v) => setDraft({ ...draft, period_label: v })} maxLength={60} />
          <Input className="sm:col-span-2" label="Title" value={draft.title} onValue={(v) => setDraft({ ...draft, title: v })} maxLength={200} />
          {chapter.key === 'beginning' ? (
            <p className="text-sm leading-relaxed text-grey sm:col-span-2">
              Chapter One’s introduction, photographs, moments and family letters are arranged in{' '}
              <Link to="/admin/editorial?tab=chapter_one" className="text-gold underline-offset-4 hover:underline">
                Editorial → Chapter One
              </Link>
              .
            </p>
          ) : (
            <Area className="sm:col-span-2" label="Introduction" hint="Optional short paragraph shown when the chapter opens." value={draft.description ?? ''} onValue={(v) => setDraft({ ...draft, description: v })} maxLength={4000} rows={2} />
          )}
          <Check label="Published" hint="Unpublished chapters still appear with their default title, but without this introduction." checked={draft.is_published} onChecked={(v) => setDraft({ ...draft, is_published: v })} />
          {error && <Notice tone="error" className="sm:col-span-2">{error}</Notice>}
          <div className="sm:col-span-2">
            <Button size="sm" onClick={() => void save()} loading={busy}>
              Save chapter
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function MilestoneRow({
  milestone: m,
  media,
  locked,
  canUp,
  canDown,
  onEdit,
  onMove,
}: {
  milestone: Milestone
  media: Record<string, PickerMedia>
  locked: boolean
  canUp: boolean
  canDown: boolean
  onEdit: () => void
  onMove: (delta: number) => void
}) {
  const featured = m.featured_media_id ? media[m.featured_media_id] : undefined
  const urls = useSignedUrls(featured ? [featured] : null)
  const photoCount = m.milestone_media.length + (m.featured_media_id ? 1 : 0)
  return (
    <li className="flex items-center gap-4 rounded-xl border border-midnight-line p-3">
      <div className="w-14 shrink-0">{featured ? <MediaThumb media={featured} url={urls[featured.id]} /> : <div className="aspect-square rounded-lg border border-dashed border-midnight-line" />}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm text-gold tabular-nums">
          {m.year}
          {m.age !== null ? ` · age ${m.age}` : ''}
        </p>
        <p className="truncate text-ivory">{m.title}</p>
        <p className="text-xs text-grey">
          {photoCount} photo{photoCount === 1 ? '' : 's'} · {m.milestone_memories.length} linked{' '}
          {m.milestone_memories.length === 1 ? 'memory' : 'memories'}
        </p>
      </div>
      {m.is_sample && <Pill tone="gold">Sample</Pill>}
      <PublishedPill published={m.is_published} />
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" aria-label={`Move ${m.title} up`} onClick={() => onMove(-1)} disabled={locked || !canUp}>
          ↑
        </Button>
        <Button size="sm" variant="ghost" aria-label={`Move ${m.title} down`} onClick={() => onMove(1)} disabled={locked || !canDown}>
          ↓
        </Button>
        <Button size="sm" variant="secondary" onClick={onEdit} disabled={locked}>
          Edit
        </Button>
      </div>
    </li>
  )
}

function MilestoneEditor({
  collectionId,
  milestone,
  memories,
  media,
  onDone,
}: {
  collectionId: string
  milestone: Milestone | null
  memories: MemoryOption[]
  media: Record<string, PickerMedia>
  onDone: () => void
}) {
  const auth = useAuth()
  const [year, setYear] = useState(String(milestone?.year ?? ''))
  const [age, setAge] = useState(milestone?.age != null ? String(milestone.age) : '')
  const [chapter, setChapter] = useState<ChapterKey>(milestone?.chapter ?? 'beginning')
  const [chapterTouched, setChapterTouched] = useState(Boolean(milestone))
  const [title, setTitle] = useState(milestone?.title ?? '')
  const [description, setDescription] = useState(milestone?.description ?? '')
  const [featured, setFeatured] = useState<string | null>(milestone?.featured_media_id ?? null)
  const [photos, setPhotos] = useState<string[]>(
    [...(milestone?.milestone_media ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((x) => x.media_id),
  )
  const [linked, setLinked] = useState<string[]>(
    [...(milestone?.milestone_memories ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((x) => x.memory_id),
  )
  const [published, setPublished] = useState(milestone?.is_published ?? false)
  const [known, setKnown] = useState(media)
  const [real, setReal] = useState(false)
  const [picker, setPicker] = useState<'featured' | 'photos' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urls = useSignedUrls([featured, ...photos].map((id) => (id ? known[id] : undefined)).filter((x): x is PickerMedia => Boolean(x)))

  const onYear = (v: string) => {
    setYear(v)
    const n = Number(v)
    if (!chapterTouched && Number.isInteger(n) && n >= 1996 && n <= 2100) setChapter(chapterForYear(n))
  }

  const save = async () => {
    const y = Number(year)
    if (!Number.isInteger(y) || y < 1996 || y > 2100) return setError('Enter a year from 1996 onwards.')
    if (!title.trim()) return setError('Add a title.')
    const a = age.trim() ? Number(age) : null
    if (a !== null && (!Number.isInteger(a) || a < 0 || a > 120)) return setError('Age must be a whole number.')
    if (published) {
      const missingAlt = [featured, ...photos].filter((id): id is string => Boolean(id)).some((id) => known[id]?.kind === 'image' && !known[id]?.alt_text)
      if (missingAlt) return setError('Every attached photo needs alt text before publishing. Add it in the Library.')
    }
    setBusy(true)
    setError(null)
    const row = {
      collection_id: collectionId,
      chapter,
      year: y,
      age: a,
      title: title.trim(),
      description: description.trim() || null,
      featured_media_id: featured,
      is_published: published,
    }
    let id = milestone?.id
    if (id) {
      const { error: e } = await supabase.from('timeline_milestones').update(row).eq('id', id)
      if (e) return fail('Could not save the milestone.')
    } else {
      const { data, error: e } = await supabase.from('timeline_milestones').insert({ ...row, created_by: auth.user?.id ?? null }).select('id').single()
      if (e || !data) return fail('Could not create the milestone.')
      id = data.id as string
    }
    await supabase.from('milestone_media').delete().eq('milestone_id', id)
    await supabase.from('milestone_memories').delete().eq('milestone_id', id)
    const [mm, mmem] = await Promise.all([
      photos.length ? supabase.from('milestone_media').insert(photos.map((media_id, i) => ({ milestone_id: id, media_id, sort_order: i }))) : { error: null },
      linked.length ? supabase.from('milestone_memories').insert(linked.map((memory_id, i) => ({ milestone_id: id, memory_id, sort_order: i }))) : { error: null },
    ])
    if (mm.error || mmem.error) return fail('Saved, but some attachments could not be linked.')
    if (published) await publishMedia([featured, ...photos])
    if (real) {
      const message = await makeReal('milestone', id)
      if (message) return fail(message)
    }
    setBusy(false)
    onDone()
  }

  const fail = (message: string) => {
    setBusy(false)
    setError(message)
  }

  const remove = async () => {
    if (!milestone || !window.confirm(`Delete “${milestone.title}”? Linked photos and memories are kept.`)) return
    setBusy(true)
    const { error: e } = await supabase.from('timeline_milestones').delete().eq('id', milestone.id)
    if (e) return fail('Could not delete.')
    onDone()
  }

  const remember = (m: PickerMedia) => setKnown((k) => ({ ...k, [m.id]: m }))

  return (
    <Panel className="mb-6 border-gold/30">
      <h3 className="font-serif text-2xl">{milestone ? 'Edit milestone' : 'New milestone'}</h3>
      <div className="mt-5 grid gap-4 sm:grid-cols-3">
        <Input label="Year" inputMode="numeric" value={year} onValue={onYear} maxLength={4} />
        <Input label="Age (optional)" inputMode="numeric" value={age} onValue={setAge} maxLength={3} />
        <Select
          label="Chapter"
          value={chapter}
          onValue={(v) => {
            setChapter(v)
            setChapterTouched(true)
          }}
          options={[...CHAPTER_OPTIONS]}
        />
        <Input className="sm:col-span-3" label="Title" value={title} onValue={setTitle} maxLength={200} />
        <Area className="sm:col-span-3" label="Description" value={description} onValue={setDescription} maxLength={8000} rows={3} />
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-[10rem_1fr]">
        <div>
          <p className="mb-2 text-sm text-ivory">Featured photo</p>
          {featured && known[featured] ? (
            <MediaThumb media={known[featured]} url={urls[featured]} />
          ) : (
            <div className="grid aspect-square place-items-center rounded-lg border border-dashed border-midnight-line text-xs text-grey">None</div>
          )}
          <div className="mt-2 flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => setPicker('featured')}>
              Choose
            </Button>
            {featured && (
              <Button size="sm" variant="ghost" onClick={() => setFeatured(null)}>
                Clear
              </Button>
            )}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm text-ivory">More photos</p>
          <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
            {photos.map((id) =>
              known[id] ? (
                <li key={id} className="relative">
                  <MediaThumb media={known[id]} url={urls[id]} />
                  <button
                    type="button"
                    onClick={() => setPhotos((p) => p.filter((x) => x !== id))}
                    className="absolute top-1 right-1 cursor-pointer rounded-full bg-midnight/85 px-2 text-xs text-ivory hover:text-danger"
                    aria-label="Remove photo"
                  >
                    ×
                  </button>
                </li>
              ) : null,
            )}
          </ul>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPicker('photos')}>
            Add photo
          </Button>
        </div>
      </div>

      <fieldset className="mt-6">
        <legend className="mb-2 text-sm text-ivory">Linked memories</legend>
        {memories.length === 0 ? (
          <p className="text-xs text-grey">No memories in the archive yet. Add approved submissions to the archive first.</p>
        ) : (
          <div className="flex max-h-48 flex-col gap-2 overflow-y-auto rounded-xl border border-midnight-line p-3">
            {memories.map((mem) => (
              <Check
                key={mem.id}
                label={`${mem.title}${mem.attribution ? ` — ${mem.attribution}` : ''}${mem.year ? ` (${mem.year})` : ''}`}
                checked={linked.includes(mem.id)}
                onChecked={(v) => setLinked((l) => (v ? [...l, mem.id] : l.filter((x) => x !== mem.id)))}
              />
            ))}
          </div>
        )}
      </fieldset>

      <div className="mt-6">
        <Check label="Published" hint="Visible to Roni after launch. Attached photos are published with it." checked={published} onChecked={setPublished} />
      </div>
      {milestone?.is_sample && <MakeRealCheck kind="milestone" checked={real} onChecked={setReal} />}
      {error && <Notice tone="error" className="mt-4">{error}</Notice>}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => void save()} loading={busy}>
          Save milestone
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        {milestone && (
          <Button variant="danger" className="ml-auto" onClick={() => void remove()} disabled={busy}>
            Delete
          </Button>
        )}
      </div>

      <MediaPicker
        open={picker !== null}
        title={picker === 'featured' ? 'Choose the featured photo' : 'Add a photo'}
        onClose={() => setPicker(null)}
        onPick={(m) => {
          remember(m)
          if (picker === 'featured') setFeatured(m.id)
          else setPhotos((p) => (p.includes(m.id) ? p : [...p, m.id]))
        }}
      />
    </Panel>
  )
}
