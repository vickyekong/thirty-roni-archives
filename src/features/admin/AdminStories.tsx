import { useCallback, useEffect, useState } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { useSignedUrls } from '@/lib/media'
import { supabase } from '@/lib/supabase'
import { MEMORY_CATEGORIES } from '../experience/data'
import { PageTitle } from './AdminLayout'
import { MediaPicker, MediaThumb, loadMediaByIds, type PickerMedia } from './MediaPicker'
import {
  AUDIENCE_OPTIONS,
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
  type Audience,
  type ChapterKey,
  type OriginalCollection,
} from './kit'

export function AdminStories() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'letters' ? 'letters' : 'memories'
  const { collection } = useOriginalCollection()
  return (
    <>
      <PageTitle eyebrow="Memory vault & letters" title="Stories" />
      <LockedNotice collection={collection} />
      <div role="tablist" aria-label="Story type" className="mb-8 flex gap-2">
        {(['memories', 'letters'] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setParams(t === 'memories' ? {} : { tab: t })}
            className={cn(
              'cursor-pointer rounded-full border px-4 py-1.5 text-sm capitalize transition-colors',
              tab === t ? 'border-gold bg-gold/10 text-gold-bright' : 'border-midnight-line text-grey hover:text-ivory',
            )}
          >
            {t}
          </button>
        ))}
      </div>
      {collection && (tab === 'memories' ? <Memories collection={collection} /> : <Letters collection={collection} />)}
    </>
  )
}

// ---------------------------------------------------------------------------
// Memories
// ---------------------------------------------------------------------------
type Memory = {
  id: string
  title: string
  story: string | null
  caption: string | null
  year: number | null
  date_precision: 'specific_year' | 'approximate_year' | 'life_stage' | 'unknown'
  chapter: ChapterKey | null
  category: string | null
  attribution: string | null
  audience: Audience
  is_featured: boolean
  is_published: boolean
  sort_order: number
  contribution_id: string | null
  is_sample: boolean
  memory_media: { media_id: string; sort_order: number }[]
}

const MEMORY_SELECT =
  'id, title, story, caption, year, date_precision, chapter, category, attribution, audience, is_featured, is_published, sort_order, contribution_id, is_sample, memory_media(media_id, sort_order)'

const CATEGORY_OPTIONS = [{ value: '', label: 'Uncategorised' }, ...MEMORY_CATEGORIES]

