import type { Session, User } from '@supabase/supabase-js'
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { supabase } from './supabase'

export type AppRole = 'admin' | 'roni' | 'family_viewer'

type AuthState =
  | { status: 'loading'; session: null; user: null; roles: AppRole[] }
  | { status: 'signed-out'; session: null; user: null; roles: AppRole[] }
  | { status: 'signed-in'; session: Session; user: User; roles: AppRole[] }

type AuthContextValue = AuthState & {
  hasRole: (...roles: AppRole[]) => boolean
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

async function fetchRoles(userId: string): Promise<AppRole[]> {
  // RLS only returns the signed-in user's own roles. This is for routing; data access is
  // enforced separately by row-level security on every table.
  const { data, error } = await supabase.from('user_roles').select('role').eq('user_id', userId)
  if (error) return []
  return (data ?? []).map((row) => row.role as AppRole)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({ status: 'loading', session: null, user: null, roles: [] })

  useEffect(() => {
    let active = true
    const apply = async (session: Session | null) => {
      if (!session) {
        if (active) setState({ status: 'signed-out', session: null, user: null, roles: [] })
        return
      }
      const roles = await fetchRoles(session.user.id)
      if (active) setState({ status: 'signed-in', session, user: session.user, roles })
    }

    void supabase.auth.getSession().then(({ data }) => apply(data.session))
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') return
      // Defer: calling Supabase inside this callback can deadlock the auth lock.
      setTimeout(() => void apply(session), 0)
    })
    return () => {
      active = false
      data.subscription.unsubscribe()
    }
  }, [])

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) return null
    return error.message.toLowerCase().includes('invalid')
      ? 'That email and password combination is not recognised.'
      : 'We could not sign you in right now. Please try again.'
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
  }, [])

  const value = useMemo<AuthContextValue>(
    () => ({
      ...state,
      hasRole: (...roles) => roles.some((r) => state.roles.includes(r)),
      signIn,
      signOut,
    }),
    [state, signIn, signOut],
  )

  return <AuthContext value={value}>{children}</AuthContext>
}

export function useAuth() {
  const value = use(AuthContext)
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>')
  return value
}
