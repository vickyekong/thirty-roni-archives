import { useReducedMotion } from 'motion/react'
import { useLayoutEffect, useRef } from 'react'
import { gsap } from '@/lib/gsap'
import { useArchive } from '../archive-context'
import { useExperience, useMedia, type Chapter, type Memory, type Milestone } from '../data'
import { Photo, PreviewEmpty, SectionHeader, SourceTag } from '../ui'

const TINTS: Record<Chapter['key'], string> = {
  beginning: 'rgba(198,166,107,0.10)',
  becoming: 'rgba(87,44,61,0.35)',
  finding_her_way: 'rgba(61,31,43,0.45)',
  thirty: 'rgba(216,189,134,0.14)',
}

function MilestoneItem({ m, memories }: { m: Milestone; memories: Memory[] }) {
  const media = useMedia()
  const { openMemory } = useArchive()
  const featured = media(m.featuredId)
  const photos = m.photoIds.map(media).filter((x) => x !== null)
  const linked = m.memoryIds.map((id) => memories.find((x) => x.id === id)).filter((x): x is Memory => Boolean(x))

  return (
    <li className="tl-item relative pb-20 last:pb-0">
      <span aria-hidden="true" className="absolute top-4 -left-[2.3rem] size-2.5 rounded-full bg-gold shadow-[0_0_18px_rgba(216,189,134,0.8)]" />
      <p className="tl-year display text-6xl text-gold-bright tabular-nums sm:text-7xl">{m.year}</p>
      {m.age !== null && <p className="mt-1 text-xs tracking-[0.3em] text-grey uppercase">Age {m.age}</p>}
      <h4 className="mt-4 font-serif text-3xl text-ivory">{m.title}</h4>
      {m.description && <p className="mt-3 max-w-prose leading-relaxed whitespace-pre-line text-ivory/75">{m.description}</p>}
      <SourceTag source={m.source} edit={`/admin/timeline?edit=${m.id}`} className="mt-4 max-w-prose" />
      {featured && (
        <figure className="mt-6 overflow-hidden rounded-2xl border border-ivory/10">
          <Photo media={featured} className="max-h-[70vh]" />
          {featured.caption && <figcaption className="px-4 py-3 text-sm text-grey">{featured.caption}</figcaption>}
        </figure>
      )}
      {photos.length > 0 && (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {photos.map((p) => (
            <li key={p.id} className="overflow-hidden rounded-xl border border-ivory/10">
              <Photo media={p} className="aspect-square" />
            </li>
          ))}
        </ul>
      )}
      {linked.length > 0 && (
        <div className="mt-6">
          <p className="text-xs tracking-[0.25em] text-grey uppercase">Remembered by</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {linked.map((mem) => (
              <li key={mem.id}>
                <button
                  type="button"
                  onClick={() => openMemory(mem.id)}
                  className="min-h-11 cursor-pointer rounded-full border border-gold/30 px-4 text-sm text-ivory/90 transition-colors hover:border-gold hover:text-gold-bright"
                >
                  {mem.title}
                  {mem.attribution && <span className="text-grey"> · {mem.attribution}</span>}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  )
}

function ChapterBlock({ chapter, milestones, memories }: { chapter: Chapter; milestones: Milestone[]; memories: Memory[] }) {
  const { data } = useExperience()
  const { openMemory } = useArchive()
  const chapterMemories = memories.filter((m) => m.chapter === chapter.key)
  const unlinked = chapterMemories.filter((m) => !milestones.some((ms) => ms.memoryIds.includes(m.id)))
  const empty = milestones.length === 0 && chapterMemories.length === 0

  return (
    <article
      id={`chapter-${chapter.key}`}
      aria-labelledby={`chapter-${chapter.key}-title`}
      className="tl-chapter relative py-24 sm:py-32"
      style={{ background: `radial-gradient(70% 60% at 20% 30%, ${TINTS[chapter.key]}, transparent 70%)` }}
    >
      <div className="mx-auto grid max-w-6xl gap-12 px-6 md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] md:gap-20">
        <div className="self-start md:sticky md:top-28">
          <p className="eyebrow">{chapter.kicker}</p>
          <h3 id={`chapter-${chapter.key}-title`} className="display mt-5 text-5xl text-ivory sm:text-6xl">
            {chapter.title}
          </h3>
          <p className="mt-5 font-serif text-2xl text-gold tabular-nums">{chapter.period}</p>
          {chapter.description && <p className="mt-6 max-w-md leading-relaxed whitespace-pre-line text-ivory/70">{chapter.description}</p>}
        </div>
        <div>
          {empty ? (
            <PreviewEmpty to="/admin/timeline">
              No published milestones or memories in {chapter.kicker.split('—')[1]?.trim() ?? 'this chapter'} yet. Approved memories and
              milestones will appear here.
            </PreviewEmpty>
          ) : (
            <>
              {milestones.length > 0 && (
                <div className="relative pl-9">
                  <span aria-hidden="true" className="absolute top-0 left-0 h-full w-px bg-ivory/10" />
                  <span aria-hidden="true" className="tl-line absolute top-0 left-0 h-full w-px origin-top bg-gradient-to-b from-gold-bright to-gold/40" />
                  <ol>
                    {milestones.map((m) => (
                      <MilestoneItem key={m.id} m={m} memories={data.memories} />
                    ))}
                  </ol>
                </div>
              )}
              {unlinked.length > 0 && (
                <div className={milestones.length > 0 ? 'mt-16' : undefined}>
                  <p className="eyebrow">Memories from this chapter</p>
                  <ul className="mt-5 grid gap-3 sm:grid-cols-2">
                    {unlinked.map((mem) => (
                      <li key={mem.id} className="tl-item">
                        <button
                          type="button"
                          onClick={() => openMemory(mem.id)}
                          className="block min-h-11 w-full cursor-pointer rounded-2xl border border-ivory/10 p-5 text-left transition-colors hover:border-gold/50"
                        >
                          <span className="block font-serif text-xl text-ivory">{mem.title}</span>
                          {(mem.year || mem.attribution) && (
                            <span className="mt-1 block text-sm text-grey">
                              {[mem.year && `${mem.approximate ? 'c. ' : ''}${mem.year}`, mem.attribution].filter(Boolean).join(' · ')}
                            </span>
                          )}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </article>
  )
}

export function Timeline() {
  const { data, preview } = useExperience()
  const root = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()

  const visible = data.chapters.filter(
    (c) => preview || data.milestones.some((m) => m.chapter === c.key) || data.memories.some((m) => m.chapter === c.key),
  )

  useLayoutEffect(() => {
    if (reduce || !root.current) return
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.tl-line').forEach((line) => {
        gsap.fromTo(
          line,
          { scaleY: 0 },
          { scaleY: 1, ease: 'none', scrollTrigger: { trigger: line.parentElement, start: 'top 70%', end: 'bottom 70%', scrub: 0.6 } },
        )
      })
      gsap.utils.toArray<HTMLElement>('.tl-item').forEach((item) => {
        gsap.from(item, { opacity: 0, y: 48, duration: 1.1, ease: 'power3.out', scrollTrigger: { trigger: item, start: 'top 88%', once: true } })
      })
      gsap.utils.toArray<HTMLElement>('.tl-year').forEach((year) => {
        gsap.fromTo(year, { yPercent: 18 }, { yPercent: -18, ease: 'none', scrollTrigger: { trigger: year, start: 'top bottom', end: 'bottom top', scrub: true } })
      })
    }, root)
    return () => ctx.revert()
  }, [reduce, visible.length])

  if (visible.length === 0) return null

  return (
    <section ref={root} id="timeline" aria-labelledby="timeline-title" className="relative pt-28">
      <div className="px-6">
        <SectionHeader
          id="timeline-title"
          eyebrow="Thirty years"
          title="The Timeline"
          intro="Four chapters, from the beginning to the next one."
        />
      </div>
      {visible.map((c) => (
        <ChapterBlock key={c.key} chapter={c} milestones={data.milestones.filter((m) => m.chapter === c.key)} memories={data.memories} />
      ))}
    </section>
  )
}
