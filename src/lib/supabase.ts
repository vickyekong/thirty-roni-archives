import { createClient } from '@supabase/supabase-js'
import { env } from './env'

/** Browser client. Uses the publishable key only; every table is protected by RLS. */
export const supabase = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
  },
})

export const CONTRIBUTE_ENDPOINT = `${env.VITE_SUPABASE_URL}/functions/v1/contribute`
export const ADMIN_ACCOUNTS_ENDPOINT = `${env.VITE_SUPABASE_URL}/functions/v1/admin-accounts`