function Memories({ collection }: { collection: OriginalCollection }) {
  const [rows, setRows] = useState<Memory[] | null>(null)
  const [media, setMedia] = useState<Record<string, PickerMedia>>({})
  const [editing, setEditing] = useEditParam(rows !== null)
  const [chapter, setChapter] = useState<'all' | ChapterKey | 'none'>('all')

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('memories')
      .select(MEMORY_SELECT)
      .eq('collection_id', collection.id)
      .order('chapter', { nullsFirst: true })
      .order('year', { nullsFirst: false })
      .order('sort_order')
    const list = (data ?? []) as Memory[]
    // Editors copy `media` when they open (also straight from an ?edit= link), so it must be ready first.
    const loaded = await loadMediaByIds([...new Set(list.flatMap((m) => m.memory_media.map((x) => x.media_id)))])
    setMedia(Object.fromEntries(loaded.map((x) => [x.id, x])))
    setRows(list)
  }, [collection.id])

  useEffect(() => {
    void load()
  }, [load])

  const visible = (rows ?? []).filter((m) => chapter === 'all' || (chapter === 'none' ? !m.chapter : m.chapter === chapter))
  const done = () => {
    setEditing(null)
    void load()
  }

  return (
    <>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <Select
          label="Chapter"
          className="w-72"
          value={chapter}
          onValue={setChapter}
          options={[{ value: 'all', label: 'All chapters' }, { value: 'none', label: 'Not assigned yet' }, ...CHAPTER_OPTIONS]}
        />
        <Button onClick={() => setEditing('new')} disabled={collection.is_locked}>
          Add memory
        </Button>
      </div>
      {editing === 'new' && <MemoryEditor collection={collection} memory={null} media={media} onDone={done} />}
      {!rows ? (
        <Spinner label="Loading…" />
      ) : visible.length === 0 ? (
        <p className="text-grey">No memories here yet. Approve submissions and add them to the archive, or add one yourself.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((m) =>
            editing === m.id ? (
              <li key={m.id} id={`edit-${m.id}`} className="scroll-mt-24">
                <MemoryEditor collection={collection} memory={m} media={media} onDone={done} />
              </li>
            ) : (
              <li key={m.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-midnight-line p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ivory">{m.title}</p>
                  <p className="text-xs text-grey">
                    {m.attribution ?? 'Unattributed'} · {m.year ?? 'Year unknown'} ·{' '}
                    {CHAPTER_OPTIONS.find((c) => c.value === m.chapter)?.label ?? 'No chapter'} · {m.memory_media.length} media
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {m.is_sample && <Pill tone="gold">Sample</Pill>}
                  {m.is_featured && <Pill tone="gold">Featured</Pill>}
                  {m.audience === 'roni_only' && <Pill>Roni only</Pill>}
                  {!m.contribution_id && <Pill>Curator</Pill>}
                  <PublishedPill published={m.is_published} />
                  <Button size="sm" variant="secondary" onClick={() => setEditing(m.id)} disabled={collection.is_locked}>
                    Edit
                  </Button>
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </>
  )
}

function MemoryEditor({
  collection,
  memory,
  media,
  onDone,
}: {
  collection: OriginalCollection
  memory: Memory | null
  media: Record<string, PickerMedia>
  onDone: () => void
}) {
  const auth = useAuth()
  const [d, setD] = useState({
    title: memory?.title ?? '',
    story: memory?.story ?? '',
    caption: memory?.caption ?? '',
    year: memory?.year != null ? String(memory.year) : '',
    approximate: memory?.date_precision === 'approximate_year',
    chapter: (memory?.chapter ?? '') as ChapterKey | '',
    category: memory?.category ?? '',
    attribution: memory?.attribution ?? '',
    audience: memory?.audience ?? ('everyone' as Audience),
    featured: memory?.is_featured ?? false,
    published: memory?.is_published ?? false,
  })
  const [attached, setAttached] = useState<string[]>(
    [...(memory?.memory_media ?? [])].sort((a, b) => a.sort_order - b.sort_order).map((x) => x.media_id),
  )
  const [known, setKnown] = useState(media)
  const [real, setReal] = useState(false)
  const [picking, setPicking] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urls = useSignedUrls(attached.map((id) => known[id]).filter((x): x is PickerMedia => Boolean(x)))
  const set = (patch: Partial<typeof d>) => setD((prev) => ({ ...prev, ...patch }))

  const save = async () => {
    if (!d.title.trim()) return setError('Add a title.')
    const year = d.year.trim() ? Number(d.year) : null
    if (year !== null && (!Number.isInteger(year) || year < 1996 || year > 2100)) return setError('Enter a year from 1996 onwards.')
    if (d.published && attached.some((id) => known[id]?.kind === 'image' && !known[id]?.alt_text))
      return setError('Every attached photo needs alt text before publishing. Add it in the Library.')
    setBusy(true)
    setError(null)
    const row = {
      title: d.title.trim(),
      story: d.story.trim() || null,
      caption: d.caption.trim() || null,
      year,
      date_precision: year === null ? (memory?.date_precision === 'life_stage' ? 'life_stage' : 'unknown') : d.approximate ? 'approximate_year' : 'specific_year',
      chapter: d.chapter || (year ? chapterForYear(year) : null),
      category: d.category || null,
      attribution: d.attribution.trim() || null,
      audience: d.audience,
      is_featured: d.featured,
      is_published: d.published,
    }
    let id = memory?.id
    if (id) {
      const { error: e } = await supabase.from('memories').update(row).eq('id', id)
      if (e) return fail('Could not save.')
    } else {
      const { data, error: e } = await supabase
        .from('memories')
        .insert({ ...row, collection_id: collection.id, created_by: auth.user?.id ?? null })
        .select('id')
        .single()
      if (e || !data) return fail('Could not create the memory.')
      id = data.id as string
    }
    await supabase.from('memory_media').delete().eq('memory_id', id)
    if (attached.length) {
      const { error: e } = await supabase.from('memory_media').insert(attached.map((media_id, i) => ({ memory_id: id, media_id, sort_order: i })))
      if (e) return fail('Saved, but the media could not be attached.')
    }
    if (d.published) await publishMedia(attached)
    if (real) {
      const message = await makeReal('memory', id)
      if (message) return fail(message)
    }
    setBusy(false)
    onDone()
  }
  const fail = (m: string) => {
    setBusy(false)
    setError(m)
  }
  const remove = async () => {
    if (!memory || !window.confirm(`Delete “${memory.title}” from the archive? The contributor’s original submission is kept.`)) return
    setBusy(true)
    const { error: e } = await supabase.from('memories').delete().eq('id', memory.id)
    if (e) return fail('Could not delete.')
    onDone()
  }

  return (
    <Panel className="mb-4 border-gold/30">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input className="sm:col-span-2" label="Title" value={d.title} onValue={(v) => set({ title: v })} maxLength={200} />
        <Area className="sm:col-span-2" label="Story" value={d.story} onValue={(v) => set({ story: v })} maxLength={20000} rows={5} />
        <Input label="Short caption" hint="Optional line for polaroids and cards." value={d.caption} onValue={(v) => set({ caption: v })} maxLength={2000} />
        <Input label="Attribution" hint="Leave empty to show without a name." value={d.attribution} onValue={(v) => set({ attribution: v })} maxLength={160} />
        <Input label="Year" hint="Leave empty if unknown." inputMode="numeric" value={d.year} onValue={(v) => set({ year: v })} maxLength={4} />
        <Select label="Chapter" hint="Defaults from the year." value={d.chapter} onValue={(v) => set({ chapter: v })} options={[{ value: '', label: 'From the year' }, ...CHAPTER_OPTIONS]} />
        <Select label="Category" value={d.category} onValue={(v) => set({ category: v })} options={CATEGORY_OPTIONS} />
        <Select label="Who can see it" value={d.audience} onValue={(v) => set({ audience: v })} options={[...AUDIENCE_OPTIONS]} />
        <Check label="Approximate year" checked={d.approximate} onChecked={(v) => set({ approximate: v })} />
        <Check label="Featured" hint="Given more space in the Memory Vault." checked={d.featured} onChecked={(v) => set({ featured: v })} />
      </div>

      <div className="mt-6">
        <p className="mb-2 text-sm text-ivory">Photos & media</p>
        <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
          {attached.map((id) =>
            known[id] ? (
              <li key={id} className="relative">
                <MediaThumb media={known[id]} url={urls[id]} />
                <button
                  type="button"
                  onClick={() => setAttached((a) => a.filter((x) => x !== id))}
                  className="absolute top-1 right-1 cursor-pointer rounded-full bg-midnight/85 px-2 text-xs text-ivory hover:text-danger"
                  aria-label="Remove"
                >
                  ×
                </button>
              </li>
            ) : null,
          )}
        </ul>
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPicking(true)}>
          Attach media
        </Button>
      </div>

      <div className="mt-6">
        <Check label="Published" hint="Visible in the birthday experience after launch. Attached media is published with it." checked={d.published} onChecked={(v) => set({ published: v })} />
      </div>
      {memory?.is_sample && <MakeRealCheck kind="memory" checked={real} onChecked={setReal} />}
      {error && <Notice tone="error" className="mt-4">{error}</Notice>}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => void save()} loading={busy}>
          Save
        </Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>
          Cancel
        </Button>
        {memory && (
          <Button variant="danger" className="ml-auto" onClick={() => void remove()} disabled={busy}>
            Delete
          </Button>
        )}
      </div>
      <MediaPicker
        open={picking}
        kinds={['image', 'video', 'audio']}
        onClose={() => setPicking(false)}
        onPick={(m) => {
          setKnown((k) => ({ ...k, [m.id]: m }))
          setAttached((a) => (a.includes(m.id) ? a : [...a, m.id]))
        }}
      />
    </Panel>
  )
}

// ---------------------------------------------------------------------------
// Letters
// ---------------------------------------------------------------------------
type Letter = {
  id: string
  author_display: string | null
  salutation: string | null
  body: string
  voice_media_id: string | null
  photo_media_id: string | null
  audience: Audience
  is_featured: boolean
  is_published: boolean
  sort_order: number
  contribution_id: string | null
  is_sample: boolean
}

function Letters({ collection }: { collection: OriginalCollection }) {
  const [rows, setRows] = useState<Letter[] | null>(null)
  const [media, setMedia] = useState<Record<string, PickerMedia>>({})
  const [editing, setEditing] = useEditParam(rows !== null)

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('letters')
      .select('id, author_display, salutation, body, voice_media_id, photo_media_id, audience, is_featured, is_published, sort_order, contribution_id, is_sample')
      .eq('collection_id', collection.id)
      .order('sort_order')
      .order('created_at')
    const list = (data ?? []) as Letter[]
    const loaded = await loadMediaByIds(list.flatMap((l) => [l.voice_media_id, l.photo_media_id]).filter((x): x is string => Boolean(x)))
    setMedia(Object.fromEntries(loaded.map((x) => [x.id, x])))
    setRows(list)
  }, [collection.id])

  useEffect(() => {
    void load()
  }, [load])

  const move = async (index: number, delta: number) => {
    if (!rows) return
    const next = [...rows]
    const target = index + delta
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target]!, next[index]!]
    setRows(next)
    await Promise.all(next.map((l, i) => supabase.from('letters').update({ sort_order: i }).eq('id', l.id)))
  }

  const done = () => {
    setEditing(null)
    void load()
  }

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Button onClick={() => setEditing('new')} disabled={collection.is_locked}>
          Add letter
        </Button>
      </div>
      {editing === 'new' && <LetterEditor collection={collection} letter={null} media={media} onDone={done} />}
      {!rows ? (
        <Spinner label="Loading…" />
      ) : rows.length === 0 ? (
        <p className="text-grey">No letters yet.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {rows.map((l, i) =>
            editing === l.id ? (
              <li key={l.id} id={`edit-${l.id}`} className="scroll-mt-24">
                <LetterEditor collection={collection} letter={l} media={media} onDone={done} />
              </li>
            ) : (
              <li key={l.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-midnight-line p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-ivory">From {l.author_display ?? 'someone who loves you'}</p>
                  <p className="truncate text-xs text-grey">{l.body.slice(0, 140)}</p>
                </div>
                <div className="flex items-center gap-2">
                  {l.is_sample && <Pill tone="gold">Sample</Pill>}
                  {l.is_featured && <Pill tone="gold">Featured</Pill>}
                  {l.voice_media_id && <Pill>Voice</Pill>}
                  {l.audience === 'roni_only' && <Pill>Roni only</Pill>}
                  <PublishedPill published={l.is_published} />
                  <Button size="sm" variant="ghost" aria-label="Move up" onClick={() => void move(i, -1)} disabled={collection.is_locked || i === 0}>
                    ↑
                  </Button>
                  <Button size="sm" variant="ghost" aria-label="Move down" onClick={() => void move(i, 1)} disabled={collection.is_locked || i === rows.length - 1}>
                    ↓
                  </Button>
                  <Button size="sm" variant="secondary" onClick={() => setEditing(l.id)} disabled={collection.is_locked}>
                    Edit
                  </Button>
                </div>
              </li>
            ),
          )}
        </ol>
      )}
    </>
  )
}

