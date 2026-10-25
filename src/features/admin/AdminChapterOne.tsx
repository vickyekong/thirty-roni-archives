import { useEffect, useState } from 'react'
import { Button, buttonClasses } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { useSignedUrls } from '@/lib/media'
import { supabase } from '@/lib/supabase'
import { belongsToChapterOne, type ChapterOneContent, type ChapterOneMoment } from '../experience/editorial'
import { MediaPicker, MediaThumb, type PickerMedia } from './MediaPicker'
import { MediaSlot, Section, useKnownMedia } from './editorial-kit'
import { Area, Check, Input, Pill, PublishedPill, moveItem, useOriginalCollection } from './kit'

type MemoryOption = {
  id: string
  title: string
  year: number | null
  chapter: string | null
  category: string | null
  attribution: string | null
  is_published: boolean
  is_sample: boolean
}
type PersonOption = { id: string; display_name: string; relationship_label: string | null; message: string | null; is_published: boolean }
type LetterOption = { id: string; author_display: string | null; body: string; is_published: boolean }

export function chapterOneMediaIds(c: ChapterOneContent): (string | null)[] {
  return [...c.album.map((a) => a.mediaId), ...c.moments.flatMap((m) => [...m.mediaIds, m.narrationId])]
}

const ALBUM_SLOTS = ['Featured photograph (large)', 'Overlapping photograph', 'Second overlapping photograph']

function StatusPills({ published, sample }: { published: boolean; sample?: boolean }) {
  return (
    <span className="ml-2 inline-flex gap-1 align-middle">
      {sample && <Pill tone="gold">Sample</Pill>}
      {!published && <Pill>Unpublished</Pill>}
    </span>
  )
}

function useChapterOneSources() {
  const { collection } = useOriginalCollection()
  const [memories, setMemories] = useState<MemoryOption[]>([])
  const [people, setPeople] = useState<PersonOption[]>([])
  const [letters, setLetters] = useState<LetterOption[]>([])
  useEffect(() => {
    if (!collection) return
    let active = true
    void Promise.all([
      supabase
        .from('memories')
        .select('id, title, year, chapter, category, attribution, is_published, is_sample')
        .eq('collection_id', collection.id)
        .order('year', { nullsFirst: false }),
      supabase.from('contributor_profiles').select('id, display_name, relationship_label, message, is_published').order('sort_order'),
      supabase.from('letters').select('id, author_display, body, is_published').eq('collection_id', collection.id).order('sort_order'),
    ]).then(([m, p, l]) => {
      if (!active) return
      setMemories((m.data ?? []) as MemoryOption[])
      setPeople((p.data ?? []) as PersonOption[])
      setLetters((l.data ?? []) as LetterOption[])
    })
    return () => {
      active = false
    }
  }, [collection])
  return { memories, people, letters }
}

function PhotoList({
  ids,
  known,
  remember,
  onChange,
}: {
  ids: string[]
  known: Record<string, PickerMedia>
  remember: (m: PickerMedia) => void
  onChange: (ids: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const urls = useSignedUrls(ids.map((id) => known[id]).filter((m): m is PickerMedia => Boolean(m)))
  return (
    <div>
      <p className="mb-2 text-sm text-ivory">Photographs for this moment</p>
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-6">
        {ids.map((id, i) =>
          known[id] ? (
            <li key={id} className="relative">
              <MediaThumb media={known[id]} url={urls[id]} />
              <div className="absolute top-1 right-1 flex gap-1">
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => onChange(moveItem(ids, i, -1))}
                    className="cursor-pointer rounded-full bg-midnight/85 px-2 text-xs text-ivory hover:text-gold"
                    aria-label="Move photo earlier"
                  >
                    ←
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onChange(ids.filter((x) => x !== id))}
                  className="cursor-pointer rounded-full bg-midnight/85 px-2 text-xs text-ivory hover:text-danger"
                  aria-label="Remove photo"
                >
                  ×
                </button>
              </div>
            </li>
          ) : null,
        )}
      </ul>
      {ids.length < 12 && (
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => setOpen(true)}>
          Add photograph
        </Button>
      )}
      <MediaPicker
        open={open}
        title="Add a photograph to this moment"
        onClose={() => setOpen(false)}
        onPick={(m) => {
          remember(m)
          if (!ids.includes(m.id)) onChange([...ids, m.id])
        }}
      />
    </div>
  )
}

