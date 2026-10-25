import { useCallback, useEffect, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'
import { PageTitle } from './AdminLayout'
import { AUDIENCE_OPTIONS, Area, Check, Input, LockedNotice, Panel, Pill, Select, useOriginalCollection, type Audience } from './kit'

type Wish = {
  id: string
  author_display: string | null
  message: string
  is_curator_original: boolean
  star_index: number | null
  is_final_star: boolean
  audience: Audience
  is_published: boolean
  contribution_id: string | null
}

type Arrangement = Record<string, { star: number | null; published: boolean }>

const STARS = Array.from({ length: 30 }, (_, i) => i + 1)

export function AdminWishes() {
  const { collection } = useOriginalCollection()
  const [wishes, setWishes] = useState<Wish[] | null>(null)
  const [arr, setArr] = useState<Arrangement>({})
  const [finalId, setFinalId] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState<string | 'new' | null>(null)
  const [message, setMessage] = useState<{ tone: 'error' | 'success'; text: string } | null>(null)
  const locked = Boolean(collection?.is_locked)

  const load = useCallback(async () => {
    if (!collection) return
    const { data } = await supabase
      .from('birthday_wishes')
      .select('id, author_display, message, is_curator_original, star_index, is_final_star, audience, is_published, contribution_id')
      .eq('collection_id', collection.id)
      .order('star_index', { nullsFirst: false })
      .order('created_at')
    const list = (data ?? []) as Wish[]
    setWishes(list)
    setArr(Object.fromEntries(list.map((w) => [w.id, { star: w.star_index, published: w.is_published }])))
    setFinalId(list.find((w) => w.is_final_star)?.id ?? null)
    setDirty(false)
  }, [collection])

  useEffect(() => {
    void load()
  }, [load])

  const taken = new Map(Object.entries(arr).filter(([, v]) => v.star !== null).map(([id, v]) => [v.star!, id]))
  const update = (id: string, patch: Partial<Arrangement[string]>) => {
    setArr((a) => ({ ...a, [id]: { ...a[id]!, ...patch } }))
    setDirty(true)
    setMessage(null)
  }

  const autofill = () => {
    const next = { ...arr }
    const used = new Set(Object.values(next).map((v) => v.star).filter((s): s is number => s !== null))
    const free = STARS.filter((s) => !used.has(s))
    for (const w of wishes ?? []) {
      if (next[w.id]!.star === null && free.length) next[w.id] = { ...next[w.id]!, star: free.shift()! }
    }
    setArr(next)
    setDirty(true)
  }

  const save = async () => {
    if (!wishes) return
    if (finalId && arr[finalId]?.star === null) {
      setMessage({ tone: 'error', text: 'The final star must be one of the placed wishes.' })
      return
    }
    const unpublishedStars = wishes.filter((w) => arr[w.id]!.star !== null && !arr[w.id]!.published)
    setBusy(true)
    setMessage(null)
    const { error } = await supabase.rpc('admin_arrange_wishes', {
      p_assignments: wishes.filter((w) => arr[w.id]!.star !== null).map((w) => ({ id: w.id, star: arr[w.id]!.star })),
      p_final: finalId,
    })
    if (error) {
      setBusy(false)
      setMessage({ tone: 'error', text: error.message || 'Could not save the arrangement.' })
      return
    }
    const changed = wishes.filter((w) => arr[w.id]!.published !== w.is_published)
    await Promise.all(changed.map((w) => supabase.from('birthday_wishes').update({ is_published: arr[w.id]!.published }).eq('id', w.id)))
    setBusy(false)
    setMessage({
      tone: 'success',
      text: unpublishedStars.length
        ? `Saved. ${unpublishedStars.length} placed wish${unpublishedStars.length === 1 ? ' is' : 'es are'} not published yet and will stay dark.`
        : 'Saved.',
    })
    void load()
  }

  const placed = Object.values(arr).filter((v) => v.star !== null && v.published).length

  return (
    <>
      <PageTitle eyebrow="Thirty wishes for thirty" title="Wishes">
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setEditing('new')} disabled={locked}>
            Add curator wish
          </Button>
          <Button onClick={() => void save()} loading={busy} disabled={!dirty || locked}>
            Save arrangement
          </Button>
        </div>
      </PageTitle>
      <LockedNotice collection={collection} />
      <Notice className="mb-6">
        {placed} of 30 stars hold a published wish. Empty stars stay unlit: wishes are never invented to fill the sky. Curator-written
        wishes are labelled as such.
      </Notice>
      {message && <Notice tone={message.tone} className="mb-6" live>{message.text}</Notice>}

      <div className="mb-8 grid max-w-2xl grid-cols-10 gap-1.5 sm:gap-2" aria-label="Star positions" role="list">
        {STARS.map((s) => {
          const id = taken.get(s)
          const w = id ? wishes?.find((x) => x.id === id) : undefined
          const lit = Boolean(w && arr[w.id]!.published)
          return (
            <div
              role="listitem"
              key={s}
              title={w ? `${s}: ${w.message.slice(0, 80)}` : `${s}: empty`}
              className={cn(
                'grid aspect-square place-items-center rounded-full border text-xs tabular-nums',
                lit ? 'border-gold bg-gold/20 text-gold-bright' : w ? 'border-gold/40 text-grey' : 'border-midnight-line text-grey/50',
                id && id === finalId && 'ring-2 ring-gold-bright',
              )}
            >
              <span className="sr-only">Star </span>
              {s}
              {w && <span className="sr-only">{lit ? ': published wish' : ': placed, not published'}{id === finalId ? ', final star' : ''}</span>}
            </div>
          )
        })}
      </div>

      {editing === 'new' && collection && <WishEditor collectionId={collection.id} wish={null} onDone={() => { setEditing(null); void load() }} />}

      {!wishes ? (
        <Spinner label="Loading…" />
      ) : wishes.length === 0 ? (
        <p className="text-grey">No wishes yet. They arrive when you add approved submissions to the archive.</p>
      ) : (
        <>
          <div className="mb-3 flex justify-end">
            <Button size="sm" variant="ghost" onClick={autofill} disabled={locked}>
              Place unplaced wishes in free stars
            </Button>
          </div>
          <ul className="flex flex-col gap-3">
            {wishes.map((w) =>
              editing === w.id && collection ? (
                <li key={w.id}>
                  <WishEditor collectionId={collection.id} wish={w} onDone={() => { setEditing(null); void load() }} />
                </li>
              ) : (
                <li key={w.id} className="grid gap-3 rounded-xl border border-midnight-line p-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div className="min-w-0">
                    <p className="leading-relaxed text-ivory/90">“{w.message}”</p>
                    <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-grey">
                      <span>{w.author_display ?? 'Anonymous'}</span>
                      {w.is_curator_original && <Pill tone="gold">Curator</Pill>}
                      {w.audience === 'roni_only' && <Pill>Roni only</Pill>}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-2 text-sm text-grey">
                      Star
                      <select
                        aria-label="Star position"
                        className="field-input w-20 py-1.5"
                        value={arr[w.id]?.star ?? ''}
                        disabled={locked}
                        onChange={(e) => update(w.id, { star: e.target.value ? Number(e.target.value) : null })}
                      >
                        <option value="">—</option>
                        {STARS.map((s) => (
                          <option key={s} value={s} disabled={taken.has(s) && taken.get(s) !== w.id}>
                            {s}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-grey">
                      <input
                        type="radio"
                        name="final-star"
                        className="accent-[var(--color-gold)]"
                        checked={finalId === w.id}
                        disabled={locked}
                        onChange={() => {
                          setFinalId(w.id)
                          setDirty(true)
                        }}
                      />
                      Final star
                    </label>
                    <label className="flex cursor-pointer items-center gap-2 text-sm text-grey">
                      <input
                        type="checkbox"
                        className="accent-[var(--color-gold)]"
                        checked={arr[w.id]?.published ?? false}
                        disabled={locked}
                        onChange={(e) => update(w.id, { published: e.target.checked })}
                      />
                      Published
                    </label>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(w.id)} disabled={locked || dirty} title={dirty ? 'Save the arrangement first' : undefined}>
                      Edit
                    </Button>
                  </div>
                </li>
              ),
            )}
          </ul>
          {finalId && (
            <div className="mt-4">
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setFinalId(null)
                  setDirty(true)
                }}
                disabled={locked}
              >
                Clear final star
              </Button>
            </div>
          )}
        </>
      )}
    </>
  )
}

