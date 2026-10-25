import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import {
  MAX_ARCHIVE_BYTES,
  MEDIA_ACCEPT,
  extensionFor,
  forgetSignedUrl,
  formatBytes,
  mediaKindFor,
  probeMedia,
  useSignedUrls,
} from '@/lib/media'
import { supabase } from '@/lib/supabase'
import { PageTitle } from './AdminLayout'
import { MediaThumb, type PickerMedia } from './MediaPicker'
import { AUDIENCE_OPTIONS, Area, Check, Input, LockedNotice, Panel, Pill, Select, useOriginalCollection, type Audience } from './kit'

type LibraryItem = PickerMedia & {
  purpose: string
  mime_type: string
  size_bytes: number | null
  transcript: string | null
  audience: Audience
  contribution_id: string | null
  collection_id: string | null
  created_at: string
}

const SELECT =
  'id, bucket, storage_path, kind, purpose, mime_type, size_bytes, alt_text, caption, transcript, audience, is_published, contribution_id, collection_id, original_filename, created_at, contributor:contributors(full_name)'

const ACCEPT = [...MEDIA_ACCEPT.image, ...MEDIA_ACCEPT.video, ...MEDIA_ACCEPT.audio].join(',')

type Filter = { source: 'all' | 'curated' | 'contributions'; kind: 'all' | 'image' | 'video' | 'audio'; state: 'all' | 'published' | 'draft' | 'needs_alt' }

