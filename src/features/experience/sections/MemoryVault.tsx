import { motion, useReducedMotion } from 'motion/react'
import { useMemo, useState } from 'react'
import { cn } from '@/lib/cn'
import { useArchive } from '../archive-context'
import { CHAPTER_DEFAULTS, useExperience, useMedia, type ChapterKey, type Memory } from '../data'
import { Dialog, MediaPlayer, Photo, plural, PreviewEmpty, SectionHeader } from '../ui'

const CHAPTER_LABEL: Record<ChapterKey, string> = {
  beginning: 'The Beginning',
  becoming: 'The Becoming',
  finding_her_way: 'Finding Her Way',
  thirty: 'Thirty',
}

const when = (m: Memory) => (m.year ? `${m.approximate ? 'c. ' : ''}${m.year}` : m.chapter ? CHAPTER_LABEL[m.chapter] : null)

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'min-h-11 cursor-pointer rounded-full border px-4 text-sm whitespace-nowrap transition-colors',
        active ? 'border-gold bg-gold/15 text-gold-bright' : 'border-ivory/15 text-ivory/75 hover:border-gold/50',
      )}
    >
      {children}
    </button>
  )
}

function MemoryCard({ memory, onOpen }: { memory: Memory; onOpen: () => void }) {
  const media = useMedia()
  const cover = memory.mediaIds.map(media).find((m) => m?.kind === 'image') ?? null
  const reduce = useReducedMotion()
  return (
    <motion.li
      layout={!reduce}
      initial={{ opacity: 0, y: reduce ? 0 : 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: reduce ? 0 : 0.5 }}
      className="mb-4 break-inside-avoid"
    >
      <button
        type="button"
        onClick={onOpen}
        className="group block w-full cursor-pointer overflow-hidden rounded-2xl border border-ivory/10 bg-midnight-raised text-left transition-colors hover:border-gold/50"
      >
        {cover && (
          <span className="block overflow-hidden">
            <Photo media={cover} className="transition-transform duration-700 group-hover:scale-[1.03]" />
          </span>
        )}
        <span className="block p-5">
          {when(memory) && <span className="block text-xs tracking-[0.25em] text-gold uppercase">{when(memory)}</span>}
          <span className="mt-2 block font-serif text-2xl text-ivory">{memory.title}</span>
          {!cover && memory.story && <span className="mt-2 line-clamp-4 block leading-relaxed text-ivory/70">{memory.story}</span>}
          {memory.attribution && <span className="mt-3 block text-sm text-grey">— {memory.attribution}</span>}
        </span>
      </button>
    </motion.li>
  )
}

export function MemoryDialog({ memoryId, onClose }: { memoryId: string | null; onClose: () => void }) {
  const { data } = useExperience()
  const media = useMedia()
  const memory = data.memories.find((m) => m.id === memoryId) ?? null
  const items = memory ? memory.mediaIds.map(media).filter((x) => x !== null) : []
  return (
    <Dialog open={Boolean(memory)} onClose={onClose} title={memory?.title ?? ''}>
      {memory && (
        <article>
          <p className="text-xs tracking-[0.25em] text-gold uppercase">
            {[when(memory), memory.category].filter(Boolean).join(' · ')}
          </p>
          {items
            .filter((m) => m.kind === 'image')
            .map((m) => (
              <figure key={m.id} className="mt-6 overflow-hidden rounded-2xl">
                <Photo media={m} />
                {m.caption && <figcaption className="mt-2 text-sm text-grey">{m.caption}</figcaption>}
              </figure>
            ))}
          {memory.story && <p className="mt-6 text-lg leading-relaxed whitespace-pre-line text-ivory/85">{memory.story}</p>}
          {memory.caption && <p className="mt-4 text-sm text-grey italic">{memory.caption}</p>}
          {items
            .filter((m) => m.kind === 'audio' || m.kind === 'video')
            .map((m) => (
              <div key={m.id} className="mt-6">
                <MediaPlayer media={m} label={`${m.kind === 'audio' ? 'Voice note' : 'Video'}: ${memory.title}`} />
              </div>
            ))}
          {memory.attribution && <p className="mt-8 font-serif text-xl text-gold">— {memory.attribution}</p>}
        </article>
      )}
    </Dialog>
  )
}

