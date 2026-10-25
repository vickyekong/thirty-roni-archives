import { motion, useReducedMotion } from 'motion/react'
import { useEffect, type ReactNode } from 'react'
import { Link } from 'react-router'
import { LiquidGlass } from '@/components/glass/LiquidGlass'
import type { ExperienceAccess } from '@/features/experience/access'
import { useAuth } from '@/lib/auth'
import { formatInLagos, useCountdown, useSiteSettings } from '@/lib/launch'

/**
 * Public landing. Shows only the launch schedule. It never loads archive content: that is
 * fetched (and authorised by row-level security) only inside the experience.
 */
export function GatePage({ access, onLaunch }: { access: ExperienceAccess; onLaunch?: () => void }) {
  const auth = useAuth()
  const { settings } = useSiteSettings()
  const countdown = useCountdown(settings?.launch_at ?? null)
  const reduce = useReducedMotion()
  const fade = (delay: number) => ({
    initial: { opacity: 0, y: reduce ? 0 : 14 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: reduce ? 0 : 1.2, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] as const },
  })

  const launched = Boolean(countdown?.done)
  // Ask the database again the moment the countdown ends; it decides whether to open.
  useEffect(() => {
    if (launched) onLaunch?.()
  }, [launched, onLaunch])

  const units = countdown
    ? [
        { label: 'Days', value: countdown.days },
        { label: 'Hours', value: countdown.hours },
        { label: 'Minutes', value: countdown.minutes },
        { label: 'Seconds', value: countdown.seconds },
      ]
    : []

  const open = launched && settings?.experience_active
  let note: ReactNode = null
  if (access.is_admin && !access.live && !access.preview_enabled)
    note = (
      <>
        Curator preview is off.{' '}
        <Link to="/admin" className="text-gold underline underline-offset-4">
          Turn it on in the dashboard
        </Link>{' '}
        to see the experience before launch.
      </>
    )
  else if (open && access.signed_in && !access.can_view)
    note = access.is_family && !access.family_enabled ? 'Family viewing has not been opened yet. Please check back soon.' : 'This account cannot open the archive.'

  return (
    <div className="grain relative flex min-h-dvh flex-col overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_42%,rgba(87,44,61,0.6),transparent_75%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-1/2 size-[38rem] -translate-x-1/2 -translate-y-1/2 rounded-full border border-gold/10"
      />
      <main className="relative z-10 mx-auto flex w-full max-w-4xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
        <motion.p {...fade(0.1)} className="eyebrow">
          The Roni Archives
        </motion.p>
        <motion.h1 {...fade(0.3)} className="display mt-6 text-[5.5rem] tracking-[0.08em] sm:text-[9rem]">
          THIRTY
        </motion.h1>
        <motion.p {...fade(0.6)} className="mt-4 max-w-xl font-serif text-xl text-ivory/80 italic sm:text-2xl">
          30 Years. Countless Memories. One Extraordinary Woman.
        </motion.p>

        <motion.div {...fade(0.9)} className="mt-14 w-full">
          {!settings ? (
            <div className="h-28" aria-hidden="true" />
          ) : countdown && !countdown.done ? (
            <LiquidGlass
              glass={{ borderRadius: 28, tintOpacity: 0.1, shadow: '0 30px 60px rgba(0,0,0,0.35)' }}
              className="mx-auto inline-flex rounded-[28px] px-4 py-5 sm:px-8"
              role="timer"
              aria-label={`Opens ${formatInLagos(settings.launch_at)} (Lagos time)`}
            >
              <dl className="flex gap-4 sm:gap-10">
                {units.map((unit) => (
                  <div key={unit.label} className="flex w-14 flex-col-reverse items-center sm:w-20">
                    <dt className="mt-1 text-[0.625rem] tracking-[0.25em] text-grey uppercase">{unit.label}</dt>
                    <dd className="font-serif text-4xl text-ivory tabular-nums sm:text-6xl">{String(unit.value).padStart(2, '0')}</dd>
                  </div>
                ))}
              </dl>
            </LiquidGlass>
          ) : open ? (
            <p className="font-serif text-2xl text-gold-bright">The archive is open.</p>
          ) : (
            <p className="font-serif text-2xl text-ivory/80">Almost ready.</p>
          )}
          {settings && (
            <p className="mt-6 text-xs tracking-[0.2em] text-grey uppercase">
              {formatInLagos(settings.launch_at, { day: 'numeric', month: 'long', year: 'numeric' })} · Lagos
            </p>
          )}
        </motion.div>

        {open && !access.signed_in && (
          <motion.div {...fade(1.1)} className="mt-10">
            <Link to="/sign-in?next=/" className="text-sm tracking-[0.28em] text-ivory uppercase hover:text-gold-bright">
              <span className="text-gold">[</span> Sign in to enter <span className="text-gold">]</span>
            </Link>
          </motion.div>
        )}
        {note && <p className="mt-10 max-w-md text-sm leading-relaxed text-grey">{note}</p>}
        {auth.status === 'signed-in' && (
          <button
            type="button"
            onClick={() => void auth.signOut()}
            className="mt-6 cursor-pointer text-xs tracking-[0.2em] text-grey uppercase underline-offset-4 hover:text-ivory hover:underline"
          >
            Sign out
          </button>
        )}
      </main>
    </div>
  )
}