function MomentEditor({
  moment,
  index,
  count,
  memories,
  known,
  remember,
  onChange,
  onMove,
  onRemove,
  onAssign,
}: {
  moment: ChapterOneMoment
  index: number
  count: number
  memories: MemoryOption[]
  known: Record<string, PickerMedia>
  remember: (m: PickerMedia) => void
  onChange: (patch: Partial<ChapterOneMoment>) => void
  onMove: (delta: number) => void
  onRemove: () => void
  onAssign: (memoryId: string, on: boolean) => void
}) {
  const candidates = [...memories].sort((a, b) => Number(belongsToChapterOne(b)) - Number(belongsToChapterOne(a)))
  return (
    <fieldset className="rounded-xl border border-midnight-line p-4 sm:p-5">
      <legend className="px-2 font-serif text-xl">
        Moment {String(index + 1).padStart(2, '0')}
        {moment.hidden && <span className="ml-2 text-sm text-grey">(hidden)</span>}
      </legend>
      <div className="grid gap-4 sm:grid-cols-[10rem_1fr]">
        <Input label="Year or period" hint="e.g. 1996, Early childhood" value={moment.marker} onValue={(v) => onChange({ marker: v })} maxLength={40} />
        <Input label="Title" value={moment.title} onValue={(v) => onChange({ title: v })} maxLength={200} />
        <Area
          className="sm:col-span-2"
          label="Introduction"
          hint="Editorial framing only. Real stories come from the memories you attach below."
          value={moment.description}
          onValue={(v) => onChange({ description: v })}
          maxLength={1000}
          rows={2}
        />
      </div>
      <div className="mt-5 grid gap-6 sm:grid-cols-[10rem_1fr]">
        <MediaSlot
          label="Narration (optional)"
          kinds={['audio']}
          mediaId={moment.narrationId}
          known={known}
          onPick={(m) => {
            if (m) remember(m)
            onChange({ narrationId: m?.id ?? null })
          }}
        />
        <PhotoList ids={moment.mediaIds} known={known} remember={remember} onChange={(mediaIds) => onChange({ mediaIds })} />
      </div>
      <div className="mt-5">
        <p className="mb-1 text-sm text-ivory">Memories in this moment</p>
        <p className="mb-2 text-xs leading-relaxed text-grey">
          Ticked memories appear here in this order. Chapter One memories are listed first. Only published memories reach Roni.
        </p>
        {memories.length === 0 ? (
          <p className="text-xs text-grey">No memories in the archive yet. Approve submissions and add them to the archive first.</p>
        ) : (
          <div className="flex max-h-56 flex-col gap-2 overflow-y-auto rounded-xl border border-midnight-line p-3">
            {candidates.map((mem) => (
              <div key={mem.id} className="flex items-center gap-2">
                <Check
                  label={`${mem.title}${mem.attribution ? ` — ${mem.attribution}` : ''}${mem.year ? ` (${mem.year})` : ''}`}
                  checked={moment.memoryIds.includes(mem.id)}
                  onChecked={(v) => onAssign(mem.id, v)}
                />
                <StatusPills published={mem.is_published} sample={mem.is_sample} />
              </div>
            ))}
          </div>
        )}
        {moment.memoryIds.length > 1 && (
          <ol className="mt-3 flex flex-col gap-1">
            {moment.memoryIds.map((id, i) => {
              const mem = memories.find((m) => m.id === id)
              return (
                <li key={id} className="flex items-center gap-2 text-sm">
                  <span className="w-6 text-grey tabular-nums">{i + 1}.</span>
                  <span className="flex-1 truncate">{mem?.title ?? 'Memory no longer in the archive'}</span>
                  <Button size="sm" variant="ghost" aria-label={`Move ${mem?.title ?? 'memory'} up`} disabled={i === 0} onClick={() => onChange({ memoryIds: moveItem(moment.memoryIds, i, -1) })}>
                    ↑
                  </Button>
                </li>
              )
            })}
          </ol>
        )}
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-midnight-line pt-4">
        <Check label="Hide this moment" hint="Hidden moments and the memories ticked in them are left out." checked={moment.hidden} onChecked={(v) => onChange({ hidden: v })} />
        <div className="ml-auto flex gap-1">
          <Button size="sm" variant="ghost" aria-label={`Move moment ${index + 1} up`} onClick={() => onMove(-1)} disabled={index === 0}>
            ↑
          </Button>
          <Button size="sm" variant="ghost" aria-label={`Move moment ${index + 1} down`} onClick={() => onMove(1)} disabled={index === count - 1}>
            ↓
          </Button>
          <Button size="sm" variant="danger" onClick={onRemove}>
            Remove
          </Button>
        </div>
      </div>
    </fieldset>
  )
}

