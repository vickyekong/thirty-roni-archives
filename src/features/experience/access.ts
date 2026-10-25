import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'

export type ExperienceAccess = {
  signed_in: boolean
  is_admin: boolean
  is_roni: boolean
  is_family: boolean
  live: boolean
  family_enabled: boolean
  preview_enabled: boolean
  can_view: boolean
}

const NO_ACCESS: ExperienceAccess = {
  signed_in: false,
  is_admin: false,
  is_roni: false,
  is_family: false,
  live: false,
  family_enabled: false,
  preview_enabled: false,
  can_view: false,
}

/**
 * Asks the database whether this visitor may see the experience right now. It only decides
 * which screen to show: the content itself is still filtered by row-level security, so a
 * tampered answer here reveals nothing.
 */
export function useExperienceAccess() {
  const auth = useAuth()
  const userId = auth.user?.id ?? null
  const [access, setAccess] = useState<ExperienceAccess | null>(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    if (auth.status === 'loading') return
    let active = true
    void supabase.rpc('experience_access').then(({ data, error }) => {
      if (!active) return
      setAccess(error || !data ? NO_ACCESS : { ...NO_ACCESS, ...(data as Partial<ExperienceAccess>) })
    })
    return () => {
      active = false
    }
  }, [auth.status, userId, version])

  const refresh = useCallback(() => setVersion((v) => v + 1), [])
  return { access, refresh }
}

/** The curator sees the experience before launch only while preview is switched on. */
export const showsExperience = (a: ExperienceAccess) => a.can_view && (a.live || (a.is_admin && a.preview_enabled))
