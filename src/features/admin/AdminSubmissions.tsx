import {
  CATEGORY_QUESTION_KEYS,
  payloadSchema,
  type CategoryQuestionKey,
  type ContributionPayload,
  type ContributorCategory,
} from '@shared/contribution'
import { useCallback, useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { formatInLagos } from '@/lib/launch'
import { useSignedUrls } from '@/lib/media'
import { supabase } from '@/lib/supabase'
import {
  CATEGORY_QUESTIONS,
  LIFE_STAGE_LABELS,
  MEMORY_QUESTIONS,
  MESSAGE_VISIBILITY_COPY,
  NAME_VISIBILITY_COPY,
} from '../contribute/copy'
import { StatusBadge } from './AdminContributors'
import { PageTitle } from './AdminLayout'
import { Area, Check, Input, Panel, Pill } from './kit'

type Row = {
  id: string
  status: string
  submitted_at: string | null
  suggested_chapter: string | null
  message_visibility: 'everyone' | 'roni_only' | 'curator_only'
  imported_at: string | null
  review_notes: string | null
  correction_request: string | null
  submitted_payload: { payload?: unknown; category?: ContributorCategory } | null
  contributor: { full_name: string; category: ContributorCategory; is_sample: boolean } | null
}

type Removal = {
  id: string
  details: string
  status: string
  created_at: string
  contributor: { full_name: string } | null
}

type Media = { id: string; bucket: string; storage_path: string; purpose: string; kind: string; original_filename: string | null }

type Approval = { id: string; action: string; notes: string | null; created_at: string }

const FILTERS = [
  { key: 'review', label: 'To review', statuses: ['submitted', 'in_review'] },
  { key: 'approved', label: 'Approved', statuses: ['approved'] },
  { key: 'changes', label: 'Changes requested', statuses: ['changes_requested'] },
  { key: 'closed', label: 'Rejected & hidden', statuses: ['rejected', 'hidden'] },
  { key: 'all', label: 'All', statuses: [] as string[] },
] as const

const MEMORY_TITLES: Record<keyof typeof MEMORY_QUESTIONS | CategoryQuestionKey, string> = {
  earliest: 'A first memory',
  favourite: 'A favourite memory',
  unknownFact: 'Something people might not know',
  funniest: 'The funniest moment',
  birthDay: 'The day she was born',
  childhoodPersonality: 'As a child',
  childhoodMemories: 'Childhood memories',
  milestones: 'Milestones',
  lessons: 'What raising her taught me',
  hopes: 'Hopes for her future',
  adventures: 'Childhood adventures',
  traditions: 'Family traditions',
  funnyMemories: 'Funny memories',
  insideJokes: 'An inside joke',
  admireToday: 'Admiring her today',
  howWeMet: 'How we met',
  firstImpressions: 'First impressions',
  sharedExperiences: 'Shared experiences',
  friendshipMoments: 'Moments that shaped our friendship',
  nextDecadeHopes: 'Hopes for her next decade',
}

const MEMORY_CATEGORY: Partial<Record<keyof typeof MEMORY_QUESTIONS | CategoryQuestionKey, string>> = {
  earliest: 'childhood',
  birthDay: 'childhood',
  childhoodPersonality: 'childhood',
  childhoodMemories: 'childhood',
  adventures: 'childhood',
  traditions: 'family',
  funniest: 'funny',
  funnyMemories: 'funny',
  insideJokes: 'funny',
  milestones: 'milestone',
  howWeMet: 'friendship',
  firstImpressions: 'friendship',
  sharedExperiences: 'friendship',
  friendshipMoments: 'friendship',
  unknownFact: 'reflection',
  lessons: 'reflection',
  hopes: 'reflection',
  admireToday: 'reflection',
  nextDecadeHopes: 'reflection',
}

const categoryFor = (key: keyof typeof MEMORY_CATEGORY, contributor: ContributorCategory) =>
  MEMORY_CATEGORY[key] ?? (contributor === 'friend' ? 'friendship' : 'family')

export function AdminSubmissions() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [drafts, setDrafts] = useState(0)
  const [removals, setRemovals] = useState<Removal[]>([])
  const [params] = useSearchParams()
  const [selected, setSelected] = useState<string | null>(() => params.get('id'))
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>(() => (params.get('id') ? 'all' : 'review'))
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const [submitted, draftCount, removalRows] = await Promise.all([
      supabase
        .from('contributions')
        .select(
          'id, status, submitted_at, suggested_chapter, message_visibility, imported_at, review_notes, correction_request, submitted_payload, contributor:contributors(full_name, category, is_sample)',
        )
        .neq('status', 'draft')
        .order('submitted_at', { ascending: false }),
      supabase.from('contributions').select('id', { count: 'exact', head: true }).eq('status', 'draft'),
      supabase
        .from('removal_requests')
        .select('id, details, status, created_at, contributor:contributors(full_name)')
        .order('created_at', { ascending: false }),
    ])
    if (submitted.error) setError('Could not load submissions.')
    setRows((submitted.data ?? []) as unknown as Row[])
    setDrafts(draftCount.count ?? 0)
    setRemovals((removalRows.data ?? []) as unknown as Removal[])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const active = FILTERS.find((f) => f.key === filter)!
  const visible = (rows ?? []).filter((r) => active.statuses.length === 0 || (active.statuses as readonly string[]).includes(r.status))
  const current = rows?.find((r) => r.id === selected) ?? null
  const countFor = (f: (typeof FILTERS)[number]) =>
    (rows ?? []).filter((r) => f.statuses.length === 0 || (f.statuses as readonly string[]).includes(r.status)).length

  return (
    <>
      <PageTitle eyebrow="Review & approve" title="Submissions" />
      <Notice className="mb-8">
        Contributors’ original words are preserved exactly as submitted and are never changed here. Approving a submission does
        not publish anything: use <strong>Add to the archive</strong> to create editable, unpublished copies, then publish them
        from Stories, Wishes or People.
        {drafts > 0 && ` ${drafts} contribution${drafts === 1 ? ' is' : 's are'} still being written; drafts stay private until submitted.`}
      </Notice>
      {error && <Notice tone="error" className="mb-6">{error}</Notice>}

      <div role="tablist" aria-label="Filter submissions" className="mb-6 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            role="tab"
            type="button"
            aria-selected={filter === f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              'cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors',
              filter === f.key ? 'border-gold bg-gold/10 text-gold-bright' : 'border-midnight-line text-grey hover:text-ivory',
            )}
          >
            {f.label} <span className="tabular-nums opacity-70">{countFor(f)}</span>
          </button>
        ))}
      </div>

      {!rows ? (
        <Spinner label="Loading…" />
      ) : visible.length === 0 ? (
        <p className="text-grey">Nothing here.</p>
      ) : (
        <div className="grid gap-8 lg:grid-cols-[20rem_1fr]">
          <ul className="flex flex-col gap-2" aria-label="Submissions">
            {visible.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => setSelected(row.id)}
                  aria-current={selected === row.id || undefined}
                  className={cn(
                    'flex w-full cursor-pointer flex-col gap-1 rounded-xl border px-4 py-3 text-left transition-colors',
                    selected === row.id ? 'border-gold bg-gold/[0.06]' : 'border-midnight-line hover:border-gold/40',
                  )}
                >
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-ivory">{row.contributor?.full_name ?? 'Unknown'}</span>
                    <span className="flex shrink-0 items-center gap-1.5">
                      {row.contributor?.is_sample && <Pill tone="gold">Sample</Pill>}
                      <StatusBadge status={row.status} />
                    </span>
                  </span>
                  <span className="text-xs text-grey">
                    {row.submitted_at ? formatInLagos(row.submitted_at, { dateStyle: 'medium', timeStyle: 'short' }) : '—'}
                    {row.imported_at ? ' · in the archive' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div>
            {current ? (
              <SubmissionDetail key={current.id} row={current} onChange={() => void load()} />
            ) : (
              <p className="text-grey">Select a submission to read it.</p>
            )}
          </div>
        </div>
      )}

      <RemovalRequests removals={removals} onChange={() => void load()} />
    </>
  )
}

