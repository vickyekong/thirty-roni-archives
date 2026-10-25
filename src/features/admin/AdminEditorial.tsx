import { useEffect, useState, type ReactNode } from 'react'
import { useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { useSignedUrls } from '@/lib/media'
import { supabase } from '@/lib/supabase'
import {
  EDITORIAL,
  parseEditorial,
  type EditorialKey,
  type FinaleContent,
  type MusicContent,
  type OpeningContent,
  type TimesContent,
  type TimesStory,
} from '../experience/editorial'
import { PageTitle } from './AdminLayout'
import { MediaPicker, MediaThumb, loadMediaByIds, type PickerMedia } from './MediaPicker'
import { Area, Check, Input, LockedNotice, Panel, PublishedPill, moveItem, publishMedia, useOriginalCollection } from './kit'

const TABS: { key: EditorialKey; label: string }[] = [
  { key: 'opening', label: 'Opening' },
  { key: 'roni_times', label: 'The Roni Times' },
  { key: 'finale', label: 'Finale' },
  { key: 'music', label: 'Music' },
]

export function AdminEditorial() {
  const [params, setParams] = useSearchParams()
  const tab = (TABS.find((t) => t.key === params.get('tab'))?.key ?? 'opening') as EditorialKey
  const { collection } = useOriginalCollection()
  return (
    <>
      <PageTitle eyebrow="Words on the page" title="Editorial" />
      <LockedNotice collection={collection} />
      <div role="tablist" aria-label="Section" className="mb-8 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams({ tab: t.key })}
            className={cn(
              'cursor-pointer rounded-full border px-4 py-1.5 text-sm transition-colors',
              tab === t.key ? 'border-gold bg-gold/10 text-gold-bright' : 'border-midnight-line text-grey hover:text-ivory',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>
      <EditorialSlot key={tab} slot={tab} locked={Boolean(collection?.is_locked)} />
    </>
  )
}

function EditorialSlot({ slot, locked }: { slot: EditorialKey; locked: boolean }) {
  const auth = useAuth()
  const [content, setContent] = useState<unknown>(null)
  const [published, setPublished] = useState(false)
  const [exists, setExists] = useState(false)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)

  useEffect(() => {
    let active = true
    void supabase
      .from('experience_content')
      .select('content, is_published')
      .eq('key', slot)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return
        setContent(parseEditorial(slot, data?.content))
        setPublished(data?.is_published ?? false)
        setExists(Boolean(data))
      })
    return () => {
      active = false
    }
  }, [slot])

  const save = async () => {
    const parsed = EDITORIAL[slot].schema.safeParse(content)
    if (!parsed.success) return setMessage({ tone: 'error', text: 'Some fields are too long.' })
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.from('experience_content').upsert({
      key: slot,
      content: parsed.data,
      is_published: published,
      is_sample: false,
      updated_at: new Date().toISOString(),
      updated_by: auth.user?.id ?? null,
    })
    if (!error && published) await publishMedia(mediaIdsIn(slot, parsed.data))
    setBusy(false)
    if (error) setMessage({ tone: 'error', text: locked ? 'The Original Thirty is locked.' : 'Could not save.' })
    else {
      setExists(true)
      setMessage({ tone: 'success', text: published ? 'Saved and published.' : 'Saved as a draft.' })
    }
  }

  if (content === null) return <Spinner label="Loading…" />

  const onChange = (next: unknown) => {
    setContent(next)
    setMessage(null)
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <PublishedPill published={exists && published} />
          {!exists && <span className="text-sm text-grey">Not saved yet: the experience uses the defaults shown below.</span>}
        </div>
      </div>
      {slot === 'opening' && <OpeningEditor value={content as OpeningContent} onChange={onChange} />}
      {slot === 'finale' && <FinaleEditor value={content as FinaleContent} onChange={onChange} />}
      {slot === 'roni_times' && <TimesEditor value={content as TimesContent} onChange={onChange} />}
      {slot === 'music' && <MusicEditor value={content as MusicContent} onChange={onChange} />}
      <Panel className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-4 bg-midnight/95 backdrop-blur">
        <Check
          label="Published"
          hint={slot === 'opening' || slot === 'finale' ? 'Unpublished, the experience falls back to the default wording.' : 'Unpublished sections are left out of the birthday experience.'}
          checked={published}
          onChecked={(v) => {
            setPublished(v)
            setMessage(null)
          }}
        />
        <div className="flex items-center gap-3">
          {message && <span role="status" className={message.tone === 'error' ? 'text-sm text-danger' : 'text-sm text-success'}>{message.text}</span>}
          <Button onClick={() => void save()} loading={busy} disabled={locked}>
            Save
          </Button>
        </div>
      </Panel>
    </div>
  )
}

