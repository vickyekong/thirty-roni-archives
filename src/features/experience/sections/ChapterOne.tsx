import { useReducedMotion } from 'motion/react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@/lib/cn'
import { gsap } from '@/lib/gsap'
import { useArchive } from '../archive-context'
import { scrollToSection } from '../chrome'
import { useExperience, useMedia, type Chapter, type Experience, type Memory, type Milestone, type ResolvedMedia } from '../data'
import { belongsToChapterOne, type ChapterOneContent, type ChapterOneMoment } from '../editorial'
import { Dialog, MediaPlayer, monogram, Photo, PillButton, SourceTag } from '../ui'

const EDIT = '/admin/editorial?tab=chapter_one'

/** Where an item lands when the curator has not placed it in a moment. Keys match the four default moments. */
function defaultMomentKey(year: number | null, category: string | null) {
  if (year === 1996) return 'born'
  if (category === 'family') return 'family'
  if (year !== null && year >= 2004) return 'closing'
  return 'little'
}

type MomentView = { moment: ChapterOneMoment; memories: Memory[]; milestones: Milestone[] }

function arrangeMoments(content: ChapterOneContent, memories: Memory[], milestones: Milestone[]): MomentView[] {
  const views: MomentView[] = content.moments.filter((m) => !m.hidden).map((moment) => ({ moment, memories: [], milestones: [] }))
  const first = views[0]
  if (!first) return views
  const byId = new Map(memories.map((m) => [m.id, m]))
  for (const v of views) v.memories = v.moment.memoryIds.map((id) => byId.get(id)).filter((m): m is Memory => Boolean(m))
  const place = (key: string) => views.find((v) => v.moment.key === key) ?? first
  if (content.autoCollect) {
    const assigned = new Set(content.moments.flatMap((m) => m.memoryIds))
    const excluded = new Set(content.excludedMemoryIds)
    for (const m of memories)
      if (!assigned.has(m.id) && !excluded.has(m.id) && belongsToChapterOne(m)) place(defaultMomentKey(m.year, m.category)).memories.push(m)
  }
  for (const ms of milestones) place(defaultMomentKey(ms.year, null)).milestones.push(ms)
  return views
}

type AlbumPhoto = { media: ResolvedMedia; caption: string | null }

function useAlbum(views: MomentView[]) {
  const { data } = useExperience()
  const media = useMedia()
  return useMemo(() => {
    const chosen: AlbumPhoto[] = []
    const add = (id: string | null | undefined, caption: string | null) => {
      const m = media(id)
      if (m?.kind === 'image' && !chosen.some((c) => c.media.id === m.id)) chosen.push({ media: m, caption: caption || m.caption })
    }
    for (const a of data.chapterOne.album) add(a.mediaId, a.caption || null)
    // Unfilled frames borrow the chapter's own approved photographs, in the order the moments tell them.
    for (const v of views) {
      if (chosen.length >= 3) break
      for (const id of v.moment.mediaIds) add(id, null)
      for (const ms of v.milestones) for (const id of [ms.featuredId, ...ms.photoIds]) add(id, ms.title)
      for (const mem of v.memories) for (const id of mem.mediaIds) add(id, mem.title)
    }
    return chosen.slice(0, 3)
  }, [data.chapterOne.album, views, media])
}

/** Approved display name plus, only when that name is shown, the relationship from their published card. */
function useByline() {
  const { data } = useExperience()
  return (attribution: string | null, contributorId: string | null) => {
    if (!attribution) return null
    const relationship = contributorId ? data.people.find((p) => p.contributorId === contributorId)?.relationship : null
    return relationship ? `${attribution} · ${relationship}` : attribution
  }
}

