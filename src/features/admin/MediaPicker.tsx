import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { useSignedUrls, type MediaRef } from '@/lib/media'
import { supabase } from '@/lib/supabase'

export type PickerMedia = MediaRef & {
  kind: 'image' | 'video' | 'audio' | 'document'
  alt_text: string | null
  caption: string | null
  transcript: string | null
  original_filename: string | null
  is_published: boolean
  contributor: { full_name: string } | null
}

const SELECT =
  'id, bucket, storage_path, kind, alt_text, caption, transcript, original_filename, is_published, contributor:contributors(full_name)'

export async function loadMediaByIds(ids: string[]): Promise<PickerMedia[]> {
  if (!ids.length) return []
  const { data } = await supabase.from('media_assets').select(SELECT).in('id', ids)
  return (data ?? []) as unknown as PickerMedia[]
}

/** Small preview of a media asset for editors. */
export function MediaThumb({ media, url, className }: { media: PickerMedia; url?: string; className?: string }) {
  const label = media.alt_text || media.caption || media.original_filename || 'Untitled media'
  const [failedUrl, setFailedUrl] = useState<string | null>(null)
  return (
    <div className={cn('relative overflow-hidden rounded-lg border border-midnight-line bg-midnight-raised', className)}>
      {media.kind === 'image' && url && failedUrl !== url ? (
        <img src={url} alt={label} className="aspect-square w-full object-cover" loading="lazy" onError={() => setFailedUrl(url)} />
      ) : (
        <div className="grid aspect-square w-full place-items-center p-2 text-center text-xs text-grey">
          <span>
            {media.kind === 'video' ? 'Video' : media.kind === 'audio' ? 'Voice / audio' : media.kind === 'image' ? (url ? 'Preview unavailable' : 'Photo') : 'File'}
            <span className="mt-1 block truncate text-ivory/70">{label}</span>
          </span>
        </div>
      )}
      {!media.alt_text && media.kind === 'image' && (
        <span className="absolute top-1 left-1 rounded bg-midnight/85 px-1.5 py-0.5 text-[0.65rem] text-gold">No alt text</span>
      )}
    </div>
  )
}

export function MediaPicker({
  open,
  onClose,
  onPick,
  kinds = ['image'],
  title = 'Choose media',
}: {
  open: boolean
  onClose: () => void
  onPick: (media: PickerMedia) => void
  kinds?: PickerMedia['kind'][]
  title?: string
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const [items, setItems] = useState<PickerMedia[] | null>(null)
  const [query, setQuery] = useState('')
  const urls = useSignedUrls(items?.filter((m) => m.kind === 'image'))

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  useEffect(() => {
    if (!open) return
    let active = true
    void supabase
      .from('media_assets')
      .select(SELECT)
      .eq('status', 'verified')
      .in('kind', kinds)
      .order('created_at', { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (active) setItems((data ?? []) as unknown as PickerMedia[])
      })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- kinds is a literal per call site
  }, [open])

  const q = query.trim().toLowerCase()
  const visible = (items ?? []).filter(
    (m) =>
      !q ||
      [m.alt_text, m.caption, m.original_filename, m.contributor?.full_name].some((v) => v?.toLowerCase().includes(q)),
  )

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="picker-title"
      className="m-auto w-[min(56rem,calc(100vw-2rem))] rounded-2xl border border-midnight-line bg-midnight p-0 text-ivory backdrop:bg-black/70"
    >
      <div className="flex max-h-[85dvh] flex-col">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-midnight-line p-5">
          <h2 id="picker-title" className="font-serif text-2xl">
            {title}
          </h2>
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Search captions, files, people"
              aria-label="Search media"
              className="field-input w-56 py-2 text-sm"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="overflow-y-auto p-5">
          {!items ? (
            <Spinner label="Loading media…" />
          ) : visible.length === 0 ? (
            <p className="text-sm text-grey">No matching media. Upload files in the Library first, or approve submissions with uploads.</p>
          ) : (
            <ul className="grid grid-cols-3 gap-3 sm:grid-cols-5">
              {visible.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    className="block w-full cursor-pointer rounded-lg text-left ring-gold transition hover:ring-2 focus-visible:ring-2"
                    onClick={() => {
                      onPick(m)
                      onClose()
                    }}
                  >
                    <MediaThumb media={m} url={urls[m.id]} />
                    <span className="mt-1 block truncate text-xs text-grey">
                      {m.contributor?.full_name ?? 'Curator upload'}
                      {m.is_published ? '' : ' · draft'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  )
}
