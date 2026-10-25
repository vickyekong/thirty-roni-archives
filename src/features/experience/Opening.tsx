import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { GlassButton } from '@/components/ui/Button'
import { useExperience } from './data'
import { canRender3D, SceneBoundary } from './support'

const OpeningScene = lazy(() => import('./three/OpeningScene'))

const LINE_MS = 2800
const COUNT_MS = 2600
const FORM_MS = 1900
const NAME_MS = 1500
const ease = [0.22, 1, 0.36, 1] as const

function FlatParticles() {
  const dots = useMemo(() => {
    let s = 30
    const rand = () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646
    return Array.from({ length: 70 }, () => ({
      left: `${rand() * 100}%`,
      top: `${rand() * 100}%`,
      size: 1 + rand() * 2,
      delay: `${rand() * 6}s`,
    }))
  }, [])
  return (
    <div aria-hidden="true" className="absolute inset-0">
      {dots.map((d, i) => (
        <span
          key={i}
          className="twinkle absolute rounded-full bg-gold-bright"
          style={{ left: d.left, top: d.top, width: d.size, height: d.size, animationDelay: d.delay }}
        />
      ))}
    </div>
  )
}

function YearCounter({ from, to, onDone }: { from: number; to: number; onDone: () => void }) {
  const [year, setYear] = useState(from)
  const done = useRef(onDone)
  useEffect(() => {
    done.current = onDone
  })
  useEffect(() => {
    let frame = 0
    const start = performance.now()
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / COUNT_MS)
      const eased = 1 - Math.pow(1 - t, 3)
      setYear(Math.round(from + (to - from) * eased))
      if (t < 1) frame = requestAnimationFrame(tick)
      else done.current()
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [from, to])
  return <span className="tabular-nums">{year}</span>
}

export function Opening({ onEnter }: { onEnter: () => void }) {
  const { data } = useExperience()
  const { opening } = data
  const reduce = Boolean(useReducedMotion())
  const lines = opening.lines.filter((l) => l.trim())
  const startYear = Number.parseInt(opening.year, 10) || 1996
  const COUNT = lines.length
  const FORM = COUNT + 1
  const NAME = COUNT + 2
  const READY = COUNT + 3
  const [step, setStep] = useState(reduce ? READY : 0)
  const [use3D] = useState(canRender3D)
  const enterRef = useRef<HTMLDivElement>(null)
  const focusEnter = useRef(false)

  useEffect(() => {
    if (step === COUNT || step >= READY) return
    const ms = step < COUNT ? LINE_MS : step === FORM ? FORM_MS : NAME_MS
    const id = window.setTimeout(() => setStep((s) => s + 1), ms)
    return () => window.clearTimeout(id)
  }, [step, COUNT, FORM, READY])

  useEffect(() => {
    if (step >= READY && focusEnter.current) enterRef.current?.querySelector('button')?.focus()
  }, [step, READY])

  const skip = () => {
    focusEnter.current = true
    setStep(READY)
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && step < READY) skip()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const formed = step >= FORM
  const t = (d = 1.2) => ({ duration: reduce ? 0 : d, ease })

  return (
    <section aria-labelledby="opening-title" className="grain fixed inset-0 z-40 overflow-hidden bg-midnight">
      {use3D ? (
        <SceneBoundary fallback={<FlatParticles />}>
          <Suspense fallback={<FlatParticles />}>
            <OpeningScene formed={formed} still={reduce} />
          </Suspense>
        </SceneBoundary>
      ) : (
        <FlatParticles />
      )}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(60%_50%_at_50%_45%,rgba(87,44,61,0.45),transparent_75%)]"
      />

      <h1 id="opening-title" className="sr-only">
        {opening.name || 'Roni'}: {opening.tagline || 'Thirty'}
      </h1>
      <div className="sr-only">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>

      {step < READY && (
        <button
          type="button"
          onClick={skip}
          className="absolute top-5 right-5 z-20 min-h-11 cursor-pointer rounded-full px-4 text-xs tracking-[0.25em] text-grey uppercase transition-colors hover:text-ivory"
        >
          Skip intro
        </button>
      )}

      {/* Lines, then the year counter, share the centre of the screen. */}
      <div aria-hidden="true" className="absolute inset-0 z-10 grid place-items-center px-8 text-center">
        <AnimatePresence mode="wait">
          {step < COUNT && (
            <motion.p
              key={step}
              initial={{ opacity: 0, y: 12, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -8, filter: 'blur(6px)' }}
              transition={t(1)}
              className="max-w-2xl font-serif text-3xl leading-snug text-ivory/90 italic sm:text-5xl"
            >
              {lines[step]}
            </motion.p>
          )}
          {step === COUNT && (
            <motion.p
              key="count"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, scale: 1.08, filter: 'blur(8px)' }}
              transition={t(0.8)}
              className="display text-7xl tracking-[0.06em] text-gold-bright sm:text-9xl"
            >
              <YearCounter from={startYear} to={2026} onDone={() => setStep(FORM)} />
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* The "30" lives in the 3D scene; this is the flat version for devices without WebGL. */}
      {!use3D && (
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-[12%] z-10 flex h-[44%] items-center justify-center">
          <motion.p
            initial={false}
            animate={{ opacity: formed ? 1 : 0, y: formed ? 0 : 24 }}
            transition={t(1.6)}
            className="display bg-[linear-gradient(180deg,#f6e3bb_0%,#d8bd86_45%,#9b7944_100%)] bg-clip-text text-[min(36dvh,62vw)] leading-none text-transparent"
          >
            30
          </motion.p>
        </div>
      )}

      <div className="absolute inset-x-0 top-[58%] z-10 flex flex-col items-center px-6 text-center">
        <motion.p
          aria-hidden="true"
          initial={false}
          animate={{ opacity: step >= NAME ? 1 : 0, letterSpacing: step >= NAME ? '0.5em' : '0.2em' }}
          transition={t(1.6)}
          className="font-serif text-4xl text-ivory sm:text-6xl"
          style={{ marginRight: '-0.5em' }}
        >
          {opening.name}
        </motion.p>
        <motion.p
          aria-hidden="true"
          initial={false}
          animate={{ opacity: step >= NAME ? 1 : 0 }}
          transition={{ ...t(1.4), delay: reduce ? 0 : 0.5 }}
          className="mt-4 text-[0.7rem] tracking-[0.35em] text-gold uppercase sm:text-xs"
        >
          {opening.tagline}
        </motion.p>
        <div className="mt-10 h-14">
          {step >= READY && (
            <motion.div ref={enterRef} initial={{ opacity: 0, y: reduce ? 0 : 10 }} animate={{ opacity: 1, y: 0 }} transition={t(1)}>
              <GlassButton onClick={onEnter}>
                Enter the archives
              </GlassButton>
            </motion.div>
          )}
        </div>
      </div>
    </section>
  )
}