function mediaIdsIn(slot: EditorialKey, data: unknown): (string | null)[] {
  if (slot === 'music') return [(data as MusicContent).mediaId]
  if (slot !== 'roni_times') return []
  const t = data as TimesContent
  return [t.coverStory.mediaId, ...t.familyMemories.map((s) => s.mediaId), ...t.friendshipChronicles.map((s) => s.mediaId), ...t.photoFeatures.map((p) => p.mediaId)]
}

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Panel>
      <h2 className="font-serif text-2xl">{title}</h2>
      {hint && <p className="mt-1 text-sm leading-relaxed text-grey">{hint}</p>}
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </Panel>
  )
}

function LinesEditor({ label, lines, onChange, max, maxLength = 200 }: { label: string; lines: string[]; onChange: (l: string[]) => void; max: number; maxLength?: number }) {
  return (
    <div className="flex flex-col gap-3">
      {lines.map((line, i) => (
        <div key={i} className="flex items-end gap-2">
          <Input className="flex-1" label={`${label} ${i + 1}`} value={line} onValue={(v) => onChange(lines.map((l, j) => (j === i ? v : l)))} maxLength={maxLength} />
          <Button size="sm" variant="ghost" aria-label={`Move ${label.toLowerCase()} ${i + 1} up`} onClick={() => onChange(moveItem(lines, i, -1))} disabled={i === 0}>↑</Button>
          <Button size="sm" variant="ghost" aria-label={`Remove ${label.toLowerCase()} ${i + 1}`} onClick={() => onChange(lines.filter((_, j) => j !== i))}>×</Button>
        </div>
      ))}
      {lines.length < max && (
        <Button size="sm" variant="secondary" className="self-start" onClick={() => onChange([...lines, ''])}>
          Add {label.toLowerCase()}
        </Button>
      )}
    </div>
  )
}

function OpeningEditor({ value, onChange }: { value: OpeningContent; onChange: (v: OpeningContent) => void }) {
  return (
    <Section title="Cinematic opening" hint="The lines appear one by one over the particles, before 1996 turns into 2026.">
      <div className="grid gap-4 sm:grid-cols-3">
        <Input label="Starting year" value={value.year} onValue={(v) => onChange({ ...value, year: v })} maxLength={4} inputMode="numeric" />
        <Input label="Name" value={value.name} onValue={(v) => onChange({ ...value, name: v })} maxLength={40} />
        <Input label="Tagline" value={value.tagline} onValue={(v) => onChange({ ...value, tagline: v })} maxLength={120} />
      </div>
      <LinesEditor label="Line" lines={value.lines} onChange={(lines) => onChange({ ...value, lines })} max={5} />
    </Section>
  )
}

function FinaleEditor({ value, onChange }: { value: FinaleContent; onChange: (v: FinaleContent) => void }) {
  return (
    <>
      <Section title="Chapter Thirty" hint="The closing scene before the wish.">
        <Input label="Heading" value={value.heading} onValue={(v) => onChange({ ...value, heading: v })} maxLength={120} />
        <LinesEditor label="Line" lines={value.lines} onChange={(lines) => onChange({ ...value, lines })} max={5} />
      </Section>
      <Section title="After the wish" hint="Revealed when Roni makes her wish. Leave empty to end on the lines above.">
        <Area label="Final message" value={value.finalMessage} onValue={(v) => onChange({ ...value, finalMessage: v })} maxLength={4000} rows={5} />
        <Input label="Signed" hint="e.g. “With love, everyone who wrote to you”" value={value.finalSignature} onValue={(v) => onChange({ ...value, finalSignature: v })} maxLength={160} />
      </Section>
    </>
  )
}

