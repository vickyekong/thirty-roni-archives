import { motion, useReducedMotion } from 'motion/react'
import { useExperience, useMedia, type Person } from '../data'
import { MediaPlayer, monogram, Photo, PreviewEmpty, SectionHeader, SourceTag } from '../ui'

function PersonCard({ person, index }: { person: Person; index: number }) {
  const media = useMedia()
  const reduce = useReducedMotion()
  const portrait = media(person.portraitId)
  const voice = media(person.voiceId)
  const video = media(person.videoId)
  const initial = monogram(person.name, '·')

  return (
    <motion.li
      initial={{ opacity: 0, y: reduce ? 0 : 30 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-10% 0px' }}
      transition={{ duration: reduce ? 0 : 0.9, delay: reduce ? 0 : (index % 3) * 0.12, ease: [0.22, 1, 0.36, 1] }}
      className="flex flex-col overflow-hidden rounded-3xl border border-ivory/10 bg-midnight-raised/80"
    >
      <article aria-labelledby={`person-${person.id}`} className="flex flex-1 flex-col">
        {portrait ? (
          <Photo media={portrait} className="aspect-[4/5]" />
        ) : (
          <div aria-hidden="true" className="grid aspect-[4/5] place-items-center bg-[radial-gradient(circle_at_50%_40%,rgba(87,44,61,0.7),transparent_70%)]">
            <span className="display text-8xl text-gold/70">{initial}</span>
          </div>
        )}
        <div className="flex flex-1 flex-col p-6">
          <h3 id={`person-${person.id}`} className="font-serif text-3xl text-ivory">
            {person.name}
          </h3>
          {person.relationship && <p className="mt-1 text-xs tracking-[0.25em] text-gold uppercase">{person.relationship}</p>}
          {person.message && (
            <blockquote className="mt-5 flex-1 font-serif text-xl leading-relaxed whitespace-pre-line text-ivory/85 italic">
              “{person.message}”
            </blockquote>
          )}
          {voice && (
            <div className="mt-6">
              <p className="mb-2 text-xs tracking-[0.25em] text-grey uppercase">In their voice</p>
              <MediaPlayer media={voice} label={`Voice message from ${person.name}`} />
            </div>
          )}
          {video && (
            <div className="mt-6">
              <MediaPlayer media={video} label={`Video message from ${person.name}`} />
            </div>
          )}
          <SourceTag source={person.source} edit={`/admin/people?edit=${person.id}`} className="mt-6" />
        </div>
      </article>
    </motion.li>
  )
}

export function ThroughTheirEyes() {
  const { data, preview } = useExperience()
  if (data.people.length === 0 && !preview) return null
  return (
    <section id="people" aria-labelledby="people-title" className="px-6 py-28 sm:py-36">
      <div className="mx-auto max-w-6xl">
        <SectionHeader id="people-title" eyebrow="The people who love her" title="Through Their Eyes" />
        {data.people.length === 0 ? (
          <PreviewEmpty to="/admin/people">No contributor cards are published yet. Cards are created when you add approved submissions to the archive.</PreviewEmpty>
        ) : (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {data.people.map((p, i) => (
              <PersonCard key={p.id} person={p} index={i} />
            ))}
          </ul>
        )}
      </div>
    </section>
  )
}
