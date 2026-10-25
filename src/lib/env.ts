const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined

function validate(): string | null {
  if (!url || !/^https:\/\/[^\s/]+$/.test(url) || !key || key.length < 20)
    return 'The site is missing its Supabase configuration (VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).'
  if (key.startsWith('sb_secret_') || key.includes('service_role'))
    return 'A secret Supabase key was configured for the browser. Use the publishable key instead.'
  return null
}

export const envError = validate()

export const env = envError
  ? { VITE_SUPABASE_URL: 'https://invalid.localhost', VITE_SUPABASE_PUBLISHABLE_KEY: 'missing' }
  : { VITE_SUPABASE_URL: url!, VITE_SUPABASE_PUBLISHABLE_KEY: key! }
