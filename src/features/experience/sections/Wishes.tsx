import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { lazy, Suspense, useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { POINTS, STROKES } from '../constellation'
import { useExperience, type Wish } from '../data'
import { canRender3D, SceneBoundary, useNearViewport } from '../support'
import type { StarState } from '../three/WishesScene'
import { PreviewEmpty, SectionHeader } from '../ui'

const WishesScene = lazy(() => import('../three/WishesScene'))

/** Flat constellation for devices without WebGL. Decorative: the list below is the accessible version. */
function FlatConstellation({ stars, selected, onSelect }: { stars: StarState[]; selected: number | null; onSelect: (i: number) => void }) {
  const toSvg = ([x, y]: readonly [number, number]) => [x * 60 + 200, -y * 60 + 130] as const
  return (
    <svg viewBox="0 0 400 260" aria-hidden="true" className="absolute inset-0 m-auto h-full w-full max-w-3xl">
      {STROKES.map((pts, i) => (
        <polyline key={i} points={pts.map((p) => toSvg(p).join(',')).join(' ')} fill="none" stroke="#c6a66b" strokeOpacity={0.22} strokeWidth={0.8} />
      ))}
      {stars.map((s) => {
        const [cx, cy] = toSvg(POINTS[s.index - 1]!)
        const r = s.final ? 6 : s.lit ? 4 : 1.8
        return (
          <g key={s.index} onClick={s.lit ? () => onSelect(s.index) : undefined} className={s.lit ? 'cursor-pointer' : undefined}>
            {s.lit && <circle cx={cx} cy={cy} r={r * 3.5} fill="url(#glow)" />}
            <circle cx={cx} cy={cy} r={selected === s.index ? r * 1.6 : r} fill={s.lit ? '#f2d6a0' : '#6b665f'} />
          </g>
        )
      })}
      <defs>
        <radialGradient id="glow">
          <stop offset="0%" stopColor="#f2d6a0" stopOpacity="0.6" />
          <stop offset="100%" stopColor="#f2d6a0" stopOpacity="0" />
        </radialGradient>
      </defs>
    </svg>
  )
}

function WishText({ wish, large }: { wish: Wish; large?: boolean }) {
  return (
    <>
      <p className={cn('font-serif leading-relaxed whitespace-pre-line text-ivory', large ? 'text-3xl sm:text-4xl' : 'text-2xl')}>“{wish.message}”</p>
      {wish.author && <p className="mt-4 text-sm tracking-[0.2em] text-gold uppercase">— {wish.author}</p>}
    </>
  )
}

export function Wishes() {
  const { data, preview } = useExperience()
  const reduce = Boolean(useReducedMotion())
  const [selected, setSelected] = useState<number | null>(null)
  const [nearRef, near] = useNearViewport<HTMLDivElement>('150px')
  const [use3D] = useState(canRender3D)

  const byStar = useMemo(() => new Map(data.wishes.filter((w) => w.star).map((w) => [w.star!, w])), [data.wishes])
  const stars: StarState[] = useMemo(
    () => POINTS.map((_, i) => ({ index: i + 1, lit: byStar.has(i + 1), final: Boolean(byStar.get(i + 1)?.final) })),
    [byStar],
  )
  const finalWish = data.wishes.find((w) => w.final) ?? null
  const current = selected ? (byStar.get(selected) ?? null) : null
  const lit = byStar.size

  if (data.wishes.length === 0 && !preview) return null

  return (
    <section id="wishes" aria-labelledby="wishes-title" className="px-6 py-28 sm:py-36">
      <div className="mx-auto max-w-6xl">
        <SectionHeader
          id="wishes-title"
          eyebrow="The constellation"
          title="Thirty Wishes for Thirty"
          intro={
            data.wishes.length > 0
              ? `${lit} of 30 stars ${lit === 1 ? 'holds' : 'hold'} a wish from someone who loves her. Choose a star, or read them all below.`
              : undefined
          }
        />
        {data.wishes.length === 0 ? (
          <PreviewEmpty to="/admin/wishes">
            No wishes are published yet. Stars stay dark until real wishes are approved and placed; none are invented.
          </PreviewEmpty>
        ) : (
          <>
            <div className="grid gap-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:items-center">
              <div
                ref={nearRef}
                className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-ivory/10 bg-[radial-gradient(80%_70%_at_50%_45%,rgba(61,31,43,0.8),rgba(16,16,20,1))]"
              >
                {/* One canvas at a time: the scene only exists while this section is near the screen. */}
                {use3D && near ? (
                  <SceneBoundary fallback={<FlatConstellation stars={stars} selected={selected} onSelect={setSelected} />}>
                    <Suspense fallback={null}>
                      <WishesScene stars={stars} selected={selected} still={reduce} onSelect={setSelected} />
                    </Suspense>
                  </SceneBoundary>
                ) : (
                  !use3D && <FlatConstellation stars={stars} selected={selected} onSelect={setSelected} />
                )}
              </div>
              <div aria-live="polite" className="min-h-48 rounded-3xl border border-ivory/10 p-8">
                <AnimatePresence mode="wait">
                  {current ? (
                    <motion.div
                      key={current.id}
                      initial={{ opacity: 0, y: reduce ? 0 : 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduce ? 0 : 0.5 }}
                    >
                      <p className="mb-4 text-xs tracking-[0.3em] text-grey uppercase">
                        {current.final ? 'The final star' : `Star ${current.star}`}
                      </p>
                      <WishText wish={current} />
                    </motion.div>
                  ) : (
                    <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="text-ivory/60">
                      Select a glowing star to read its wish.
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </div>

            {finalWish && (
              <div className="mx-auto mt-20 max-w-3xl text-center">
                <p className="eyebrow">The final star</p>
                <div className="mt-6">
                  <WishText wish={finalWish} large />
                </div>
              </div>
            )}

            <details className="group mt-16 rounded-3xl border border-ivory/10">
              <summary className="flex min-h-14 cursor-pointer items-center justify-between px-6 text-sm tracking-[0.2em] text-ivory uppercase">
                Read every wish as a list
                <span aria-hidden="true" className="text-gold transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <ol className="grid gap-4 px-6 pb-6 sm:grid-cols-2">
                {data.wishes.map((w) => (
                  <li key={w.id} className="rounded-2xl bg-ivory/[0.03] p-5">
                    <p className="text-xs tracking-[0.25em] text-grey uppercase">{w.final ? 'Final star' : w.star ? `Star ${w.star}` : 'Wish'}</p>
                    <p className="mt-2 leading-relaxed whitespace-pre-line text-ivory/90">{w.message}</p>
                    {w.author && <p className="mt-2 text-sm text-gold">— {w.author}</p>}
                    {w.star && (
                      <button
                        type="button"
                        onClick={() => setSelected(w.star)}
                        className="mt-3 min-h-11 cursor-pointer text-sm text-grey underline underline-offset-4 hover:text-ivory"
                      >
                        Light this star
                      </button>
                    )}
                  </li>
                ))}
              </ol>
            </details>
          </>
        )}
      </div>
    </section>
  )
}
