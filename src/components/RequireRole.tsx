import type { ReactNode } from 'react'
import { Link, Navigate, useLocation } from 'react-router'
import { Spinner } from '@/components/ui/Spinner'
import { useAuth, type AppRole } from '@/lib/auth'

/**
 * Routing convenience only. It decides what screen to show; it is not a security boundary.
 * Every query behind these screens is independently checked by row-level security.
 */
export function RequireRole({ roles, children }: { roles: AppRole[]; children: ReactNode }) {
  const auth = useAuth()
  const location = useLocation()

  if (auth.status === 'loading')
    return (
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Checking your access…" />
      </div>
    )
  if (auth.status === 'signed-out')
    return <Navigate to={`/sign-in?next=${encodeURIComponent(location.pathname)}`} replace />
  if (!auth.hasRole(...roles))
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
        <p className="eyebrow">Private</p>
        <h1 className="display text-4xl">This area isn’t available to your account</h1>
        <p className="text-grey">If you think this is a mistake, please contact the curator.</p>
        <div className="flex gap-4 text-sm">
          <button type="button" className="cursor-pointer text-gold underline underline-offset-4" onClick={() => void auth.signOut()}>
            Sign out
          </button>
          <Link to="/" className="text-grey underline underline-offset-4">
            Home
          </Link>
        </div>
      </div>
    )
  return <>{children}</>
}
