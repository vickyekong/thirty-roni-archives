import type { ReactNode } from 'react'
import { useExperience, useMedia } from '../data'
import type { TimesStory } from '../editorial'
import { Photo, PreviewEmpty, SectionHeader } from '../ui'

function Rule() {
  return <hr aria-hidden="true" className="my-6 border-0 border-t border-midnight/25" />
}

function Column({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="break-inside-avoid">
      <h4 className="border-b-2 border-midnight pb-2 text-[0.7rem] font-semibold tracking-[0.3em] uppercase">{title}</h4>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function Story({ story }: { story: TimesStory }) {
  const media = useMedia()
  const photo = media(story.mediaId)
  return (
    <article className="mb-6 break-inside-avoid">
      {photo && <Photo media={photo} className="mb-3 grayscale-[35%] sepia-[15%]" />}
      {story.title && <h5 className="font-serif text-2xl leading-tight font-semibold">{story.title}</h5>}
      {story.byline && <p className="mt-1 text-xs tracking-[0.2em] text-midnight/60 uppercase">By {story.byline}</p>}
      {story.body && <p className="mt-2 leading-relaxed whitespace-pre-line">{story.body}</p>}
    </article>
  )
}

export function RoniTimes() {
  const { data, preview } = useExperience()
  const media = useMedia()
  const times = data.times
  if (!times && !preview) return null

  if (!times)
    return (
      <section id="times" aria-labelledby="times-title" className="px-6 py-28 sm:py-36">
        <SectionHeader id="times-title" eyebrow="Extra! Extra!" title="The Roni Times" />
        <PreviewEmpty to="/admin/editorial?tab=roni_times">
          The Roni Times isn’t published yet, or has no stories written. Write it in Editorial; empty sections are simply not printed.
        </PreviewEmpty>
      </section>
    )

  const cover = media(times.coverStory.mediaId)
  const things = times.thirtyThings.filter((t) => t.trim())
  const photos = times.photoFeatures.map((p) => ({ ...p, media: media(p.mediaId) })).filter((p) => p.media)

  return (
    <section id="times" aria-labelledby="times-title" className="px-3 py-28 sm:px-6 sm:py-36">
      <div className="mx-auto max-w-6xl rounded-sm bg-[#f3ecdf] px-5 py-10 text-midnight shadow-[0_40px_80px_rgba(0,0,0,0.45)] sm:px-12 sm:py-14">
        <header className="text-center">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[0.65rem] tracking-[0.25em] uppercase">
            <span>{times.edition}</span>
            <span>{times.dateline}</span>
          </div>
          <hr aria-hidden="true" className="mt-3 border-0 border-t-4 border-double border-midnight" />
          <h2 id="times-title" tabIndex={-1} className="display py-4 text-6xl tracking-[0.04em] outline-none sm:text-8xl">
            {times.masthead}
          </h2>
          <hr aria-hidden="true" className="border-0 border-t-4 border-double border-midnight" />
          <p className="mt-8 font-serif text-4xl leading-none font-semibold sm:text-6xl">{times.headline}</p>
          {times.standfirst && <p className="mx-auto mt-5 max-w-2xl font-serif text-xl leading-relaxed italic">{times.standfirst}</p>}
        </header>

        {(times.coverStory.title || times.coverStory.body || cover) && (
          <>
            <Rule />
            <article className="grid gap-8 md:grid-cols-2">
              {cover && (
                <figure>
                  <Photo media={cover} className="grayscale-[35%] sepia-[15%]" />
                  {cover.caption && <figcaption className="mt-2 text-sm text-midnight/70 italic">{cover.caption}</figcaption>}
                </figure>
              )}
              <div className={cover ? undefined : 'md:col-span-2 md:columns-2 md:gap-10'}>
                {times.coverStory.title && <h3 className="font-serif text-3xl leading-tight font-semibold">{times.coverStory.title}</h3>}
                {times.coverStory.byline && (
                  <p className="mt-1 text-xs tracking-[0.2em] text-midnight/60 uppercase">By {times.coverStory.byline}</p>
                )}
                {times.coverStory.body && <p className="mt-4 text-lg leading-relaxed whitespace-pre-line">{times.coverStory.body}</p>}
              </div>
            </article>
          </>
        )}

        <Rule />
        <div className="gap-10 md:columns-2 lg:columns-3 [&>*]:mb-10">
          {things.length > 0 && (
            <Column title={`${things.length} things we love about her`}>
              <ol className="list-decimal space-y-1.5 pl-6 marker:font-serif marker:font-semibold">
                {things.map((t, i) => (
                  <li key={i} className="leading-snug">
                    {t}
                  </li>
                ))}
              </ol>
            </Column>
          )}
          {times.familyMemories.length > 0 && (
            <Column title="Family memories">
              {times.familyMemories.map((s, i) => (
                <Story key={i} story={s} />
              ))}
            </Column>
          )}
          {times.friendshipChronicles.length > 0 && (
            <Column title="Friendship chronicles">
              {times.friendshipChronicles.map((s, i) => (
                <Story key={i} story={s} />
              ))}
            </Column>
          )}
          {times.awards.length > 0 && (
            <Column title="The awards">
              <ul className="space-y-4">
                {times.awards.map((a, i) => (
                  <li key={i}>
                    <p className="font-serif text-xl font-semibold">{a.title}</p>
                    {a.citation && <p className="mt-1 leading-relaxed">{a.citation}</p>}
                  </li>
                ))}
              </ul>
            </Column>
          )}
          {times.forecast.trim() && (
            <Column title="The forecast for thirty">
              <p className="font-serif text-xl leading-relaxed whitespace-pre-line italic">{times.forecast}</p>
            </Column>
          )}
        </div>

        {photos.length > 0 && (
          <>
            <Rule />
            <h4 className="text-center text-[0.7rem] font-semibold tracking-[0.3em] uppercase">In pictures</h4>
            <ul className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {photos.map((p, i) => (
                <li key={i}>
                  <figure>
                    <Photo media={p.media!} className="aspect-[4/3] grayscale-[35%] sepia-[15%]" />
                    {p.caption && <figcaption className="mt-2 text-sm italic">{p.caption}</figcaption>}
                  </figure>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </section>
  )
}