export function MemoryVault() {
  const { data, preview } = useExperience()
  const { openMemory } = useArchive()
  const [chapter, setChapter] = useState<ChapterKey | 'all'>('all')
  const [category, setCategory] = useState<string | 'all'>('all')
  const [view, setView] = useState<'grid' | 'list'>('grid')

  const categories = useMemo(
    () => [...new Set(data.memories.map((m) => m.category).filter((c): c is string => Boolean(c?.trim())))].sort(),
    [data.memories],
  )
  const chapters = CHAPTER_DEFAULTS.filter((c) => data.memories.some((m) => m.chapter === c.key))
  const shown = data.memories.filter((m) => (chapter === 'all' || m.chapter === chapter) && (category === 'all' || m.category === category))

  if (data.memories.length === 0 && !preview) return null
  return (
    <section id="vault" aria-labelledby="vault-title" className="px-6 py-28 sm:py-36">
      <div className="mx-auto max-w-6xl">
        <SectionHeader id="vault-title" eyebrow="Collected" title="The Memory Vault" intro="Every story, kept in one place. Open any card to read it in full." />
        {data.memories.length === 0 ? (
          <PreviewEmpty to="/admin/stories">No memories are published yet. Approve submissions and add them to the archive to fill the vault.</PreviewEmpty>
        ) : (
          <>
            <div className="mb-10 flex flex-col gap-4">
              {chapters.length > 1 && (
                <div role="group" aria-label="Filter by chapter" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                  <FilterChip active={chapter === 'all'} onClick={() => setChapter('all')}>
                    All chapters
                  </FilterChip>
                  {chapters.map((c) => (
                    <FilterChip key={c.key} active={chapter === c.key} onClick={() => setChapter(c.key)}>
                      {CHAPTER_LABEL[c.key]}
                    </FilterChip>
                  ))}
                </div>
              )}
              {categories.length > 1 && (
                <div role="group" aria-label="Filter by theme" className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
                  <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
                    All themes
                  </FilterChip>
                  {categories.map((c) => (
                    <FilterChip key={c} active={category === c} onClick={() => setCategory(c)}>
                      {c}
                    </FilterChip>
                  ))}
                </div>
              )}
              <div className="flex items-center justify-between gap-4">
                <p className="text-sm text-grey" role="status">
                  Showing {plural(shown.length, 'memory', 'memories')}
                </p>
                <div role="group" aria-label="Layout" className="flex gap-2">
                  <FilterChip active={view === 'grid'} onClick={() => setView('grid')}>
                    Cards
                  </FilterChip>
                  <FilterChip active={view === 'list'} onClick={() => setView('list')}>
                    List
                  </FilterChip>
                </div>
              </div>
            </div>
            {view === 'grid' ? (
              <ul className="columns-1 gap-4 sm:columns-2 lg:columns-3">
                {shown.map((m) => (
                  <MemoryCard key={m.id} memory={m} onOpen={() => openMemory(m.id)} />
                ))}
              </ul>
            ) : (
              <ul className="divide-y divide-ivory/10 border-y border-ivory/10">
                {shown.map((m) => (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => openMemory(m.id)}
                      className="flex min-h-11 w-full cursor-pointer flex-col gap-1 py-5 text-left sm:flex-row sm:items-baseline sm:gap-6"
                    >
                      <span className="w-28 shrink-0 text-sm text-gold tabular-nums">{when(m) ?? '—'}</span>
                      <span className="font-serif text-xl text-ivory">{m.title}</span>
                      {m.attribution && <span className="text-sm text-grey sm:ml-auto">{m.attribution}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </section>
  )
}