function LetterEditor({
  collection,
  letter,
  media,
  onDone,
}: {
  collection: OriginalCollection
  letter: Letter | null
  media: Record<string, PickerMedia>
  onDone: () => void
}) {
  const [d, setD] = useState({
    author: letter?.author_display ?? '',
    salutation: letter?.salutation ?? '',
    body: letter?.body ?? '',
    voice: letter?.voice_media_id ?? null,
    photo: letter?.photo_media_id ?? null,
    audience: letter?.audience ?? ('everyone' as Audience),
    featured: letter?.is_featured ?? false,
    published: letter?.is_published ?? false,
  })
  const [known, setKnown] = useState(media)
  const [real, setReal] = useState(false)
  const [picker, setPicker] = useState<'voice' | 'photo' | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const urls = useSignedUrls([d.photo].map((id) => (id ? known[id] : undefined)).filter((x): x is PickerMedia => Boolean(x)))
  const set = (patch: Partial<typeof d>) => setD((prev) => ({ ...prev, ...patch }))

  const save = async () => {
    if (!d.body.trim()) return setError('The letter is empty.')
    const voice = d.voice ? known[d.voice] : undefined
    if (d.published && voice && !voice.transcript && !voice.caption) return setError('Add a transcript for the voice note in the Library before publishing.')
    const photo = d.photo ? known[d.photo] : undefined
    if (d.published && photo && !photo.alt_text) return setError('Add alt text for the photo in the Library before publishing.')
    setBusy(true)
    setError(null)
    if (d.featured && !letter?.is_featured) {
      await supabase.from('letters').update({ is_featured: false }).eq('collection_id', collection.id).eq('is_featured', true)
    }
    const row = {
      author_display: d.author.trim() || null,
      salutation: d.salutation.trim() || null,
      body: d.body,
      voice_media_id: d.voice,
      photo_media_id: d.photo,
      audience: d.audience,
      is_featured: d.featured,
      is_published: d.published,
    }
    const { error: e } = letter
      ? await supabase.from('letters').update(row).eq('id', letter.id)
      : await supabase.from('letters').insert({ ...row, collection_id: collection.id, sort_order: 999 })
    if (e) {
      setBusy(false)
      return setError('Could not save the letter.')
    }
    if (d.published) await publishMedia([d.voice, d.photo])
    if (real && letter) {
      const message = await makeReal('letter', letter.id)
      setBusy(false)
      if (message) return setError(message)
    }
    setBusy(false)
    onDone()
  }

  const remove = async () => {
    if (!letter || !window.confirm('Delete this letter from the archive? The contributor’s original is kept.')) return
    setBusy(true)
    await supabase.from('letters').delete().eq('id', letter.id)
    onDone()
  }

  const voice = d.voice ? known[d.voice] : undefined
  const photo = d.photo ? known[d.photo] : undefined

  return (
    <Panel className="mb-4 border-gold/30">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="From" hint="How the sender is named on the envelope. Empty for anonymous." value={d.author} onValue={(v) => set({ author: v })} maxLength={160} />
        <Input label="Salutation" hint="e.g. “Dear Roni,” — optional." value={d.salutation} onValue={(v) => set({ salutation: v })} maxLength={200} />
        <Area className="sm:col-span-2" label="Letter" value={d.body} onValue={(v) => set({ body: v })} maxLength={40000} rows={8} />
        <div>
          <p className="mb-2 text-sm text-ivory">Voice note</p>
          {voice ? <p className="text-sm text-grey">{voice.caption || voice.original_filename || 'Audio'}{voice.transcript ? '' : ' · no transcript yet'}</p> : <p className="text-sm text-grey">None</p>}
          <div className="mt-2 flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => setPicker('voice')}>Choose</Button>
            {voice && <Button size="sm" variant="ghost" onClick={() => set({ voice: null })}>Clear</Button>}
          </div>
        </div>
        <div>
          <p className="mb-2 text-sm text-ivory">Photo</p>
          {photo ? <MediaThumb media={photo} url={urls[photo.id]} className="w-24" /> : <p className="text-sm text-grey">None</p>}
          <div className="mt-2 flex gap-1">
            <Button size="sm" variant="secondary" onClick={() => setPicker('photo')}>Choose</Button>
            {photo && <Button size="sm" variant="ghost" onClick={() => set({ photo: null })}>Clear</Button>}
          </div>
        </div>
        <Select label="Who can see it" value={d.audience} onValue={(v) => set({ audience: v })} options={[...AUDIENCE_OPTIONS]} />
        <div className="flex flex-col gap-3 pt-6">
          <Check label="Featured letter" hint="Only one letter can be featured; choosing this one replaces the current one." checked={d.featured} onChecked={(v) => set({ featured: v })} />
          <Check label="Published" checked={d.published} onChecked={(v) => set({ published: v })} />
        </div>
      </div>
      {letter?.is_sample && <MakeRealCheck kind="letter" checked={real} onChecked={setReal} />}
      {error && <Notice tone="error" className="mt-4">{error}</Notice>}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => void save()} loading={busy}>Save</Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>Cancel</Button>
        {letter && <Button variant="danger" className="ml-auto" onClick={() => void remove()} disabled={busy}>Delete</Button>}
      </div>
      <MediaPicker
        open={picker !== null}
        kinds={picker === 'voice' ? ['audio'] : ['image']}
        title={picker === 'voice' ? 'Choose a voice note' : 'Choose a photo'}
        onClose={() => setPicker(null)}
        onPick={(m) => {
          setKnown((k) => ({ ...k, [m.id]: m }))
          set(picker === 'voice' ? { voice: m.id } : { photo: m.id })
        }}
      />
    </Panel>
  )
}
