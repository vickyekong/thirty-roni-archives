import { lazy, Suspense } from 'react'
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
  if (!access) return loading
  if (!showsExperience(access)) return <GatePage access={access} onLaunch={refresh} />
  return (
    <Suspense fallback={loading}>
      <ExperienceApp preview={access.is_admin} live={access.live} roni={access.is_roni} />
    </Suspense>
  )
}
