import { useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { Archive } from './Archive'
import { MusicButton, PeekBanner, PreviewBanner } from './chrome'
import { ExperienceContext, useExperienceData } from './data'
import { Opening } from './Opening'

type Props = { preview: boolean; live: boolean; roni: boolean; onExitPeek?: () => void }

/** With `onExitPeek` this is the public sneak peek: no data is loaded, only placeholders. */
export function ExperienceApp({ preview, live, roni, onExitPeek }: Props) {
  const peek = Boolean(onExitPeek)
  const { data, urls, error } = useExperienceData({ peek, curator: preview })
  const [entered, setEntered] = useState(false)

  if (error)
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6 text-center">
        <p className="eyebrow">The Roni Archives</p>
        <p className="text-ivory/80" role="alert">
          {error}
        </p>
      </div>
    )
  if (!data)
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Opening the archive…" />
      </div>
    )

  return (
    <ExperienceContext value={{ data, urls, preview: preview || peek, peek, roni }}>
      {entered ? (
        <Archive />
      ) : (
        <Opening
          onEnter={() => {
            window.scrollTo(0, 0)
            setEntered(true)
          }}
        />
      )}
      <MusicButton />
      {onExitPeek ? <PeekBanner onExit={onExitPeek} /> : preview && <PreviewBanner live={live} />}
    </ExperienceContext>
  )
}
