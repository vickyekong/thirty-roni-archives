import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { useSignedUrls } from '@/lib/media'
import { Dialog, MediaPlayer, Photo, plural } from '@/features/experience/ui'
import { EntryEditor } from './EntryEditor'
import { deleteEntry, KINDS, kindLabel, loadStory, saveOrder, type EntryKind, type Story, type StoryEntry } from './story'

type Filter = 'all' | EntryKind
type Order = 'arranged' | 'year'

export function ContinuingStory({ collectionId, userId }: { collectionId: string; userId: string }) {
  const [story, setStory] = useState<Story | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [version, setVersion] = useState(0)
  const [filter, setFilter] = useState<Filter>('all')
  const [order, setOrder] = useState<Order>('arranged')
  const [editor, setEditor] = useState<{ kind: EntryKind; entry: StoryEntry | null } | null>(null)
  const [viewing, setViewing] = useState<string | null>(null)
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null)
  const addRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    loadStory(collectionId)
      .then((s) => active && (setStory(s), setLoadError(false)))
      .catch(() => active && setLoadError(true))
    return () => {
      active = false
    }
  }, [collectionId, version])

  const mediaList = useMemo(() => (story ? Object.values(story.media) : null), [story])
  const urls = useSignedUrls(mediaList)
  const reload = () => setVersion((v) => v + 1)

  if (loadError)
    return (
      <Notice tone="error">
        Your story could not be loaded.{' '}
        <button type="button" className="cursor-pointer underline underline-offset-4" onClick={reload}>
          Try again
        </button>
      </Notice>
    )
  if (!story) return <Spinner label="Loading your story…" />

  const counts = Object.fromEntries(KINDS.map((k) => [k.kind, story.entries.filter((e) => e.kind === k.kind).length])) as Record<EntryKind, number>
  const filtered = story.entries.filter((e) => filter === 'all' || e.kind === filter)
  const shown = order === 'year' ? [...filtered].sort((a, b) => (b.year ?? -1) - (a.year ?? -1) || b.createdAt.localeCompare(a.createdAt)) : filtered
  const canArrange = filter === 'all' && order === 'arranged' && story.entries.length > 1
  const topSortOrder = Math.min(0, ...story.entries.map((e) => e.sortOrder)) - 1
  const current = story.entries.find((e) => e.id === viewing) ?? null

  const move = async (index: number, delta: -1 | 1) => {
    const next = [...story.entries]
    const [item] = next.splice(index, 1)
    next.splice(index + delta, 0, item!)
    const previous = story
    setStory({ ...story, entries: next.map((e, i) => ({ ...e, sortOrder: i })) })
    try {
      await saveOrder(next)
      setMessage({ tone: 'success', text: `Moved “${item!.title}” ${delta < 0 ? 'up' : 'down'}.` })
    } catch {
      setStory(previous)
      setMessage({ tone: 'error', text: 'The new order could not be saved. Please try again.' })
    }
  }

  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div ref={addRef} className="grid gap-3 sm:flex sm:flex-wrap">
          {KINDS.map((k) => (
            <Button key={k.kind} variant={k.kind === 'memory' ? 'primary' : 'secondary'} onClick={() => setEditor({ kind: k.kind, entry: null })}>
              {k.add}
            </Button>
          ))}
        </div>
        <div aria-live="polite">{message && <Notice tone={message.tone}>{message.text}</Notice>}</div>
      </div>

      {story.entries.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-grey/40 px-6 py-16 text-center">
          <p className="display text-3xl text-ivory sm:text-4xl">The next chapter is yours to write.</p>
          <p className="mx-auto mt-4 max-w-md leading-relaxed text-ivory/70">
            Nothing here yet. Add a memory, a photo, a milestone or a few thoughts. Only you can see what you add.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div role="group" aria-label="Show" className="flex flex-wrap gap-2">
              <Chip active={filter === 'all'} onClick={() => setFilter('all')}>
                Everything · {story.entries.length}
              </Chip>
              {KINDS.filter((k) => counts[k.kind] > 0).map((k) => (
                <Chip key={k.kind} active={filter === k.kind} onClick={() => setFilter(k.kind)}>
                  {k.plural} · {counts[k.kind]}
                </Chip>
              ))}
            </div>
            <div role="group" aria-label="Order" className="flex gap-2">
              <Chip active={order === 'arranged'} onClick={() => setOrder('arranged')}>
                My order
              </Chip>
              <Chip active={order === 'year'} onClick={() => setOrder('year')}>
                By year
              </Chip>
            </div>
          </div>
          {!canArrange && story.entries.length > 1 && (
            <p className="-mt-6 text-xs text-grey">To rearrange, show everything in your order.</p>
          )}
          <p className="sr-only" role="status">
            Showing {plural(shown.length, 'entry', 'entries')}
          </p>

          <ol className="flex flex-col gap-4">
            {shown.map((entry, i) => (
              <EntryCard
                key={entry.id}
                entry={entry}
                story={story}
                urls={urls}
                onOpen={() => setViewing(entry.id)}
                arrange={
                  canArrange
                    ? {
                        up: i > 0 ? () => void move(i, -1) : undefined,
                        down: i < shown.length - 1 ? () => void move(i, 1) : undefined,
                      }
                    : undefined
                }
              />
            ))}
          </ol>
        </>
      )}

      {current && (
        <EntryView
          entry={current}
          story={story}
          urls={urls}
          onClose={() => setViewing(null)}
          onEdit={() => {
            setViewing(null)
            setEditor({ kind: current.kind, entry: current })
          }}
          onDeleted={() => {
            setViewing(null)
            requestAnimationFrame(() => addRef.current?.querySelector('button')?.focus({ preventScroll: true }))
            setMessage({ tone: 'success', text: `“${current.title}” was deleted.` })
            reload()
          }}
        />
      )}

      {editor && (
        <EntryEditor
          kind={editor.kind}
          entry={editor.entry}
          story={story}
          urls={urls}
          collectionId={collectionId}
          userId={userId}
          topSortOrder={topSortOrder}
          onClose={() => {
            setEditor(null)
            if (editor.entry) focusCard(editor.entry.id)
          }}
          onSaved={(text) => {
            setEditor(null)
            if (editor.entry) focusCard(editor.entry.id)
            setMessage({ tone: 'success', text })
            reload()
          }}
        />
      )}
    </div>
  )
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-10 cursor-pointer rounded-full border px-4 text-sm transition-colors',
        active ? 'border-gold/60 bg-gold/15 text-gold-bright' : 'border-midnight-line text-ivory/70 hover:border-ivory/30 hover:text-ivory',
      )}
    >
      {children}
    </button>
  )
}

