import { lazy, Suspense, useState } from 'react'
import { Spinner } from '@/components/ui/Spinner'
import { GatePage } from '@/features/gate/GatePage'
import { showsExperience, useExperienceAccess } from './access'

const ExperienceApp = lazy(() => import('./ExperienceApp').then((m) => ({ default: m.ExperienceApp })))

const loading = (
  <div className="grid min-h-dvh place-items-center">
    <Spinner label="Opening the archive…" />
  </div>
)

export function HomePage() {
  const { access, refresh } = useExperienceAccess()
  const [peeking, setPeeking] = useState(false)
  if (!access) return loading
  if (!showsExperience(access)) {
    if (!peeking) return <GatePage access={access} onLaunch={refresh} onExplore={() => setPeeking(true)} />
    return (
      <Suspense fallback={loading}>
        <ExperienceApp
          preview={false}
          live={false}
          roni={false}
          onExitPeek={() => {
            window.scrollTo(0, 0)
            setPeeking(false)
          }}
        />
      </Suspense>
    )
  }
  return (
    <Suspense fallback={loading}>
      <ExperienceApp preview={access.is_admin} live={access.live} roni={access.is_roni} />
    </Suspense>
  )
}
