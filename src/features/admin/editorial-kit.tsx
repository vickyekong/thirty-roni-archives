import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { useSignedUrls } from '@/lib/media'
import { MediaPicker, MediaThumb, loadMediaByIds, type PickerMedia } from './MediaPicker'
import { Panel } from './kit'

export function Section({ title, hint, children }: { title: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <Panel>
      <h2 className="font-serif text-2xl">{title}</h2>
      {hint && <p className="mt-1 text-sm leading-relaxed text-grey">{hint}</p>}
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </Panel>
  )
}

export function useKnownMedia(ids: (string | null)[]) {
  const [known, setKnown] = useState<Record<string, PickerMedia>>({})
  const key = ids.filter(Boolean).sort().join(',')
  useEffect(() => {
    const missing = ids.filter((id): id is string => Boolean(id) && !known[id!])
    if (!missing.length) return
    void loadMediaByIds(missing).then((list) => setKnown((k) => ({ ...k, ...Object.fromEntries(list.map((m) => [m.id, m])) })))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the id list
  }, [key])
  return { known, remember: (m: PickerMedia) => setKnown((k) => ({ ...k, [m.id]: m })) }
}

export function MediaSlot({
  label,
  mediaId,
  known,
  onPick,
  kinds = ['image'],
}: {
  label: string
  mediaId: string | null
  known: Record<string, PickerMedia>
  onPick: (m: PickerMedia | null) => void
  kinds?: PickerMedia['kind'][]
}) {
  const [open, setOpen] = useState(false)
  const m = mediaId ? known[mediaId] : undefined
  const urls = useSignedUrls(m?.kind === 'image' ? [m] : null)
  return (
    <div>
      <p className="mb-1 text-sm text-ivory">{label}</p>
      {m ? <MediaThumb media={m} url={urls[m.id]} className="w-24" /> : <p className="text-sm text-grey">None</p>}
      <div className="mt-2 flex gap-1">
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Choose</Button>
        {m && <Button size="sm" variant="ghost" onClick={() => onPick(null)}>Clear</Button>}
      </div>
      <MediaPicker open={open} kinds={kinds} onClose={() => setOpen(false)} onPick={onPick} />
    </div>
  )
}