function useKnownMedia(ids: (string | null)[]) {
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

function MediaSlot({
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

function StoriesEditor({
  label,
  stories,
  onChange,
  known,
  remember,
}: {
  label: string
  stories: TimesStory[]
  onChange: (s: TimesStory[]) => void
  known: Record<string, PickerMedia>
  remember: (m: PickerMedia) => void
}) {
  const update = (i: number, patch: Partial<TimesStory>) => onChange(stories.map((s, j) => (j === i ? { ...s, ...patch } : s)))
  return (
    <div className="flex flex-col gap-4">
      {stories.map((s, i) => (
        <fieldset key={i} className="grid gap-3 rounded-xl border border-midnight-line p-4 sm:grid-cols-[1fr_8rem]">
          <legend className="sr-only">{`${label} ${i + 1}`}</legend>
          <div className="flex flex-col gap-3">
            <Input label="Headline" value={s.title} onValue={(v) => update(i, { title: v })} maxLength={200} />
            <Area label="Story" value={s.body} onValue={(v) => update(i, { body: v })} maxLength={8000} rows={3} />
            <Input label="Byline" value={s.byline} onValue={(v) => update(i, { byline: v })} maxLength={160} />
          </div>
          <div className="flex flex-col gap-2">
            <MediaSlot label="Photo" mediaId={s.mediaId} known={known} onPick={(m) => { if (m) remember(m); update(i, { mediaId: m?.id ?? null }) }} />
            <Button size="sm" variant="ghost" onClick={() => onChange(moveItem(stories, i, -1))} disabled={i === 0}>Move up</Button>
            <Button size="sm" variant="danger" onClick={() => onChange(stories.filter((_, j) => j !== i))}>Remove</Button>
          </div>
        </fieldset>
      ))}
      <Button size="sm" variant="secondary" className="self-start" onClick={() => onChange([...stories, { title: '', body: '', byline: '', mediaId: null }])}>
        Add {label.toLowerCase()}
      </Button>
    </div>
  )
}

function TimesEditor({ value, onChange }: { value: TimesContent; onChange: (v: TimesContent) => void }) {
  const ids = [value.coverStory.mediaId, ...value.familyMemories.map((s) => s.mediaId), ...value.friendshipChronicles.map((s) => s.mediaId), ...value.photoFeatures.map((p) => p.mediaId)]
  const { known, remember } = useKnownMedia(ids)
  const set = (patch: Partial<TimesContent>) => onChange({ ...value, ...patch })
  return (
    <>
      <Notice>
        Everything here is written by you from approved memories and family knowledge. Sections left empty are simply not printed; nothing is
        filled in automatically.
      </Notice>
      <Section title="Front page">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input label="Masthead" value={value.masthead} onValue={(v) => set({ masthead: v })} maxLength={80} />
          <Input label="Edition" value={value.edition} onValue={(v) => set({ edition: v })} maxLength={120} />
          <Input label="Dateline" value={value.dateline} onValue={(v) => set({ dateline: v })} maxLength={120} />
        </div>
        <Input label="Headline" value={value.headline} onValue={(v) => set({ headline: v })} maxLength={200} />
        <Area label="Standfirst" hint="The short paragraph under the headline." value={value.standfirst} onValue={(v) => set({ standfirst: v })} maxLength={600} rows={2} />
      </Section>
      <Section title="Cover story">
        <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
          <div className="flex flex-col gap-3">
            <Input label="Title" value={value.coverStory.title} onValue={(v) => set({ coverStory: { ...value.coverStory, title: v } })} maxLength={200} />
            <Area label="Story" value={value.coverStory.body} onValue={(v) => set({ coverStory: { ...value.coverStory, body: v } })} maxLength={8000} rows={6} />
            <Input label="Byline" value={value.coverStory.byline} onValue={(v) => set({ coverStory: { ...value.coverStory, byline: v } })} maxLength={160} />
          </div>
          <MediaSlot label="Photo" mediaId={value.coverStory.mediaId} known={known} onPick={(m) => { if (m) remember(m); set({ coverStory: { ...value.coverStory, mediaId: m?.id ?? null } }) }} />
        </div>
      </Section>
      <Section title="Thirty things about Roni" hint={`${value.thirtyThings.filter((t) => t.trim()).length} of up to 30. Only what you write is printed.`}>
        <LinesEditor label="Thing" lines={value.thirtyThings} onChange={(thirtyThings) => set({ thirtyThings })} max={30} maxLength={300} />
      </Section>
      <Section title="Family memories">
        <StoriesEditor label="Story" stories={value.familyMemories} onChange={(familyMemories) => set({ familyMemories })} known={known} remember={remember} />
      </Section>
      <Section title="Friendship chronicles">
        <StoriesEditor label="Story" stories={value.friendshipChronicles} onChange={(friendshipChronicles) => set({ friendshipChronicles })} known={known} remember={remember} />
      </Section>
      <Section title="The Roni Awards">
        {value.awards.map((a, i) => (
          <div key={i} className="grid gap-3 rounded-xl border border-midnight-line p-4 sm:grid-cols-[1fr_2fr_auto] sm:items-end">
            <Input label="Award" value={a.title} onValue={(v) => set({ awards: value.awards.map((x, j) => (j === i ? { ...x, title: v } : x)) })} maxLength={160} />
            <Input label="Citation" value={a.citation} onValue={(v) => set({ awards: value.awards.map((x, j) => (j === i ? { ...x, citation: v } : x)) })} maxLength={1000} />
            <Button size="sm" variant="ghost" onClick={() => set({ awards: value.awards.filter((_, j) => j !== i) })}>Remove</Button>
          </div>
        ))}
        <Button size="sm" variant="secondary" className="self-start" onClick={() => set({ awards: [...value.awards, { title: '', citation: '' }] })}>
          Add award
        </Button>
      </Section>
      <Section title="Birthday forecast">
        <Area label="Forecast" hint="A playful outlook for the year ahead." value={value.forecast} onValue={(v) => set({ forecast: v })} maxLength={2000} rows={3} />
      </Section>
      <Section title="Photo features">
        <div className="grid gap-4 sm:grid-cols-2">
          {value.photoFeatures.map((p, i) => (
            <div key={i} className="flex gap-3 rounded-xl border border-midnight-line p-3">
              <MediaSlot label={`Photo ${i + 1}`} mediaId={p.mediaId} known={known} onPick={(m) => { if (m) remember(m); set({ photoFeatures: value.photoFeatures.map((x, j) => (j === i ? { ...x, mediaId: m?.id ?? null } : x)) }) }} />
              <div className="flex flex-1 flex-col gap-2">
                <Area label="Caption" value={p.caption} onValue={(v) => set({ photoFeatures: value.photoFeatures.map((x, j) => (j === i ? { ...x, caption: v } : x)) })} maxLength={400} rows={2} />
                <Button size="sm" variant="ghost" className="self-start" onClick={() => set({ photoFeatures: value.photoFeatures.filter((_, j) => j !== i) })}>Remove</Button>
              </div>
            </div>
          ))}
        </div>
        {value.photoFeatures.length < 12 && (
          <Button size="sm" variant="secondary" className="self-start" onClick={() => set({ photoFeatures: [...value.photoFeatures, { mediaId: null, caption: '' }] })}>
            Add photo feature
          </Button>
        )}
      </Section>
    </>
  )
}

function MusicEditor({ value, onChange }: { value: MusicContent; onChange: (v: MusicContent) => void }) {
  const { known, remember } = useKnownMedia([value.mediaId])
  return (
    <Section
      title="Background music"
      hint="Optional. Never autoplays: Roni sees a music button and chooses whether to start it. Upload the audio file to the Library first, and make sure you have the right to use it."
    >
      <MediaSlot label="Audio file" kinds={['audio']} mediaId={value.mediaId} known={known} onPick={(m) => { if (m) remember(m); onChange({ ...value, mediaId: m?.id ?? null }) }} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input label="Title" value={value.title} onValue={(v) => onChange({ ...value, title: v })} maxLength={200} />
        <Input label="Credit" value={value.credit} onValue={(v) => onChange({ ...value, credit: v })} maxLength={200} />
      </div>
    </Section>
  )
}