function WishEditor({ collectionId, wish, onDone }: { collectionId: string; wish: Wish | null; onDone: () => void }) {
  const [author, setAuthor] = useState(wish?.author_display ?? '')
  const [text, setText] = useState(wish?.message ?? '')
  const [audience, setAudience] = useState<Audience>(wish?.audience ?? 'everyone')
  const [published, setPublished] = useState(wish?.is_published ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const save = async () => {
    if (!text.trim()) return setError('Write the wish.')
    setBusy(true)
    const row = { author_display: author.trim() || null, message: text.trim(), audience, is_published: published }
    const { error: e } = wish
      ? await supabase.from('birthday_wishes').update(row).eq('id', wish.id)
      : await supabase.from('birthday_wishes').insert({ ...row, collection_id: collectionId, is_curator_original: true })
    setBusy(false)
    if (e) setError('Could not save the wish.')
    else onDone()
  }

  const remove = async () => {
    if (!wish || !window.confirm('Delete this wish from the archive? A contributor’s original submission is kept.')) return
    setBusy(true)
    await supabase.from('birthday_wishes').delete().eq('id', wish.id)
    onDone()
  }

  return (
    <Panel className="mb-4 border-gold/30">
      {!wish && (
        <p className="mb-4 text-sm text-grey">
          A wish written by you, the curator. It is always labelled as a curator wish and never presented as a contributor’s words.
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Area className="sm:col-span-2" label="Wish" value={text} onValue={setText} maxLength={2000} rows={3} />
        <Input label="From" hint="Empty shows as anonymous." value={author} onValue={setAuthor} maxLength={160} />
        <Select label="Who can see it" value={audience} onValue={setAudience} options={[...AUDIENCE_OPTIONS]} />
        <Check label="Published" checked={published} onChecked={setPublished} />
      </div>
      {error && <Notice tone="error" className="mt-4">{error}</Notice>}
      <div className="mt-6 flex flex-wrap gap-2">
        <Button onClick={() => void save()} loading={busy}>Save</Button>
        <Button variant="ghost" onClick={onDone} disabled={busy}>Cancel</Button>
        {wish && <Button variant="danger" className="ml-auto" onClick={() => void remove()} disabled={busy}>Delete</Button>}
      </div>
    </Panel>
  )
}
