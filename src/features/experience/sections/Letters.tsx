import { motion, useReducedMotion } from 'motion/react'
import { useState } from 'react'
import { cn } from '@/lib/cn'
import { useExperience, useMedia, type Letter } from '../data'
import { Dialog, monogram, Photo, PreviewEmpty, SectionHeader } from '../ui'

function Envelope({ letter, onOpen, large, index }: { letter: Letter; onOpen: () => void; large?: boolean; index: number }) {
  const reduce = useReducedMotion()
  const from = letter.author ?? 'someone who loves you'
  const initial = monogram(letter.author, '✦')
  return (
    <motion.li
      initial={{ opacity: 0, y: reduce ? 0 : 24, rotate: reduce ? 0 : index % 2 ? 1.5 : -1.5 }}
      whileInView={{ opacity: 1, y: 0, rotate: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : (index % 3) * 0.1 }}
      className="[perspective:900px]"
    >
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Open the letter from ${from}`}
        className={cn(
          'group relative block aspect-[3/2] w-full cursor-pointer overflow-hidden rounded-md bg-[#e8dcc6] text-midnight shadow-[0_25px_50px_-20px_rgba(0,0,0,0.7)] transition-transform duration-500 hover:-translate-y-1',
          large && 'sm:aspect-[2/1]',
        )}
      >
        <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(135deg,transparent_49.5%,rgba(0,0,0,0.06)_50%),linear-gradient(225deg,transparent_49.5%,rgba(0,0,0,0.06)_50%)]" />
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-[55%] origin-top bg-[#dccfb5] shadow-[0_6px_10px_-6px_rgba(0,0,0,0.35)] transition-transform duration-700 [clip-path:polygon(0_0,100%_0,50%_100%)] group-hover:[transform:rotateX(28deg)]"
        />
        <span
          aria-hidden="true"
          className={cn(
            'absolute top-[55%] left-1/2 grid -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-burgundy font-serif text-gold-bright shadow-[inset_0_0_0_3px_rgba(216,189,134,0.35)]',
            large ? 'size-16 text-3xl' : 'size-12 text-2xl',
          )}
        >
          {initial}
        </span>
        <span className="absolute inset-x-0 bottom-[8%] px-4 text-center font-serif text-lg sm:text-xl">From {from}</span>
      </button>
    </motion.li>
  )
}

function LetterBody({ letter }: { letter: Letter }) {
  const media = useMedia()
  const photo = media(letter.photoId)
  const voice = media(letter.voiceId)
  return (
    <article className="font-serif">
      {photo && (
        <figure className="mb-6 rotate-[-1.5deg] bg-white p-2 pb-6 shadow-lg">
          <Photo media={photo} />
          {photo.caption && <figcaption className="mt-2 text-center text-sm italic">{photo.caption}</figcaption>}
        </figure>
      )}
      <p className="text-2xl">{letter.salutation || 'Dear Roni,'}</p>
      <p className="mt-4 text-xl leading-relaxed whitespace-pre-line">{letter.body}</p>
      {letter.author && <p className="mt-8 text-right text-2xl italic">— {letter.author}</p>}
      {voice?.kind === 'audio' && (
        <div className="mt-8 font-sans">
          <p className="mb-2 text-xs tracking-[0.25em] text-midnight/60 uppercase">Hear it in their voice</p>
          <audio controls preload="none" src={voice.url} aria-label={`Voice recording of the letter from ${letter.author ?? 'a loved one'}`} className="w-full" />
          {(voice.transcript ?? voice.caption) && (
            <details className="mt-2 text-sm">
              <summary className="cursor-pointer text-burgundy underline underline-offset-4">Read the transcript</summary>
              <p className="mt-2 leading-relaxed whitespace-pre-line">{voice.transcript ?? voice.caption}</p>
            </details>
          )}
        </div>
      )}
    </article>
  )
}

export function Letters() {
  const { data, preview } = useExperience()
  const [open, setOpen] = useState<string | null>(null)
  const featured = data.letters.find((l) => l.featured) ?? null
  const rest = data.letters.filter((l) => l !== featured)
  const current = data.letters.find((l) => l.id === open) ?? null

  if (data.letters.length === 0 && !preview) return null

  return (
    <section id="letters" aria-labelledby="letters-title" className="px-6 py-28 sm:py-36">
      <div className="mx-auto max-w-5xl">
        <SectionHeader id="letters-title" eyebrow="Sealed with love" title="Words Worth Keeping" />
        {data.letters.length === 0 ? (
          <PreviewEmpty to="/admin/stories?tab=letters">No letters are published yet. Letters come from approved submissions or can be added in Stories.</PreviewEmpty>
        ) : (
          <>
            {featured && (
              <div className="mx-auto mb-16 max-w-2xl">
                <p className="mb-4 text-center text-xs tracking-[0.3em] text-gold uppercase">A letter to open first</p>
                <ul>
                  <Envelope letter={featured} onOpen={() => setOpen(featured.id)} large index={0} />
                </ul>
              </div>
            )}
            {rest.length > 0 && (
              <ul className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
                {rest.map((l, i) => (
                  <Envelope key={l.id} letter={l} onOpen={() => setOpen(l.id)} index={i} />
                ))}
              </ul>
            )}
          </>
        )}
      </div>
      <Dialog open={Boolean(current)} onClose={() => setOpen(null)} title={current ? `From ${current.author ?? 'someone who loves you'}` : ''} tone="paper">
        {current && <LetterBody letter={current} />}
      </Dialog>
    </section>
  )
}
