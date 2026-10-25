import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { useExperience } from '../data'
import { PillButton, PreviewEmpty, SourceTag } from '../ui'

function Candle({ lit }: { lit: boolean }) {
  return (
    <div aria-hidden="true" className="relative mx-auto h-56 w-24">
      {lit ? (
        <div className="absolute bottom-[9.5rem] left-1/2 -translate-x-1/2">
          <div className="absolute -inset-10 rounded-full bg-[radial-gradient(circle,rgba(255,200,120,0.35),transparent_70%)]" />
          <div className="flame relative h-14 w-7 rounded-[50%_50%_50%_50%/60%_60%_40%_40%] bg-[radial-gradient(ellipse_at_50%_80%,#fff7e0_0%,#ffd27a_35%,#f39a3d_70%,rgba(243,154,61,0)_100%)] blur-[0.5px]" />
        </div>
      ) : (
        <div className="absolute bottom-[9.5rem] left-1/2 -translate-x-1/2">
          <span className="smoke absolute -top-2 left-0 size-6 rounded-full bg-ivory/30 blur-md" />
        </div>
      )}
      <div className="absolute bottom-[9.25rem] left-1/2 h-3 w-0.5 -translate-x-1/2 bg-midnight" />
      <div className="absolute bottom-0 left-1/2 h-[9.25rem] w-10 -translate-x-1/2 rounded-t-md bg-[linear-gradient(90deg,#d9cdb6,#f6f1e8_45%,#cfc2a8)] shadow-[0_0_40px_rgba(255,210,140,0.15)]" />
    </div>
  )
}

export function Finale({ onRevisit }: { onRevisit: () => void }) {
  const { data, preview, roni } = useExperience()
  const { finale } = data
  const reduce = useReducedMotion()
  const [stage, setStage] = useState<'idle' | 'wishing' | 'done'>('idle')
  const lines = finale.lines.filter((l) => l.trim())

  useEffect(() => {
    if (stage !== 'wishing') return
    const id = window.setTimeout(() => setStage('done'), reduce ? 800 : 3200)
    return () => window.clearTimeout(id)
  }, [stage, reduce])

  const fade = (delay = 0) => ({
    initial: { opacity: 0, y: reduce ? 0 : 18 },
    whileInView: { opacity: 1, y: 0 },
    viewport: { once: true, margin: '-10% 0px' },
    transition: { duration: reduce ? 0 : 1.2, delay: reduce ? 0 : delay, ease: [0.22, 1, 0.36, 1] as const },
  })

  return (
    <section
      id="finale"
      aria-labelledby="finale-title"
      className="relative overflow-hidden px-6 pt-36 pb-28 text-center"
      style={{ background: 'radial-gradient(70% 55% at 50% 60%, rgba(87,44,61,0.55), transparent 75%)' }}
    >
      <motion.p {...fade()} className="eyebrow">
        Chapter Thirty
      </motion.p>
      <motion.h2 {...fade(0.15)} id="finale-title" tabIndex={-1} className="display mx-auto mt-6 max-w-4xl text-5xl text-ivory outline-none sm:text-8xl">
        {finale.heading}
      </motion.h2>
      <div className="mx-auto mt-10 flex max-w-2xl flex-col gap-3">
        {lines.map((l, i) => (
          <motion.p key={l} {...fade(0.4 + i * 0.35)} className="font-serif text-2xl text-ivory/85 italic sm:text-3xl">
            {l}
          </motion.p>
        ))}
      </div>

      <div className="mt-20">
        <Candle lit={stage !== 'done'} />
      </div>

      <div className="mt-10 min-h-40" aria-live="polite">
        <AnimatePresence mode="wait">
          {stage === 'idle' && (
            <motion.div key="idle" exit={{ opacity: 0 }}>
              <PillButton onClick={() => setStage('wishing')}>Make a wish</PillButton>
            </motion.div>
          )}
          {stage === 'wishing' && (
            <motion.p
              key="wishing"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="font-serif text-3xl text-gold-bright italic"
            >
              Close your eyes. Make your wish.
            </motion.p>
          )}
          {stage === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, y: reduce ? 0 : 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: reduce ? 0 : 1.4, delay: reduce ? 0 : 0.6 }}
              className="mx-auto max-w-2xl"
            >
              {finale.finalMessage.trim() ? (
                <>
                  <p className="font-serif text-2xl leading-relaxed whitespace-pre-line text-ivory sm:text-3xl">{finale.finalMessage}</p>
                  {finale.finalSignature && <p className="mt-6 font-serif text-xl text-gold italic">— {finale.finalSignature}</p>}
                  <SourceTag
                    sample={data.sampleEditorial.includes('finale')}
                    label="Final message, written in Editorial"
                    edit="/admin/editorial?tab=finale"
                    className="mx-auto mt-6 w-fit"
                  />
                </>
              ) : (
                preview && (
                  <PreviewEmpty to="/admin/editorial?tab=finale" note="Roni will see the candle go out, then go straight to the button below.">
                    The final message is empty. Write it in Editorial → Finale; until then nothing is shown here.
                  </PreviewEmpty>
                )
              )}
              <div className="mt-14 flex flex-col items-center gap-6">
                <PillButton onClick={onRevisit}>Revisit the archives</PillButton>
                {roni && (
                  <Link to="/my-archive?tab=story" className="text-sm tracking-[0.2em] text-ivory/75 uppercase underline-offset-8 hover:text-gold-bright hover:underline">
                    Continue your story
                  </Link>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </section>
  )
}
