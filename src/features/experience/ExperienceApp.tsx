import { useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { Archive } from './Archive'
import { MusicButton, PreviewBanner } from './chrome'
import { ExperienceContext, useExperienceData } from './data'
import { Opening } from './Opening'

export function ExperienceApp({ preview, live, roni }: { preview: boolean; live: boolean; roni: boolean }) {
  const { data, urls, error } = useExperienceData()
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
    <ExperienceContext value={{ data, urls, preview, roni }}>
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
      {preview && <PreviewBanner live={live} />}
    </ExperienceContext>
  )
}