function Frame({
  photo,
  className,
  imgClassName,
  annotate,
  onOpen,
  label,
}: {
  photo: AlbumPhoto
  className?: string
  imgClassName?: string
  annotate?: boolean
  onOpen: () => void
  label: string
}) {
  return (
    <figure className={cn('c1-frame absolute', className)}>
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${label}${photo.media.alt_text ? `: ${photo.media.alt_text}` : ''}. Open larger`}
        className="block w-full cursor-zoom-in border border-gold/45 bg-[#1a191e] p-2 shadow-[0_35px_70px_-25px_rgba(0,0,0,0.9),0_0_0_1px_rgba(0,0,0,0.4)] transition-transform duration-500 ease-[var(--ease-editorial)] hover:-translate-y-1 sm:p-2.5"
      >
        <span className="relative block overflow-hidden">
          <Photo media={photo.media} className={cn('sepia-[0.12]', imgClassName)} />
          <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(120%_80%_at_30%_20%,rgba(216,189,134,0.14),transparent_60%)] mix-blend-soft-light" />
          {annotate && photo.caption && (
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 bg-gradient-to-b from-midnight/75 via-midnight/30 to-transparent px-4 pt-3 pb-10 text-left sm:px-5 sm:pt-4">
              <span className="block -rotate-2 font-serif text-xl leading-snug text-gold-bright italic [text-shadow:0_1px_10px_rgba(16,16,20,0.8)] sm:text-2xl">
                {photo.caption}
              </span>
            </span>
          )}
        </span>
      </button>
      {photo.caption && <figcaption className="sr-only">{photo.caption}</figcaption>}
    </figure>
  )
}

function EmptyAlbum() {
  return (
    <div className="relative mx-auto aspect-[4/5] w-full max-w-md">
      <div aria-hidden="true" className="absolute top-[4%] left-[10%] h-[72%] w-[70%] -rotate-2 border border-gold/30 bg-ivory/[0.02]" />
      <div aria-hidden="true" className="absolute right-[2%] bottom-[20%] h-[34%] w-[40%] rotate-3 border border-dashed border-gold/25" />
      <div aria-hidden="true" className="absolute bottom-[4%] left-[2%] h-[28%] w-[34%] -rotate-3 border border-dashed border-gold/20" />
      <div aria-hidden="true" className="absolute top-[18%] left-1/2 size-40 -translate-x-1/2 sm:size-48">
        <div className="absolute inset-0 animate-[spin_70s_linear_infinite] rounded-full border border-dashed border-gold/30" />
        <div className="absolute inset-5 animate-[spin_50s_linear_infinite_reverse] rounded-full border border-gold/15" />
        <span className="absolute inset-0 m-auto size-1.5 animate-pulse rounded-full bg-gold-bright shadow-[0_0_24px_6px_rgba(216,189,134,0.45)]" />
      </div>
      <p className="absolute inset-x-[14%] top-[58%] text-center font-serif text-2xl leading-snug text-ivory/85 italic [text-shadow:0_0_18px_#101014,0_0_6px_#101014] sm:text-[1.7rem]">
        Every beautiful story has a beginning. Hers is being gathered with love.
      </p>
    </div>
  )
}

function Album({ photos }: { photos: AlbumPhoto[] }) {
  const [open, setOpen] = useState<AlbumPhoto | null>(null)
  const [featured, second, third] = photos
  if (!featured) return <EmptyAlbum />
  return (
    <>
      <div className="relative mx-auto aspect-[4/5] w-full max-w-md md:max-w-lg">
        <div aria-hidden="true" className="absolute -inset-10 bg-[radial-gradient(50%_45%_at_50%_45%,rgba(198,166,107,0.16),transparent_70%)] blur-2xl" />
        <Frame
          photo={featured}
          label="Featured photograph"
          annotate
          onOpen={() => setOpen(featured)}
          className={cn('c1-featured top-0 z-10 -rotate-[1.5deg]', second ? 'left-[8%] w-[74%]' : 'left-[10%] w-[80%]')}
          imgClassName="aspect-[4/5]"
        />
        {second && (
          <Frame
            photo={second}
            label="Photograph"
            onOpen={() => setOpen(second)}
            className="c1-small top-[46%] right-0 z-20 w-[40%] rotate-[3deg]"
            imgClassName="aspect-square"
          />
        )}
        {third && (
          <Frame
            photo={third}
            label="Photograph"
            onOpen={() => setOpen(third)}
            className="c1-small bottom-[-4%] left-0 z-20 w-[36%] -rotate-[4deg]"
            imgClassName="aspect-[4/5]"
          />
        )}
      </div>
      <Dialog open={open !== null} onClose={() => setOpen(null)} title={open?.caption ?? 'From the family album'}>
        {open && <Photo media={open.media} eager className="max-h-[70dvh] object-contain" />}
      </Dialog>
    </>
  )
}

function MemoryCard({ memory }: { memory: Memory }) {
  const media = useMedia()
  const { openMemory } = useArchive()
  const byline = useByline()
  const items = memory.mediaIds.map(media).filter((m) => m !== null)
  const cover = items.find((m) => m.kind === 'image')
  const voice = items.find((m) => m.kind === 'audio')
  const hasVideo = items.some((m) => m.kind === 'video')
  const by = byline(memory.attribution, memory.contributorId)
  return (
    <li className="c1-card">
      <article className="h-full overflow-hidden rounded-2xl border border-ivory/10 bg-midnight-raised/70 transition-colors hover:border-gold/40">
        {cover && (
          <button type="button" onClick={() => openMemory(memory.id)} className="block w-full cursor-pointer overflow-hidden" tabIndex={-1} aria-hidden="true">
            <Photo media={cover} className="aspect-[4/3] sepia-[0.1] transition-transform duration-700 hover:scale-[1.03]" />
          </button>
        )}
        <div className="p-5 sm:p-6">
          {memory.year && (
            <p className="text-xs tracking-[0.25em] text-gold uppercase tabular-nums">
              {memory.approximate ? 'c. ' : ''}
              {memory.year}
            </p>
          )}
          <h5 className="mt-2 font-serif text-2xl leading-tight text-ivory">
            <button type="button" onClick={() => openMemory(memory.id)} className="cursor-pointer text-left hover:text-gold-bright">
              {memory.title}
            </button>
          </h5>
          {memory.story && <p className="mt-3 line-clamp-5 leading-relaxed whitespace-pre-line text-ivory/75">{memory.story}</p>}
          {by && <p className="mt-4 font-serif text-lg text-gold italic">— {by}</p>}
          {voice && (
            <div className="mt-4">
              <MediaPlayer media={voice} label={`Voice note: ${memory.title}`} />
            </div>
          )}
          <button
            type="button"
            onClick={() => openMemory(memory.id)}
            className="mt-4 min-h-11 cursor-pointer text-xs tracking-[0.25em] text-ivory/70 uppercase underline-offset-4 hover:text-gold-bright hover:underline"
          >
            {hasVideo ? 'Read the memory and watch' : 'Read the full memory'}
          </button>
        </div>
      </article>
      <SourceTag source={memory.source} edit={`/admin/stories?edit=${memory.id}`} className="mt-2" />
    </li>
  )
}

function MilestoneCard({ milestone }: { milestone: Milestone }) {
  const media = useMedia()
  const photo = media(milestone.featuredId) ?? milestone.photoIds.map(media).find((m) => m?.kind === 'image') ?? null
  return (
    <li className="c1-card">
      <article className="h-full overflow-hidden rounded-2xl border border-gold/25 bg-midnight-raised/70">
        {photo && <Photo media={photo} className="aspect-[4/3] sepia-[0.1]" />}
        <div className="p-5 sm:p-6">
          <p className="text-xs tracking-[0.25em] text-gold uppercase tabular-nums">
            {milestone.year}
            {milestone.age !== null && ` · Age ${milestone.age}`}
          </p>
          <h5 className="mt-2 font-serif text-2xl leading-tight text-ivory">{milestone.title}</h5>
          {milestone.description && <p className="mt-3 leading-relaxed whitespace-pre-line text-ivory/75">{milestone.description}</p>}
        </div>
      </article>
      <SourceTag source={milestone.source} edit={`/admin/timeline?edit=${milestone.id}`} className="mt-2" />
    </li>
  )
}

function Moment({ view, number }: { view: MomentView; number: number }) {
  const { preview, peek } = useExperience()
  const media = useMedia()
  const { moment, memories, milestones } = view
  const photos = moment.mediaIds.map(media).filter((m) => m?.kind === 'image') as ResolvedMedia[]
  const narration = media(moment.narrationId)
  const empty = !memories.length && !milestones.length && !photos.length && !narration
  if (empty && !preview) return null
  const numeric = /^\d{4}$/.test(moment.marker.trim())
  return (
    <li className="c1-moment relative grid gap-8 pb-24 last:pb-0 md:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] md:gap-16">
      <span aria-hidden="true" className="absolute top-3 -left-[1.95rem] size-2.5 rounded-full bg-gold shadow-[0_0_18px_rgba(216,189,134,0.8)] md:-left-[2.45rem]" />
      <div className="self-start md:sticky md:top-28">
        <p className="eyebrow">Moment {String(number).padStart(2, '0')}</p>
        {moment.marker && (
          <p className={cn('c1-marker mt-3 text-gold-bright', numeric ? 'display text-6xl tabular-nums sm:text-7xl' : 'font-serif text-3xl italic')}>
            {moment.marker}
          </p>
        )}
      </div>
      <div>
        <h4 className="display text-4xl text-ivory sm:text-5xl">{moment.title}</h4>
        {moment.description && <p className="mt-5 max-w-xl font-serif text-xl leading-relaxed text-ivory/70 italic">{moment.description}</p>}
        {narration && (
          <div className="mt-6 max-w-xl">
            <p className="mb-2 text-xs tracking-[0.25em] text-grey uppercase">Listen</p>
            <MediaPlayer media={narration} label={`Narration: ${moment.title}`} />
          </div>
        )}
        {photos.length > 0 && (
          <ul className="-mx-6 mt-8 flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pb-2 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
            {photos.map((p, i) => (
              <li key={p.id} className={cn('c1-card w-[70%] shrink-0 snap-center sm:w-auto', i % 2 ? 'sm:mt-8 sm:rotate-1' : 'sm:-rotate-1')}>
                <figure className="border border-gold/35 bg-[#1a191e] p-2 shadow-[0_25px_50px_-25px_rgba(0,0,0,0.9)]">
                  <Photo media={p} className="aspect-[4/5] sepia-[0.12]" />
                  {p.caption && <figcaption className="mt-2 font-serif text-sm text-ivory/65 italic">{p.caption}</figcaption>}
                </figure>
              </li>
            ))}
          </ul>
        )}
        {(memories.length > 0 || milestones.length > 0) && (
          <ul className="mt-8 grid gap-5 sm:grid-cols-2">
            {milestones.map((ms) => (
              <MilestoneCard key={ms.id} milestone={ms} />
            ))}
            {memories.map((m) => (
              <MemoryCard key={m.id} memory={m} />
            ))}
          </ul>
        )}
        {empty && (
          <div className="mt-8 max-w-xl rounded-2xl border border-dashed border-gold/25 px-5 py-4">
            <p className="text-sm leading-relaxed text-ivory/70">
              {peek
                ? 'Memories from family will gather here.'
                : 'Shown only in your preview. Approved memories, photos and voice notes for this moment will appear here; Roni won’t see an empty moment.'}
            </p>
            <SourceTag edit={EDIT} label="Place memories in this moment" className="mt-3" />
          </div>
        )}
      </div>
    </li>
  )
}

type MessageView = {
  id: string
  name: string | null
  relationship: string | null
  message: string
  photo: ResolvedMedia | null
  voice: ResolvedMedia | null
  edit: string
}

function useFamilyMessages(data: Experience): MessageView[] {
  const media = useMedia()
  return data.chapterOne.familyMessages.flatMap((f): MessageView[] => {
    if (f.kind === 'person') {
      const p = data.people.find((x) => x.id === f.id)
      if (!p?.message?.trim()) return []
      return [{ id: p.id, name: p.name, relationship: p.relationship, message: p.message, photo: media(p.portraitId), voice: media(p.voiceId), edit: `/admin/people?edit=${p.id}` }]
    }
    const l = data.letters.find((x) => x.id === f.id)
    if (!l?.body.trim()) return []
    const relationship = l.author && l.contributorId ? (data.people.find((p) => p.contributorId === l.contributorId)?.relationship ?? null) : null
    return [
      {
        id: l.id,
        name: l.author,
        relationship,
        message: [l.salutation, l.body].filter(Boolean).join('\n\n'),
        photo: media(l.photoId),
        voice: media(l.voiceId),
        edit: `/admin/stories?tab=letters&edit=${l.id}`,
      },
    ]
  })
}

function FamilyMessage() {
  const { data, preview, peek } = useExperience()
  const messages = useFamilyMessages(data)
  if (!messages.length && !preview) return null
  return (
    <section aria-labelledby="c1-family-title" className="c1-letter mx-auto mt-28 max-w-5xl sm:mt-36">
      <div className="mb-10 flex flex-col items-center gap-4 text-center">
        <span aria-hidden="true" className="hairline w-24" />
        <h4 id="c1-family-title" className="eyebrow">
          From the people who knew her first
        </h4>
      </div>
      {messages.length === 0 ? (
        <div className="mx-auto max-w-xl rounded-sm border border-dashed border-gold/30 px-8 py-10 text-center">
          <p className="font-serif text-2xl text-ivory/80 italic">A letter from home will rest here.</p>
          {!peek && (
            <>
              <p className="mt-3 text-sm leading-relaxed text-grey">
                Shown only in your preview. Choose a published message from her parents in Editorial → Chapter One. Nothing is written for them.
              </p>
              <SourceTag edit={EDIT} label="Choose the family message" className="mx-auto mt-4 max-w-sm justify-center" />
            </>
          )}
        </div>
      ) : (
        <ul className={cn('grid gap-8', messages.length > 1 && 'md:grid-cols-2')}>
          {messages.map((m) => (
            <li key={m.id}>
              <article className="relative h-full rounded-sm bg-[#f3ecdf] px-7 py-9 text-midnight shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)] sm:px-10 sm:py-12">
                <span aria-hidden="true" className="pointer-events-none absolute inset-2 border border-burgundy/15" />
                <div className="flex items-center gap-4">
                  {m.photo ? (
                    <Photo media={m.photo} className="size-16 shrink-0 rounded-full object-cover sepia-[0.15]" />
                  ) : (
                    <span aria-hidden="true" className="grid size-16 shrink-0 place-items-center rounded-full border border-burgundy/30 font-serif text-2xl text-burgundy">
                      {monogram(m.name, '♡')}
                    </span>
                  )}
                  <div>
                    {m.name && <p className="font-serif text-2xl leading-tight">{m.name}</p>}
                    {m.relationship && <p className="text-xs tracking-[0.25em] text-burgundy uppercase">{m.relationship}</p>}
                  </div>
                </div>
                <p className="mt-7 font-serif text-xl leading-relaxed whitespace-pre-line text-midnight/85">{m.message}</p>
                {m.voice && (
                  <div className="mt-6">
                    <MediaPlayer media={m.voice} label={`Voice message${m.name ? ` from ${m.name}` : ''}`} />
                  </div>
                )}
                {m.name && <p className="mt-8 text-right font-serif text-2xl text-burgundy italic">— {m.name}</p>}
                <SourceTag edit={m.edit} label="Featured family message" tone="paper" className="mt-6" />
              </article>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function NextChapter() {
  const { data } = useExperience()
  const reduce = useReducedMotion()
  const next = data.chapters.find((c) => c.key === 'becoming')
  const go = () => {
    const target = document.getElementById('chapter-becoming') ? 'chapter-becoming' : document.getElementById('timeline')?.nextElementSibling?.id
    if (target) scrollToSection(target, !reduce)
  }
  return (
    <div className="c1-next mt-28 flex flex-col items-center gap-6 text-center sm:mt-36">
      <span aria-hidden="true" className="h-16 w-px bg-gradient-to-b from-transparent to-gold/70" />
      <p className="eyebrow">The first chapter closes</p>
      {next && <p className="font-serif text-2xl text-ivory/80 italic">{next.title}</p>}
      <PillButton onClick={go}>Continue to Chapter Two</PillButton>
    </div>
  )
}

export function ChapterOne({ chapter, milestones }: { chapter: Chapter; milestones: Milestone[] }) {
  const { data, preview, peek } = useExperience()
  const root = useRef<HTMLElement>(null)
  const reduce = useReducedMotion()
  const content = data.chapterOne
  const views = useMemo(() => arrangeMoments(content, data.memories, milestones), [content, data.memories, milestones])
  const photos = useAlbum(views)
  const paragraphs = content.intro.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)
  const shownMoments = views.filter((v) => preview || v.memories.length || v.milestones.length || v.moment.mediaIds.length || v.moment.narrationId)

  useLayoutEffect(() => {
    if (reduce || !root.current) return
    const ctx = gsap.context(() => {
      const enter = (targets: gsap.TweenTarget, trigger: Element | string, vars: gsap.TweenVars = {}) =>
        gsap.from(targets, { opacity: 0, y: 36, duration: 1.2, ease: 'power3.out', ...vars, scrollTrigger: { trigger, start: 'top 82%', once: true } })
      enter('.c1-word', '.c1-head', { y: 28, stagger: 0.07, duration: 1.1 })
      enter('.c1-intro > *', '.c1-intro', { stagger: 0.18 })
      gsap.from('.c1-featured', {
        clipPath: 'inset(100% 0% 0% 0%)',
        scale: 1.06,
        duration: 1.6,
        ease: 'power3.inOut',
        scrollTrigger: { trigger: '.c1-album', start: 'top 78%', once: true },
      })
      enter('.c1-small', '.c1-album', { y: 70, delay: 0.5, stagger: 0.2, duration: 1.4 })
      gsap.utils.toArray<HTMLElement>('.c1-moment').forEach((m) => enter(m, m, { y: 48 }))
      gsap.utils.toArray<HTMLElement>('.c1-card').forEach((c) => enter(c, c, { y: 28, duration: 0.9 }))
      enter('.c1-letter', '.c1-letter', { y: 48 })
      enter('.c1-next', '.c1-next')
      gsap.fromTo(
        '.c1-line',
        { scaleY: 0 },
        { scaleY: 1, ease: 'none', scrollTrigger: { trigger: '.c1-moments', start: 'top 70%', end: 'bottom 70%', scrub: 0.6 } },
      )
      // Photographic parallax only where there is room and a pointer-sized screen.
      gsap.matchMedia().add('(min-width: 768px)', () => {
        const drift = (sel: string, amount: number) =>
          gsap.utils.toArray<HTMLElement>(sel).forEach((el, i) =>
            gsap.fromTo(
              el,
              { yPercent: amount * (i % 2 ? -1 : 1) },
              { yPercent: -amount * (i % 2 ? -1 : 1), ease: 'none', scrollTrigger: { trigger: '.c1-album', start: 'top bottom', end: 'bottom top', scrub: true } },
            ),
          )
        drift('.c1-featured', 4)
        drift('.c1-small', 14)
      })
    }, root)
    return () => ctx.revert()
  }, [reduce, photos.length, shownMoments.length])

  return (
    <article
      ref={root}
      id={`chapter-${chapter.key}`}
      aria-labelledby={`chapter-${chapter.key}-title`}
      className="relative overflow-x-clip py-24 sm:py-32"
      style={{ background: 'radial-gradient(70% 50% at 20% 18%, rgba(198,166,107,0.10), transparent 70%), radial-gradient(45% 35% at 85% 30%, rgba(216,189,134,0.06), transparent 70%)' }}
    >
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid items-center gap-16 md:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] md:gap-20">
          <div className="c1-head">
            <p className="eyebrow">{chapter.kicker}</p>
            <h3 id={`chapter-${chapter.key}-title`} tabIndex={-1} className="display mt-5 text-5xl text-ivory outline-none sm:text-6xl lg:text-7xl">
              {chapter.title.split(' ').map((w, i) => (
                <span key={i} className="c1-word inline-block">
                  {w}
                  {'\u00a0'}
                </span>
              ))}
            </h3>
            <div className="mt-6 flex items-center gap-4">
              <span aria-hidden="true" className="flex gap-1.5">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-3 w-px bg-gold/60" />
                ))}
              </span>
              <p className="font-serif text-2xl text-gold tabular-nums">{chapter.period}</p>
              <span aria-hidden="true" className="h-px flex-1 bg-gradient-to-r from-gold/40 to-transparent" />
            </div>
            {paragraphs.length > 0 && (
              <div className="c1-intro mt-8 flex max-w-md flex-col gap-4">
                {paragraphs.map((p, i) => (
                  <p
                    key={i}
                    className={cn(
                      'leading-relaxed whitespace-pre-line',
                      i === paragraphs.length - 1 && paragraphs.length > 1 ? 'font-serif text-2xl text-gold-bright italic' : 'text-lg text-ivory/75',
                    )}
                  >
                    {p}
                  </p>
                ))}
              </div>
            )}
            {!peek && (
              <SourceTag
                edit={EDIT}
                label={data.chapterOneDraft ? 'Chapter One · unpublished draft. Roni sees the published version, or the defaults' : 'Chapter One · editorial'}
                className="mt-6 max-w-md"
              />
            )}
          </div>
          <div className="c1-album relative pb-10 md:pb-0">
            <Album photos={photos} />
          </div>
        </div>

        {shownMoments.length > 0 && (
          <div className="c1-moments relative mt-28 pl-8 sm:mt-36 md:pl-10">
            <span aria-hidden="true" className="absolute top-0 left-0 h-full w-px bg-ivory/10" />
            <span aria-hidden="true" className="c1-line absolute top-0 left-0 h-full w-px origin-top bg-gradient-to-b from-gold-bright to-gold/30" />
            <ol>
              {shownMoments.map((v, i) => (
                <Moment key={`${v.moment.key}-${i}`} view={v} number={i + 1} />
              ))}
            </ol>
          </div>
        )}

        <FamilyMessage />
        <NextChapter />
      </div>
    </article>
  )
}