function SubmissionDetail({ row, onChange }: { row: Row; onChange: () => void }) {
  const [media, setMedia] = useState<Media[] | null>(null)
  const urls = useSignedUrls(media)
  const parsed = payloadSchema.safeParse(row.submitted_payload?.payload ?? {})
  const payload: ContributionPayload | null = parsed.success ? parsed.data : null
  const category = row.submitted_payload?.category ?? row.contributor?.category ?? 'friend'

  useEffect(() => {
    let active = true
    void supabase
      .from('media_assets')
      .select('id, bucket, storage_path, purpose, kind, original_filename')
      .eq('contribution_id', row.id)
      .eq('status', 'verified')
      .order('created_at')
      .then(({ data }) => {
        if (active) setMedia((data ?? []) as Media[])
      })
    return () => {
      active = false
    }
  }, [row.id])

  if (!payload) return <Notice tone="error">This submission could not be read.</Notice>

  const qa: [string, string][] = [
    ...(Object.keys(MEMORY_QUESTIONS) as (keyof typeof MEMORY_QUESTIONS)[]).map((k) => [MEMORY_QUESTIONS[k], payload.memories[k]] as [string, string]),
    ...CATEGORY_QUESTION_KEYS[category].map((k) => [CATEGORY_QUESTIONS[k], payload.categoryAnswers[k] ?? ''] as [string, string]),
    ['Three things that make her special', payload.celebrating.specialThings.join(' · ')],
    ['What they admire most', payload.celebrating.admire],
    ['Roni in three words', payload.celebrating.threeWords.join(', ')],
    ['As she turns thirty', payload.message.turningThirty],
    ['Wish for her next decade', payload.message.nextDecadeWish],
  ]
  const t = payload.timeline
  const when =
    t.precision === 'specific_year' ? String(t.year) : t.precision === 'approximate_year' ? `Around ${t.year}` : t.precision === 'life_stage' && t.lifeStage ? LIFE_STAGE_LABELS[t.lifeStage] : 'Not sure'

  return (
    <div className="flex flex-col gap-6">
      <ReviewPanel row={row} onChange={onChange} />
      {row.status === 'approved' && <ImportPanel row={row} payload={payload} category={category} onChange={onChange} />}

      <article className="rounded-2xl border border-midnight-line p-6 sm:p-8" aria-label="Original submission">
        <header className="border-b border-midnight-line pb-6">
          <p className="eyebrow">Original, as submitted</p>
          <h2 className="mt-2 font-serif text-3xl">{payload.introduction.fullName}</h2>
          <p className="text-grey">{payload.introduction.relationship}</p>
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            <div><dt className="inline text-grey">Name shown as: </dt><dd className="inline">{NAME_VISIBILITY_COPY[payload.consent.nameVisibility].label}</dd></div>
            <div><dt className="inline text-grey">Visible to: </dt><dd className="inline">{MESSAGE_VISIBILITY_COPY[payload.consent.messageVisibility].label}</dd></div>
            <div><dt className="inline text-grey">When: </dt><dd className="inline">{when}</dd></div>
            <div><dt className="inline text-grey">Suggested chapter: </dt><dd className="inline">{row.suggested_chapter?.replaceAll('_', ' ') ?? '—'}</dd></div>
            <div><dt className="inline text-grey">Permission confirmed: </dt><dd className="inline">{payload.consent.permission ? 'Yes' : 'No'}</dd></div>
          </dl>
        </header>

        <div className="flex flex-col gap-6 py-6">
          {qa
            .filter(([, a]) => a.trim())
            .map(([q, a]) => (
              <div key={q}>
                <p className="text-sm text-grey">{q}</p>
                <p className="mt-1 leading-relaxed whitespace-pre-line text-ivory/90">{a}</p>
              </div>
            ))}
          {payload.letter.body.trim() && (
            <div>
              <p className="text-sm text-grey">Letter</p>
              <p className="mt-2 font-serif text-lg leading-relaxed whitespace-pre-line text-ivory/90">{payload.letter.body}</p>
            </div>
          )}
        </div>

        <section className="border-t border-midnight-line pt-6" aria-label="Uploads">
          <h3 className="mb-4 font-serif text-xl">Uploads</h3>
          {!media ? (
            <Spinner />
          ) : media.length === 0 ? (
            <p className="text-sm text-grey">No uploads.</p>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {media.map((m) => {
                const url = urls[m.id]
                return m.kind === 'image' ? (
                  <a key={m.id} href={url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-midnight-line">
                    {url ? <img src={url} alt={`${m.purpose.replace('_', ' ')}: ${m.original_filename ?? ''}`} className="aspect-square w-full object-cover" /> : <div className="aspect-square" />}
                    <span className="block truncate px-2 py-1 text-xs text-grey">{m.purpose === 'profile_photo' ? 'Profile photo' : m.original_filename}</span>
                  </a>
                ) : m.kind === 'video' ? (
                  <video key={m.id} controls preload="metadata" src={url} className="col-span-2 w-full rounded-xl sm:col-span-3" />
                ) : (
                  <audio key={m.id} controls preload="metadata" src={url} className="col-span-2 w-full sm:col-span-3" />
                )
              })}
            </div>
          )}
          <p className="mt-4 text-xs text-grey">
            Alt text, captions and transcripts for these files are edited in the <Link to="/admin/library" className="underline underline-offset-4 hover:text-ivory">Library</Link>.
          </p>
        </section>
      </article>
    </div>
  )
}

const ACTION_LABEL: Record<string, string> = {
  submitted: 'Submitted',
  resubmitted: 'Resubmitted after changes',
  approved: 'Approved',
  rejected: 'Rejected',
  changes_requested: 'Changes requested',
  hidden: 'Hidden',
  restored: 'Returned to review',
  edited: 'Added to the archive',
}

function ReviewPanel({ row, onChange }: { row: Row; onChange: () => void }) {
  const [history, setHistory] = useState<Approval[]>([])
  const [mode, setMode] = useState<'changes' | 'notes' | null>(null)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('content_approvals')
      .select('id, action, notes, created_at')
      .eq('contribution_id', row.id)
      .order('created_at', { ascending: false })
    setHistory((data ?? []) as Approval[])
  }, [row.id])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const act = async (action: 'approved' | 'rejected' | 'changes_requested' | 'hidden' | 'restored', confirmText?: string) => {
    if (confirmText && !window.confirm(confirmText)) return
    if (action === 'changes_requested' && !text.trim()) {
      setError('Explain what the contributor should change.')
      return
    }
    setBusy(action)
    setError(null)
    const { error: e } = await supabase.rpc('admin_review_contribution', {
      p_contribution_id: row.id,
      p_action: action,
      p_notes: mode === 'notes' ? text : null,
      p_correction: action === 'changes_requested' ? text : null,
    })
    setBusy(null)
    if (e) {
      setError(e.message || 'Could not update the submission.')
      return
    }
    setMode(null)
    setText('')
    void loadHistory()
    onChange()
  }

  const s = row.status
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="font-serif text-2xl">Review</h2>
          <StatusBadge status={s} />
        </div>
        <div className="flex flex-wrap gap-2">
          {s !== 'approved' && (
            <Button size="sm" onClick={() => void act('approved')} loading={busy === 'approved'}>
              Approve
            </Button>
          )}
          {(s === 'submitted' || s === 'in_review' || s === 'approved') && (
            <Button size="sm" variant="secondary" onClick={() => setMode(mode === 'changes' ? null : 'changes')}>
              Request changes
            </Button>
          )}
          {s !== 'rejected' && (
            <Button
              size="sm"
              variant="danger"
              onClick={() => void act('rejected', 'Reject this submission? Anything already added to the archive from it will be unpublished.')}
              loading={busy === 'rejected'}
            >
              Reject
            </Button>
          )}
          {s !== 'hidden' && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => void act('hidden', 'Hide this submission? Anything published from it will be unpublished immediately.')}
              loading={busy === 'hidden'}
            >
              Hide
            </Button>
          )}
          {(s === 'rejected' || s === 'hidden' || s === 'approved' || s === 'changes_requested') && (
            <Button size="sm" variant="ghost" onClick={() => void act('restored')} loading={busy === 'restored'}>
              Return to review
            </Button>
          )}
        </div>
      </div>

      {s === 'changes_requested' && row.correction_request && (
        <p className="mt-4 text-sm text-grey">
          Waiting for the contributor. You asked: <span className="text-ivory/85">“{row.correction_request}”</span> They will see this
          note the next time they open their link.
        </p>
      )}
      {row.message_visibility === 'curator_only' && (
        <Notice className="mt-4">The contributor asked for this to be seen by the curator only. It cannot be added to the archive.</Notice>
      )}

      {mode === 'changes' && (
        <div className="mt-5 flex flex-col gap-3">
          <Area
            label="What should they change?"
            hint="Shown to the contributor when they next open their link. Their original stays preserved."
            value={text}
            onValue={setText}
            maxLength={4000}
            rows={3}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={() => void act('changes_requested')} loading={busy === 'changes_requested'}>
              Send request
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
      {error && <Notice tone="error" className="mt-4">{error}</Notice>}

      {history.length > 0 && (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer text-grey hover:text-ivory">History ({history.length})</summary>
          <ol className="mt-3 flex flex-col gap-2 border-l border-midnight-line pl-4">
            {history.map((h) => (
              <li key={h.id}>
                <span className="text-ivory">{ACTION_LABEL[h.action] ?? h.action}</span>
                <span className="text-grey"> · {formatInLagos(h.created_at, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                {h.notes && <p className="text-grey">{h.notes}</p>}
              </li>
            ))}
          </ol>
        </details>
      )}
    </Panel>
  )
}

type DraftMemory = { key: keyof typeof MEMORY_CATEGORY; include: boolean; title: string; story: string }

function ImportPanel({
  row,
  payload,
  category,
  onChange,
}: {
  row: Row
  payload: ContributionPayload
  category: ContributorCategory
  onChange: () => void
}) {
  const initialMemories = (): DraftMemory[] => [
    ...(Object.keys(MEMORY_QUESTIONS) as (keyof typeof MEMORY_QUESTIONS)[]).map((k) => ({
      key: k,
      include: Boolean(payload.memories[k].trim()),
      title: MEMORY_TITLES[k],
      story: payload.memories[k],
    })),
    ...CATEGORY_QUESTION_KEYS[category].map((k) => ({
      key: k,
      include: Boolean(payload.categoryAnswers[k]?.trim()),
      title: MEMORY_TITLES[k],
      story: payload.categoryAnswers[k] ?? '',
    })),
  ].filter((m) => m.story.trim())

  const [memories, setMemories] = useState<DraftMemory[]>(initialMemories)
  const [wish, setWish] = useState(payload.message.nextDecadeWish)
  const [letter, setLetter] = useState(payload.letter.body)
  const [profile, setProfile] = useState(payload.message.turningThirty)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)

  if (row.message_visibility === 'curator_only') return null
  if (row.imported_at) {
    return (
      <Notice tone="success" title="In the archive">
        Added {formatInLagos(row.imported_at, { dateStyle: 'medium', timeStyle: 'short' })} as unpublished drafts. Edit and publish them in{' '}
        <Link to="/admin/stories" className="underline underline-offset-4">Stories</Link>,{' '}
        <Link to="/admin/wishes" className="underline underline-offset-4">Wishes</Link> and{' '}
        <Link to="/admin/people" className="underline underline-offset-4">People</Link>.
      </Notice>
    )
  }

  const update = (i: number, patch: Partial<DraftMemory>) => setMemories((list) => list.map((m, j) => (j === i ? { ...m, ...patch } : m)))

  const submit = async () => {
    setBusy(true)
    setError(null)
    const { data, error: e } = await supabase.rpc('admin_import_contribution', {
      p_contribution_id: row.id,
      p_items: {
        memories: memories.filter((m) => m.include && m.story.trim()).map((m) => ({ title: m.title, story: m.story, category: categoryFor(m.key, category) })),
        wish,
        letter,
        profile_message: profile,
      },
    })
    setBusy(false)
    if (e) {
      setError(e.message || 'Could not add this to the archive.')
      return
    }
    const r = data as { memories: number; wish: boolean; letter: boolean; profile: boolean }
    setResult(
      [`${r.memories} ${r.memories === 1 ? 'memory' : 'memories'}`, r.wish && 'a wish', r.letter && 'a letter', r.profile && 'a profile card']
        .filter(Boolean)
        .join(', '),
    )
    onChange()
  }

  return (
    <Panel className="border-gold/30">
      <h2 className="font-serif text-2xl">Add to the archive</h2>
      <p className="mt-1 text-sm leading-relaxed text-grey">
        Creates editable copies in the Original Thirty, all unpublished. Edit titles and lightly trim wording if needed; the original
        above is never changed. Attribution and audience follow the contributor’s choices
        {row.message_visibility === 'roni_only' ? ' (Roni only)' : ''}.
      </p>
      {result && <Notice tone="success" className="mt-4">Added {result}.</Notice>}

      <div className="mt-6 flex flex-col gap-5">
        {memories.map((m, i) => (
          <fieldset key={m.key} className="flex flex-col gap-3 rounded-xl border border-midnight-line p-4">
            <legend className="sr-only">{m.title}</legend>
            <Check label="Include as a memory" checked={m.include} onChecked={(v) => update(i, { include: v })} />
            {m.include && (
              <>
                <Input label="Title" value={m.title} onValue={(v) => update(i, { title: v })} maxLength={200} />
                <Area label="Story" value={m.story} onValue={(v) => update(i, { story: v })} maxLength={20000} rows={3} />
              </>
            )}
          </fieldset>
        ))}
        <Area label="Birthday wish" hint="Becomes a candidate for the thirty-star constellation. Leave empty to skip." value={wish} onValue={setWish} maxLength={2000} rows={2} />
        <Area label="Profile message" hint="Shown on their card in Through Their Eyes." value={profile} onValue={setProfile} maxLength={8000} rows={3} />
        <Area label="Letter" hint="Becomes an envelope in Words Worth Keeping. A voice note, if any, is attached." value={letter} onValue={setLetter} maxLength={40000} rows={4} />
      </div>
      {error && <Notice tone="error" className="mt-4">{error}</Notice>}
      <Button className="mt-6" onClick={() => void submit()} loading={busy}>
        Add to the archive
      </Button>
    </Panel>
  )
}

function RemovalRequests({ removals, onChange }: { removals: Removal[]; onChange: () => void }) {
  const auth = useAuth()
  const [busy, setBusy] = useState<string | null>(null)
  if (!removals.length) return null
  const resolve = async (id: string, status: 'resolved' | 'declined') => {
    setBusy(id)
    await supabase
      .from('removal_requests')
      .update({ status, resolved_at: new Date().toISOString(), resolved_by: auth.user?.id ?? null })
      .eq('id', id)
    setBusy(null)
    onChange()
  }
  return (
    <section className="mt-16" aria-labelledby="removals-heading">
      <h2 id="removals-heading" className="font-serif text-3xl">
        Change and removal requests
      </h2>
      <ul className="mt-6 flex flex-col gap-3">
        {removals.map((r) => (
          <li key={r.id} className="rounded-xl border border-midnight-line p-4">
            <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-ivory">{r.contributor?.full_name ?? 'Unknown'}</span>
              <span className="text-grey">{formatInLagos(r.created_at, { dateStyle: 'medium', timeStyle: 'short' })} · {r.status}</span>
            </div>
            <p className="mt-2 text-sm leading-relaxed whitespace-pre-line text-ivory/85">{r.details}</p>
            {r.status === 'open' && (
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => void resolve(r.id, 'resolved')} loading={busy === r.id}>
                  Mark handled
                </Button>
                <Button size="sm" variant="ghost" onClick={() => void resolve(r.id, 'declined')} disabled={busy === r.id}>
                  Decline
                </Button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}
