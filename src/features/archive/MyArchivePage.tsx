import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { Link, useSearchParams } from 'react-router'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { Wordmark } from '@/components/ui/Wordmark'
import { useExperienceAccess } from '@/features/experience/access'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'
import { formatInLagos, useCountdown, useSiteSettings } from '@/lib/launch'
import { ContinuingStory } from './ContinuingStory'
import { OriginalThirty } from './OriginalThirty'
import { ensureCollection } from './story'

const TABS = [
  { id: 'original', label: 'The Original Thirty' },
  { id: 'story', label: 'The Continuing Story' },
] as const
type TabId = (typeof TABS)[number]['id']

/**
 * Roni's personal archive. The page asks the database whether the archive is live; every
 * read and write is still authorised by row-level security, which only lets Roni write to
 * her own Continuing Story and never to the Original Thirty.
 */
export function MyArchivePage() {
  const auth = useAuth()
  const { access, refresh } = useExperienceAccess()

  return (
    <div className="grain flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4 px-6 pt-8">
        <Wordmark />
        <nav aria-label="Account" className="flex items-center gap-5 text-sm">
          {access?.live && access.is_roni && (
            <Link to="/" className="text-ivory/70 underline-offset-4 hover:text-ivory hover:underline">
              The birthday archive
            </Link>
          )}
          <button type="button" onClick={() => void auth.signOut()} className="cursor-pointer text-grey underline underline-offset-4 hover:text-ivory">
            Sign out
          </button>
        </nav>
      </header>
      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-12 sm:py-16">
        {!access ? (
          <div className="grid flex-1 place-items-center">
            <Spinner label="Opening your archive…" />
          </div>
        ) : !access.is_roni ? (
          <NotRoni />
        ) : !access.live ? (
          <NotYet onLaunch={refresh} />
        ) : (
          <RoniArchive userId={auth.user!.id} />
        )}
      </main>
    </div>
  )
}

function NotRoni() {
  return (
    <div className="flex flex-1 flex-col justify-center">
      <p className="eyebrow">My archive</p>
      <h1 className="display mt-4 text-5xl sm:text-7xl">Roni’s own space</h1>
      <p className="mt-6 max-w-prose leading-relaxed text-ivory/80">
        After her birthday, this is where Roni keeps adding to her story. It belongs to her account only, so there is nothing to show or manage here.
      </p>
      <Link to="/admin" className="mt-8 text-gold underline underline-offset-4">
        Back to the dashboard
      </Link>
    </div>
  )
}

function NotYet({ onLaunch }: { onLaunch: () => void }) {
  const { settings } = useSiteSettings()
  const countdown = useCountdown(settings?.launch_at ?? null)
  const done = Boolean(countdown?.done)
  useEffect(() => {
    if (done) onLaunch()
  }, [done, onLaunch])
  return (
    <div className="flex flex-1 flex-col justify-center">
      <p className="eyebrow">My archive</p>
      <h1 className="display mt-4 text-5xl sm:text-7xl">Not yet</h1>
      <p className="mt-6 max-w-prose leading-relaxed text-ivory/80">
        {settings
          ? `Your archive opens on ${formatInLagos(settings.launch_at, { dateStyle: 'full', timeStyle: 'short' })}, Lagos time.`
          : 'Your archive opens on your birthday.'}
      </p>
    </div>
  )
}

function RoniArchive({ userId }: { userId: string }) {
  const [params, setParams] = useSearchParams()
  const tab: TabId = params.get('tab') === 'story' ? 'story' : 'original'
  const [collectionId, setCollectionId] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const tabRefs = useRef<Record<TabId, HTMLButtonElement | null>>({ original: null, story: null })

  useEffect(() => {
    let active = true
    ensureCollection()
      .then((id) => active && setCollectionId(id))
      .catch(() => active && setFailed(true))
    return () => {
      active = false
    }
  }, [])

  const select = (id: TabId, focus = false) => {
    setParams(id === 'original' ? {} : { tab: id }, { replace: true })
    if (focus) tabRefs.current[id]?.focus()
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return
    e.preventDefault()
    const i = TABS.findIndex((t) => t.id === tab)
    select(TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length]!.id, true)
  }

  return (
    <>
      <p className="eyebrow">My archive</p>
      <h1 className="display mt-4 text-5xl sm:text-7xl">Thirty, and counting</h1>
      <p className="mt-5 max-w-prose leading-relaxed text-ivory/75">
        Two collections live here: the archive your people made for your thirtieth, kept as it was, and your own story, which keeps going.
      </p>

      <div role="tablist" aria-label="Collections" className="mt-12 flex gap-2 border-b border-midnight-line" onKeyDown={onKey}>
        {TABS.map((t) => (
          <button
            key={t.id}
            ref={(el) => {
              tabRefs.current[t.id] = el
            }}
            type="button"
            role="tab"
            id={`tab-${t.id}`}
            aria-selected={tab === t.id}
            aria-controls={`panel-${t.id}`}
            tabIndex={tab === t.id ? 0 : -1}
            onClick={() => select(t.id)}
            className={cn(
              '-mb-px min-h-12 cursor-pointer border-b-2 px-4 font-serif text-lg transition-colors sm:text-xl',
              tab === t.id ? 'border-gold text-ivory' : 'border-transparent text-ivory/55 hover:text-ivory',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <section id={`panel-${tab}`} role="tabpanel" aria-labelledby={`tab-${tab}`} className="pt-10">
        {tab === 'original' ? (
          <OriginalThirty />
        ) : failed ? (
          <Notice tone="error">Your story could not be opened. Please refresh the page to try again.</Notice>
        ) : !collectionId ? (
          <Spinner label="Opening your story…" />
        ) : (
          <ContinuingStory collectionId={collectionId} userId={userId} />
        )}
      </section>
    </>
  )
}