export function AdminLibrary() {
  const auth = useAuth()
  const { collection } = useOriginalCollection()
  const [items, setItems] = useState<LibraryItem[] | null>(null)
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>({ source: 'all', kind: 'all', state: 'all' })
  const [query, setQuery] = useState('')
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null)
  const [messages, setMessages] = useState<{ tone: 'error' | 'success'; text: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from('media_assets')
      .select(SELECT)
      .eq('status', 'verified')
      .order('created_at', { ascending: false })
    if (error) setMessages([{ tone: 'error', text: 'Could not load the library.' }])
    setItems((data ?? []) as unknown as LibraryItem[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const visibleImages = useMemo(() => items?.filter((m) => m.kind === 'image'), [items])
  const urls = useSignedUrls(visibleImages)

  const upload = async (files: FileList | null) => {
    if (!files?.length || !collection) return
    const list = [...files]
    const notes: { tone: 'error' | 'success'; text: string }[] = []
    setUploading({ done: 0, total: list.length })
    let done = 0
    for (const file of list) {
      const kind = mediaKindFor(file.type)
      if (!kind) notes.push({ tone: 'error', text: `${file.name}: this file type is not supported.` })
      else if (file.size > MAX_ARCHIVE_BYTES) notes.push({ tone: 'error', text: `${file.name}: larger than 50 MB.` })
      else if (file.size === 0) notes.push({ tone: 'error', text: `${file.name}: the file is empty.` })
      else {
        const path = `original/${crypto.randomUUID()}.${extensionFor(file)}`
        const meta = await probeMedia(file, kind)
        const { error: upErr } = await supabase.storage.from('archive').upload(path, file, { contentType: file.type, upsert: false })
        if (upErr) notes.push({ tone: 'error', text: `${file.name}: upload failed.` })
        else {
          const { error: rowErr } = await supabase.from('media_assets').insert({
            bucket: 'archive',
            storage_path: path,
            kind,
            purpose: 'curated',
            status: 'verified',
            verified_at: new Date().toISOString(),
            mime_type: file.type,
            size_bytes: file.size,
            original_filename: file.name.slice(0, 255),
            width: meta.width ?? null,
            height: meta.height ?? null,
            duration_seconds: meta.duration ? Math.round(meta.duration * 100) / 100 : null,
            collection_id: collection.id,
            uploaded_by: auth.user?.id ?? null,
          })
          if (rowErr) {
            await supabase.storage.from('archive').remove([path])
            notes.push({ tone: 'error', text: `${file.name}: could not be catalogued.` })
          }
        }
      }
      done += 1
      setUploading({ done, total: list.length })
    }
    const failed = notes.length
    if (list.length - failed > 0) notes.unshift({ tone: 'success', text: `${list.length - failed} file${list.length - failed === 1 ? '' : 's'} added. Add alt text before publishing.` })
    setMessages(notes)
    setUploading(null)
    if (fileRef.current) fileRef.current.value = ''
    void load()
  }

  const q = query.trim().toLowerCase()
  const visible = (items ?? []).filter((m) => {
    if (filter.source === 'curated' && m.contribution_id) return false
    if (filter.source === 'contributions' && !m.contribution_id) return false
    if (filter.kind !== 'all' && m.kind !== filter.kind) return false
    if (filter.state === 'published' && !m.is_published) return false
    if (filter.state === 'draft' && m.is_published) return false
    if (filter.state === 'needs_alt' && (m.kind !== 'image' || m.alt_text)) return false
    if (q && ![m.alt_text, m.caption, m.original_filename, m.contributor?.full_name].some((v) => v?.toLowerCase().includes(q))) return false
    return true
  })
  const current = items?.find((m) => m.id === selected) ?? null
  const totals = (items ?? []).reduce(
    (acc, m) => {
      acc[m.bucket === 'archive' ? 'archive' : 'contributions'] += m.size_bytes ?? 0
      return acc
    },
    { archive: 0, contributions: 0 },
  )

  return (
    <>
      <PageTitle eyebrow="Media" title="Library">
        <div className="flex items-center gap-3">
          <input ref={fileRef} type="file" multiple accept={ACCEPT} hidden tabIndex={-1} onChange={(e) => void upload(e.target.files)} />
          <Button onClick={() => fileRef.current?.click()} loading={Boolean(uploading)} disabled={!collection || collection.is_locked}>
            {uploading ? `Uploading ${uploading.done + 1} of ${uploading.total}` : 'Upload media'}
          </Button>
        </div>
      </PageTitle>
      <LockedNotice collection={collection} />
      <p className="mb-6 -mt-6 text-sm text-grey">
        Photos, video and audio up to 50 MB each, stored privately. Storage used: {formatBytes(totals.archive)} curated ·{' '}
        {formatBytes(totals.contributions)} from contributors (Supabase Free plan includes 1 GB).
      </p>
      <div aria-live="polite" className="flex flex-col gap-2">
        {messages.map((m, i) => (
          <Notice key={i} tone={m.tone} className="mb-2">
            {m.text}
          </Notice>
        ))}
      </div>

      <div className="mb-6 grid gap-3 sm:grid-cols-4">
        <Select label="Source" value={filter.source} onValue={(v) => setFilter({ ...filter, source: v })} options={[{ value: 'all', label: 'Everything' }, { value: 'curated', label: 'Curator uploads' }, { value: 'contributions', label: 'From contributors' }]} />
        <Select label="Type" value={filter.kind} onValue={(v) => setFilter({ ...filter, kind: v })} options={[{ value: 'all', label: 'All types' }, { value: 'image', label: 'Photos' }, { value: 'video', label: 'Video' }, { value: 'audio', label: 'Audio' }]} />
        <Select label="State" value={filter.state} onValue={(v) => setFilter({ ...filter, state: v })} options={[{ value: 'all', label: 'Any' }, { value: 'published', label: 'Published' }, { value: 'draft', label: 'Not published' }, { value: 'needs_alt', label: 'Missing alt text' }]} />
        <Input label="Search" type="search" value={query} onValue={setQuery} placeholder="Caption, file, person" />
      </div>

      {!items ? (
        <Spinner label="Loading…" />
      ) : visible.length === 0 ? (
        <p className="text-grey">No media matches.</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
          <ul className="grid grid-cols-3 content-start gap-3 sm:grid-cols-4 xl:grid-cols-5" aria-label="Media">
            {visible.map((m) => (
              <li key={m.id}>
                <button
                  type="button"
                  aria-current={selected === m.id || undefined}
                  onClick={() => setSelected(m.id)}
                  className={cn('block w-full cursor-pointer rounded-lg text-left ring-gold transition hover:ring-1', selected === m.id && 'ring-2')}
                >
                  <MediaThumb media={m} url={urls[m.id]} />
                  <span className="mt-1 flex items-center justify-between gap-1 text-xs text-grey">
                    <span className="truncate">{m.contributor?.full_name ?? 'Curator'}</span>
                    {m.is_published && <span className="text-success" aria-label="Published">●</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="lg:sticky lg:top-28 lg:self-start">
            {current ? (
              <MediaEditor
                key={current.id}
                item={current}
                url={urls[current.id]}
                locked={Boolean(collection?.is_locked)}
                onSaved={() => void load()}
                onDeleted={() => {
                  setSelected(null)
                  void load()
                }}
              />
            ) : (
              <p className="text-sm text-grey">Select a file to describe, publish, replace or delete it.</p>
            )}
          </div>
        </div>
      )}
    </>
  )
}

function MediaEditor({
  item,
  url,
  locked,
  onSaved,
  onDeleted,
}: {
  item: LibraryItem
  url?: string
  locked: boolean
  onSaved: () => void
  onDeleted: () => void
}) {
  const [alt, setAlt] = useState(item.alt_text ?? '')
  const [caption, setCaption] = useState(item.caption ?? '')
  const [transcript, setTranscript] = useState(item.transcript ?? '')
  const [audience, setAudience] = useState<Audience>(item.audience)
  const [published, setPublished] = useState(item.is_published)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [mediaUrl, setMediaUrl] = useState<string | undefined>(url)
  const replaceRef = useRef<HTMLInputElement>(null)
  const isCurated = !item.contribution_id

  useEffect(() => {
    if (url) setMediaUrl(url)
    else if (item.kind !== 'image') {
      void supabase.storage
        .from(item.bucket)
        .createSignedUrl(item.storage_path, 3600)
        .then(({ data }) => setMediaUrl(data?.signedUrl))
    }
  }, [url, item.bucket, item.storage_path, item.kind])

  const save = async () => {
    if (published && item.kind === 'image' && !alt.trim()) {
      setError('Add alt text before publishing a photo.')
      return
    }
    if (published && item.kind !== 'image' && !transcript.trim() && !caption.trim()) {
      setError('Add a caption or transcript before publishing audio or video.')
      return
    }
    setBusy('save')
    setError(null)
    const { error: e } = await supabase
      .from('media_assets')
      .update({
        alt_text: alt.trim() || null,
        caption: caption.trim() || null,
        transcript: transcript.trim() || null,
        audience,
        is_published: published,
      })
      .eq('id', item.id)
    setBusy(null)
    if (e) setError(locked ? 'The Original Thirty is locked.' : 'Could not save.')
    else {
      setSaved(true)
      onSaved()
    }
  }

  const replace = async (file: File | undefined) => {
    if (!file) return
    const kind = mediaKindFor(file.type)
    if (!kind || kind !== item.kind) {
      setError(`Choose another ${item.kind === 'audio' ? 'audio file' : item.kind}.`)
      return
    }
    if (file.size > MAX_ARCHIVE_BYTES) {
      setError('That file is larger than 50 MB.')
      return
    }
    setBusy('replace')
    setError(null)
    const path = `original/${crypto.randomUUID()}.${extensionFor(file)}`
    const meta = await probeMedia(file, kind)
    const { error: upErr } = await supabase.storage.from('archive').upload(path, file, { contentType: file.type })
    if (upErr) {
      setBusy(null)
      setError('Upload failed.')
      return
    }
    const { error: rowErr } = await supabase
      .from('media_assets')
      .update({
        storage_path: path,
        mime_type: file.type,
        size_bytes: file.size,
        original_filename: file.name.slice(0, 255),
        width: meta.width ?? null,
        height: meta.height ?? null,
        duration_seconds: meta.duration ? Math.round(meta.duration * 100) / 100 : null,
      })
      .eq('id', item.id)
    if (rowErr) {
      await supabase.storage.from('archive').remove([path])
      setBusy(null)
      setError('Could not replace the file.')
      return
    }
    await supabase.storage.from(item.bucket).remove([item.storage_path])
    forgetSignedUrl(item)
    setBusy(null)
    onSaved()
  }

  const remove = async () => {
    if (!window.confirm('Delete this file permanently? Anything using it will lose the image.')) return
    setBusy('delete')
    setError(null)
    const { error: e } = await supabase.from('media_assets').delete().eq('id', item.id)
    if (e) {
      setBusy(null)
      setError(locked ? 'The Original Thirty is locked.' : 'Could not delete.')
      return
    }
    await supabase.storage.from(item.bucket).remove([item.storage_path])
    forgetSignedUrl(item)
    onDeleted()
  }

  return (
    <Panel className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl border border-midnight-line bg-midnight-raised">
        {item.kind === 'image' ? (
          mediaUrl ? <img src={mediaUrl} alt={alt || 'Preview'} className="max-h-80 w-full object-contain" /> : <div className="aspect-video" />
        ) : item.kind === 'video' ? (
          <video controls preload="metadata" src={mediaUrl} className="w-full" />
        ) : (
          <audio controls preload="metadata" src={mediaUrl} className="w-full p-3" />
        )}
      </div>
      <div className="flex flex-wrap gap-2 text-xs text-grey">
        <Pill>{isCurated ? 'Curator upload' : `From ${item.contributor?.full_name ?? 'a contributor'}`}</Pill>
        <Pill>{formatBytes(item.size_bytes)}</Pill>
        {item.purpose === 'profile_photo' && <Pill>Profile photo</Pill>}
      </div>

      {item.kind === 'image' && (
        <Area label="Alt text" hint="Describe what is in the photo for people using screen readers." value={alt} onValue={(v) => { setAlt(v); setSaved(false) }} maxLength={1000} rows={2} />
      )}
      <Area label="Caption" value={caption} onValue={(v) => { setCaption(v); setSaved(false) }} maxLength={2000} rows={2} />
      {item.kind !== 'image' && (
        <Area label="Transcript" hint="Required for accessibility. Type what is said." value={transcript} onValue={(v) => { setTranscript(v); setSaved(false) }} maxLength={20000} rows={4} />
      )}
      <Select label="Who can see it" value={audience} onValue={(v) => { setAudience(v); setSaved(false) }} options={[...AUDIENCE_OPTIONS]} />
      <Check
        label="Published"
        hint="Only published media can be loaded by Roni or family, and only after launch."
        checked={published}
        onChecked={(v) => { setPublished(v); setSaved(false) }}
      />
      {error && <Notice tone="error">{error}</Notice>}
      {saved && <Notice tone="success" live>Saved.</Notice>}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={() => void save()} loading={busy === 'save'} disabled={locked}>
          Save
        </Button>
        {isCurated && (
          <>
            <input ref={replaceRef} type="file" hidden tabIndex={-1} accept={ACCEPT} onChange={(e) => void replace(e.target.files?.[0])} />
            <Button size="sm" variant="secondary" onClick={() => replaceRef.current?.click()} loading={busy === 'replace'} disabled={locked}>
              Replace file
            </Button>
            <Button size="sm" variant="danger" onClick={() => void remove()} loading={busy === 'delete'} disabled={locked}>
              Delete
            </Button>
          </>
        )}
      </div>
      {!isCurated && (
        <p className="text-xs leading-relaxed text-grey">
          Contributor originals are preserved and cannot be replaced or deleted here. Unpublish to keep it out of the archive.
        </p>
      )}
    </Panel>
  )
}
