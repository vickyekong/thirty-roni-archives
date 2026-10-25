import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ArchiveContext } from './archive-context'
import { ChapterNav, scrollToSection } from './chrome'
import { useExperience } from './data'
import { Finale } from './sections/Finale'
import { Letters } from './sections/Letters'
import { MemoryDialog, MemoryVault } from './sections/MemoryVault'
import { RoniTimes } from './sections/RoniTimes'
import { ThroughTheirEyes } from './sections/ThroughTheirEyes'
import { Timeline } from './sections/Timeline'
import { Wishes } from './sections/Wishes'

export function Archive() {
  const { data } = useExperience()
  const reduce = useReducedMotion()
  const [memoryId, setMemoryId] = useState<string | null>(null)
  const title = useRef<HTMLHeadingElement>(null)
  const ctx = useMemo(() => ({ openMemory: setMemoryId }), [])

  useEffect(() => {
    title.current?.focus({ preventScroll: true })
  }, [])

  const revisit = () => {
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    title.current?.focus({ preventScroll: true })
  }

  return (
    <ArchiveContext value={ctx}>
      <div className="grain relative">
        <ChapterNav />
        <header className="relative flex min-h-[88dvh] flex-col items-center justify-center px-6 text-center">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(55%_45%_at_50%_45%,rgba(87,44,61,0.5),transparent_75%)]"
          />
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 1.2 }}
            className="eyebrow relative"
          >
            The Roni Archives
          </motion.p>
          <motion.h1
            ref={title}
            tabIndex={-1}
            initial={{ opacity: 0, y: reduce ? 0 : 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: reduce ? 0 : 1.4, delay: reduce ? 0 : 0.2 }}
            className="display relative mt-6 text-7xl tracking-[0.08em] outline-none sm:text-[9rem]"
          >
            THIRTY
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: reduce ? 0 : 1.2, delay: reduce ? 0 : 0.6 }}
            className="relative mt-5 text-xs tracking-[0.35em] text-gold uppercase"
          >
            {data.opening.tagline}
          </motion.p>
          <button
            type="button"
            onClick={() => {
              const first = document.querySelector('main > section')
              if (first) scrollToSection(first.id, !reduce)
            }}
            className="absolute bottom-10 min-h-11 cursor-pointer text-xs tracking-[0.3em] text-grey uppercase hover:text-ivory"
          >
            Scroll to begin
            <span aria-hidden="true" className="mx-auto mt-3 block h-10 w-px bg-gradient-to-b from-gold to-transparent" />
          </button>
        </header>
        <main>
          <Timeline />
          <ThroughTheirEyes />
          <MemoryVault />
          <Wishes />
          <RoniTimes />
          <Letters />
          <Finale onRevisit={revisit} />
        </main>
        <MemoryDialog memoryId={memoryId} onClose={() => setMemoryId(null)} />
      </div>
    </ArchiveContext>
  )
}
