import { useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'
import { formatInLagos, useSiteSettings } from '@/lib/launch'
import { useExperience, useMedia } from './data'

const SECTIONS = [
  { id: 'timeline', label: 'Timeline' },
  { id: 'people', label: 'Their Eyes' },
  { id: 'vault', label: 'Vault' },
  { id: 'wishes', label: 'Wishes' },
  { id: 'times', label: 'The Times' },
  { id: 'letters', label: 'Letters' },
  { id: 'finale', label: 'Thirty' },
]

export function scrollToSection(id: string, smooth: boolean) {
  document.getElementById(id)?.scrollIntoView({ behavior: smooth ? 'smooth' : 'auto', block: 'start' })
  document.getElementById(`${id}-title`)?.focus({ preventScroll: true })
}

export function ChapterNav() {
  const reduce = useReducedMotion()
  const [present, setPresent] = useState<typeof SECTIONS>([])
  const [active, setActive] = useState<string | null>(null)

  useEffect(() => {
    const found = SECTIONS.filter((s) => document.getElementById(s.id))
    setPresent(found)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) if (e.isIntersecting) setActive(e.target.id)
      },
      { rootMargin: '-45% 0px -50% 0px' },
    )
    for (const s of found) observer.observe(document.getElementById(s.id)!)
    return () => observer.disconnect()
  }, [])

  const rail = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = rail.current
    const link = el?.querySelector<HTMLElement>('[aria-current]')
    if (!el || !link) return
    // Keep the current section visible on narrow screens without scrolling the page itself.
    el.scrollTo({ left: link.offsetLeft - (el.clientWidth - link.offsetWidth) / 2, behavior: reduce ? 'auto' : 'smooth' })
  }, [active, reduce])

  if (present.length < 2) return null
  return (
    <nav aria-label="Archive sections" className="fixed inset-x-0 top-3 z-30 flex justify-center px-3">
      <div ref={rail} className="glass-fallback glass-floating relative flex max-w-full items-center gap-1 overflow-x-auto rounded-full px-2 py-1.5 [scrollbar-width:none]">
        <span className="hidden px-3 font-serif text-sm tracking-[0.2em] text-ivory sm:inline">THIRTY</span>
        {present.map((s) => (
          <a
            key={s.id}
            href={`#${s.id}`}
            aria-current={active === s.id ? 'true' : undefined}
            onClick={(e) => {
              e.preventDefault()
              scrollToSection(s.id, !reduce)
            }}
            className={cn(
              'flex min-h-9 items-center rounded-full px-3 text-xs tracking-[0.12em] whitespace-nowrap uppercase transition-colors',
              active === s.id ? 'bg-gold/20 text-gold-bright' : 'text-ivory/70 hover:text-ivory',
            )}
          >
            {s.label}
          </a>
        ))}
      </div>
    </nav>
  )
}

/** Optional soundtrack. Nothing plays until the visitor presses play. */
export function MusicButton() {
  const { data } = useExperience()
  const media = useMedia()
  const track = data.music ? media(data.music.mediaId) : null
  const audio = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)

  useEffect(() => {
    const el = audio.current
    return () => el?.pause()
  }, [])

  if (!track || !data.music) return null
  const label = [data.music.title, data.music.credit].filter(Boolean).join(' — ')

  const toggle = () => {
    const el = audio.current
    if (!el) return
    if (el.paused) void el.play().catch(() => setPlaying(false))
    else el.pause()
  }

  return (
    <div className="fixed bottom-4 left-4 z-50">
      <audio ref={audio} src={track.url} preload="none" loop onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} />
      <button
        type="button"
        onClick={toggle}
        aria-pressed={playing}
        title={label || undefined}
        className="glass-fallback glass-floating flex min-h-11 cursor-pointer items-center gap-2 rounded-full px-4 text-xs tracking-[0.18em] text-ivory uppercase hover:text-gold-bright"
      >
        <span aria-hidden="true" className="flex h-3 items-end gap-0.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={cn('w-0.5 rounded-full bg-gold', playing ? 'animate-pulse' : '')}
              style={{ height: playing ? `${6 + i * 3}px` : '4px', animationDelay: `${i * 0.2}s` }}
            />
          ))}
        </span>
        {playing ? 'Pause music' : 'Play music'}
        {label && <span className="sr-only">: {label}</span>}
      </button>
    </div>
  )
}

export function PreviewBanner({ live }: { live: boolean }) {
  const { settings } = useSiteSettings()
  return (
    <div className="fixed right-3 bottom-3 z-50 flex max-w-[calc(100vw-1.5rem)] items-center gap-3 rounded-full border border-dashed border-gold/50 bg-midnight/90 px-4 py-2 text-xs leading-relaxed text-ivory/85 backdrop-blur sm:right-4 sm:bottom-4 sm:block sm:max-w-xs sm:rounded-2xl sm:py-3">
      <p className="font-medium tracking-[0.2em] text-gold uppercase">{live ? 'Curator view' : 'Curator preview'}</p>
      <p className="mt-1 hidden sm:block">
        {live
          ? 'The archive is live. Curator-only notes are shown on empty sections.'
          : `Only published items are shown, exactly as Roni will see them${settings ? ` from ${formatInLagos(settings.launch_at)} (Lagos)` : ''}.`}
      </p>
      <Link to="/admin" className="inline-block text-gold underline underline-offset-4 sm:mt-2">
        <span className="sm:hidden">Dashboard</span>
        <span className="hidden sm:inline">Back to the dashboard</span>
      </Link>
    </div>
  )
}
