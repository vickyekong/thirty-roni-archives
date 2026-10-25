import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Spinner } from '@/components/ui/Spinner'
import { formatInLagos } from '@/lib/launch'
import { supabase } from '@/lib/supabase'
import { plural } from '@/features/experience/ui'

type Summary = {
  locked: boolean
  sealedAt: string | null
  counts: { label: [string, string]; n: number }[]
}

/** Read-only overview. Nothing on this tab writes anything; the archive itself opens at `/`. */
async function loadSummary(): Promise<Summary> {
  const { data: col, error } = await supabase.from('archive_collections').select('id, is_locked, snapshot_at').eq('kind', 'original_thirty').single()
  if (error || !col) throw error ?? new Error('Not found')
  const published = <T extends string>(table: T) =>
    supabase.from(table).select('id', { count: 'exact', head: true }).eq('collection_id', col.id).eq('is_published', true).eq('is_sample', false)
  const [milestones, memories, wishes, letters, people] = await Promise.all([
    published('timeline_milestones'),
    published('memories'),
    published('birthday_wishes'),
    published('letters'),
    supabase.from('contributor_profiles').select('id', { count: 'exact', head: true }).eq('is_published', true),
  ])
  return {
    locked: col.is_locked,
    sealedAt: col.snapshot_at,
    counts: [
      { label: ['milestone', 'milestones'], n: milestones.count ?? 0 },
      { label: ['memory', 'memories'], n: memories.count ?? 0 },
      { label: ['person who loves you', 'people who love you'], n: people.count ?? 0 },
      { label: ['wish', 'wishes'], n: wishes.count ?? 0 },
      { label: ['letter', 'letters'], n: letters.count ?? 0 },
    ],
  }
}

export function OriginalThirty() {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let active = true
    loadSummary()
      .then((s) => active && setSummary(s))
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [])

  const present = summary?.counts.filter((c) => c.n > 0) ?? []

  return (
    <div className="flex flex-col gap-8">
      <div className="rounded-3xl border border-gold/25 bg-[radial-gradient(ellipse_at_top,rgba(198,166,107,0.12),transparent_70%)] px-6 py-12 text-center sm:px-12">
        <p className="eyebrow">3 December 2026</p>
        <p className="display mt-4 text-4xl text-ivory sm:text-6xl">Thirty years, as they were given to you.</p>
        <p className="mx-auto mt-5 max-w-xl leading-relaxed text-ivory/75">
          The Original Thirty is kept exactly as it was made for your birthday. Nothing you add to The Continuing Story changes it.
        </p>
        {!summary && !failed && (
          <div className="mt-8 flex justify-center">
            <Spinner label="Counting the archive…" />
          </div>
        )}
        {present.length > 0 && (
          <ul className="mx-auto mt-8 flex max-w-2xl flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-ivory/80">
            {present.map((c) => (
              <li key={c.label[0]}>{plural(c.n, c.label[0], c.label[1])}</li>
            ))}
          </ul>
        )}
        <Link
          to="/"
          className="glass-fallback mt-10 inline-flex min-h-14 items-center justify-center gap-3 rounded-full px-8 text-[0.75rem] font-medium tracking-[0.28em] whitespace-nowrap text-ivory uppercase hover:text-gold-bright"
        >
          <span aria-hidden="true" className="text-gold">
            [
          </span>
          Open the Original Thirty
          <span aria-hidden="true" className="text-gold">
            ]
          </span>
        </Link>
      </div>
      {summary && (
        <p className="text-center text-sm text-grey">
          {summary.locked
            ? `Sealed${summary.sealedAt ? ` on ${formatInLagos(summary.sealedAt, { dateStyle: 'long' })}` : ''}, so it stays exactly as it is.`
            : 'Your curators can still make small corrections to it. You can read it whenever you like.'}
        </p>
      )}
    </div>
  )
}