// The editor for an existing entry is opened from the entry view, which is gone by the time it closes.
const focusCard = (id: string) =>
  requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-entry="${id}"]`)?.focus({ preventScroll: true }))

const meta = (e: StoryEntry) => [kindLabel(e.kind), e.year].filter(Boolean).join(' · ')

function mediaCount(entry: StoryEntry, story: Story) {
  const videos = entry.mediaIds.filter((id) => story.media[id]?.kind === 'video').length
  const photos = entry.mediaIds.length - videos
  return [photos && plural(photos, 'photo'), videos && plural(videos, 'video')].filter(Boolean).join(' and ')
}

function EntryCard({
  entry,
  story,
  urls,
  onOpen,
  arrange,
}: {
  entry: StoryEntry
  story: Story
  urls: Record<string, string>
  onOpen: () => void
  arrange?: { up?: () => void; down?: () => void }
}) {
  const cover = entry.mediaIds.map((id) => story.media[id]).find((m) => m?.kind === 'image')
  const coverUrl = cover ? urls[cover.id] : undefined
  const count = mediaCount(entry, story)
  return (
    <li className="flex items-stretch gap-3 rounded-2xl border border-midnight-line bg-midnight-raised/60">
      <button type="button" data-entry={entry.id} onClick={onOpen} className="flex min-w-0 flex-1 cursor-pointer items-start gap-4 p-4 text-left sm:p-5">
        {coverUrl ? (
          <img src={coverUrl} alt="" className="size-20 shrink-0 rounded-xl object-cover sm:size-24" />
        ) : (
          <span aria-hidden="true" className="grid size-20 shrink-0 place-items-center rounded-xl bg-midnight font-serif text-3xl text-gold/70 sm:size-24">
            {entry.kind === 'reflection' ? '“' : entry.kind === 'milestone' ? (entry.year ?? '✦') : '✦'}
          </span>
        )}
        <span className="flex min-w-0 flex-col gap-1">
          <span className="text-[0.6875rem] tracking-[0.2em] text-gold uppercase">{meta(entry)}</span>
          <span className="font-serif text-2xl leading-snug text-ivory">{entry.title}</span>
          {entry.body && <span className="line-clamp-2 text-sm leading-relaxed text-ivory/70">{entry.body}</span>}
          {count && <span className="text-xs text-grey">{count}</span>}
        </span>
      </button>
      {arrange && (
        <div className="flex flex-col justify-center gap-1 border-l border-midnight-line px-2">
          <ArrangeButton label={`Move “${entry.title}” up`} onClick={arrange.up}>
            ↑
          </ArrangeButton>
          <ArrangeButton label={`Move “${entry.title}” down`} onClick={arrange.down}>
            ↓
          </ArrangeButton>
        </div>
      )}
    </li>
  )
}

function ArrangeButton({ label, onClick, children }: { label: string; onClick?: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={!onClick}
      onClick={onClick}
      className="grid size-10 cursor-pointer place-items-center rounded-full text-lg text-ivory/70 hover:bg-ivory/5 hover:text-gold-bright disabled:cursor-default disabled:opacity-25"
    >
      <span aria-hidden="true">{children}</span>
    </button>
  )
}

function EntryView({
  entry,
  story,
  urls,
  onClose,
  onEdit,
  onDeleted,
}: {
  entry: StoryEntry
  story: Story
  urls: Record<string, string>
  onClose: () => void
  onEdit: () => void
  onDeleted: () => void
}) {
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const media = entry.mediaIds
    .map((id) => story.media[id])
    .filter((m) => m && urls[m.id])
    .map((m) => ({ ...m!, url: urls[m!.id]! }))

  const remove = async () => {
    setDeleting(true)
    setError(null)
    try {
      await deleteEntry(entry, story)
      onDeleted()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'This entry could not be deleted.')
      setDeleting(false)
    }
  }

  return (
    <Dialog open onClose={onClose} title={entry.title} canClose={() => !deleting}>
      <p className="-mt-3 text-xs tracking-[0.2em] text-gold uppercase">{meta(entry)}</p>
      {media.length > 0 && (
        <div className="mt-6 flex flex-col gap-4">
          {media.map((m) =>
            m.kind === 'image' ? (
              <figure key={m.id}>
                <Photo media={m} className="rounded-xl" />
                {m.alt_text && <figcaption className="mt-2 text-sm text-ivory/60">{m.alt_text}</figcaption>}
              </figure>
            ) : (
              <MediaPlayer key={m.id} media={m} label={m.alt_text || `Video in “${entry.title}”`} />
            ),
          )}
        </div>
      )}
      {entry.body && <p className="mt-6 leading-relaxed whitespace-pre-line text-ivory/85">{entry.body}</p>}

      <div className="mt-10 border-t border-midnight-line pt-6">
        {confirming ? (
          <div className="flex flex-col gap-4" role="group" aria-label="Confirm deletion">
            <p className="text-sm text-ivory/85">
              Delete “{entry.title}”{entry.mediaIds.length ? ` and its ${mediaCount(entry, story)}` : ''}? This cannot be undone.
            </p>
            {error && <Notice tone="error">{error}</Notice>}
            <div className="flex flex-wrap gap-3">
              <Button variant="danger" loading={deleting} onClick={() => void remove()}>
                Delete for good
              </Button>
              <Button variant="ghost" disabled={deleting} onClick={() => setConfirming(false)}>
                Keep it
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button variant="secondary" onClick={onEdit}>
              Edit
            </Button>
            <Button variant="danger" onClick={() => setConfirming(true)}>
              Delete
            </Button>
          </div>
        )}
      </div>
    </Dialog>
  )
}