export function ChapterOneEditor({ value, onChange }: { value: ChapterOneContent; onChange: (v: ChapterOneContent) => void }) {
  const { memories, people, letters } = useChapterOneSources()
  const { known, remember } = useKnownMedia(chapterOneMediaIds(value))
  const set = (patch: Partial<ChapterOneContent>) => onChange({ ...value, ...patch })
  const album = [0, 1, 2].map((i) => value.album[i] ?? { mediaId: null, caption: '' })
  const setAlbum = (i: number, patch: Partial<(typeof album)[number]>) => set({ album: album.map((a, j) => (j === i ? { ...a, ...patch } : a)) })
  const setMoment = (i: number, patch: Partial<ChapterOneMoment>) => set({ moments: value.moments.map((m, j) => (j === i ? { ...m, ...patch } : m)) })
  const assign = (i: number, memoryId: string, on: boolean) =>
    set({
      moments: value.moments.map((m, j) => {
        const without = m.memoryIds.filter((id) => id !== memoryId)
        return { ...m, memoryIds: j === i && on ? [...without, memoryId] : without }
      }),
    })

  const assigned = new Set(value.moments.flatMap((m) => m.memoryIds))
  const automatic = memories.filter((m) => belongsToChapterOne(m) && !assigned.has(m.id))
  const chosen = (kind: 'person' | 'letter', id: string) => value.familyMessages.some((f) => f.kind === kind && f.id === id)
  const toggleMessage = (kind: 'person' | 'letter', id: string, on: boolean) =>
    set({ familyMessages: on ? [...value.familyMessages.filter((f) => !(f.kind === kind && f.id === id)), { kind, id }] : value.familyMessages.filter((f) => !(f.kind === kind && f.id === id)) })

  return (
    <>
      <Notice>
        Chapter One is built from approved memories, photographs and messages. The wording below frames each moment; it never stands in for a
        family story. Save as a draft to see it in your preview, then publish when it’s ready.
      </Notice>
      <div>
        <a href="/#chapter-beginning" target="_blank" rel="noreferrer" className={buttonClasses('secondary', 'sm')}>
          Preview Chapter One
        </a>
      </div>

      <Section title="Introduction" hint="Shown beside the photographs, under the chapter title. Leave a blank line between paragraphs; the last paragraph is set in gold.">
        <Area label="Introduction" value={value.intro} onValue={(v) => set({ intro: v })} maxLength={2000} rows={7} />
      </Section>

      <Section
        title="The family album"
        hint="One large photograph and two smaller ones overlapping it. Empty frames borrow approved photographs from this chapter’s moments and memories; with none at all, a quiet “being gathered” composition is shown."
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {album.map((a, i) => (
            <div key={i} className="flex flex-col gap-3 rounded-xl border border-midnight-line p-3">
              <MediaSlot
                label={ALBUM_SLOTS[i] ?? 'Photograph'}
                mediaId={a.mediaId}
                known={known}
                onPick={(m) => {
                  if (m) remember(m)
                  setAlbum(i, { mediaId: m?.id ?? null })
                }}
              />
              <Input label="Caption" hint={i === 0 ? 'Set as a handwritten-style note.' : undefined} value={a.caption} onValue={(v) => setAlbum(i, { caption: v })} maxLength={200} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Moments" hint="Shown in this order. Rename, reorder, hide or add moments; each one collects the memories you tick.">
        {value.moments.map((m, i) => (
          <MomentEditor
            key={`${m.key}-${i}`}
            moment={m}
            index={i}
            count={value.moments.length}
            memories={memories}
            known={known}
            remember={remember}
            onChange={(patch) => setMoment(i, patch)}
            onMove={(d) => set({ moments: moveItem(value.moments, i, d) })}
            onRemove={() => {
              if (window.confirm(`Remove “${m.title || `Moment ${i + 1}`}”? Its memories stay in the archive.`)) set({ moments: value.moments.filter((_, j) => j !== i) })
            }}
            onAssign={(id, on) => assign(i, id, on)}
          />
        ))}
        {value.moments.length < 8 && (
          <Button
            size="sm"
            variant="secondary"
            className="self-start"
            onClick={() =>
              set({ moments: [...value.moments, { key: `moment-${Date.now()}`, marker: '', title: '', description: '', memoryIds: [], mediaIds: [], narrationId: null, hidden: false }] })
            }
          >
            Add moment
          </Button>
        )}
      </Section>

      <Section
        title="Automatic placement"
        hint="Published memories set in Chapter One (or, with no chapter, dated 2005 or earlier or themed Childhood) that you haven’t ticked above are placed for you: 1996 in the first moment, family stories in “Home”, 2004–2005 in the last, the rest in “Little Roni”."
      >
        <Check label="Place unassigned Chapter One memories automatically" checked={value.autoCollect} onChecked={(v) => set({ autoCollect: v })} />
        {value.autoCollect && automatic.length > 0 && (
          <div className="flex flex-col gap-2 rounded-xl border border-midnight-line p-3">
            <p className="text-xs text-grey">Untick to leave a memory out of Chapter One. It stays in the Memory Vault.</p>
            {automatic.map((mem) => (
              <div key={mem.id} className="flex items-center gap-2">
                <Check
                  label={`${mem.title}${mem.year ? ` (${mem.year})` : ''}`}
                  checked={!value.excludedMemoryIds.includes(mem.id)}
                  onChecked={(v) => set({ excludedMemoryIds: v ? value.excludedMemoryIds.filter((x) => x !== mem.id) : [...value.excludedMemoryIds, mem.id] })}
                />
                <StatusPills published={mem.is_published} sample={mem.is_sample} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="From the people who knew her first"
        hint="Choose up to three messages to feature as letters, usually her parents. Only published cards and letters with real words appear; if none is chosen, Roni doesn’t see this part."
      >
        {people.length + letters.length === 0 ? (
          <p className="text-sm text-grey">No people cards or letters yet.</p>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ivory">People cards</p>
              {people.map((p) => (
                <div key={p.id} className="flex items-center gap-2">
                  <Check
                    label={`${p.display_name}${p.relationship_label ? ` · ${p.relationship_label}` : ''}`}
                    hint={p.message ? `${p.message.slice(0, 80)}${p.message.length > 80 ? '…' : ''}` : 'No message yet'}
                    checked={chosen('person', p.id)}
                    onChecked={(v) => toggleMessage('person', p.id, v)}
                  />
                  {!p.is_published && <Pill>Unpublished</Pill>}
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <p className="text-sm text-ivory">Letters</p>
              {letters.length === 0 && <p className="text-xs text-grey">No letters yet.</p>}
              {letters.map((l) => (
                <div key={l.id} className="flex items-center gap-2">
                  <Check
                    label={l.author_display || 'Unsigned letter'}
                    hint={`${l.body.slice(0, 80)}${l.body.length > 80 ? '…' : ''}`}
                    checked={chosen('letter', l.id)}
                    onChecked={(v) => toggleMessage('letter', l.id, v)}
                  />
                  {!l.is_published && <Pill>Unpublished</Pill>}
                </div>
              ))}
            </div>
          </div>
        )}
        {value.familyMessages.length > 3 && <Notice tone="error">Choose at most three messages.</Notice>}
        <div className="flex items-center gap-2 text-xs text-grey">
          <PublishedPill published={false} /> items are skipped until you publish them.
        </div>
      </Section>
    </>
  )
}
