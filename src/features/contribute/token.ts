const STORAGE_KEY = 'roni-archives.invitation'
const SHARED_KEY = 'roni-archives.shared'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export type LinkFromLocation = { kind: 'personal' | 'shared'; token: string } | 'invalid' | null

function store(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    /* storage may be unavailable (private mode); the token is still used for this visit */
  }
}

function read(key: string): string | null {
  try {
    const value = localStorage.getItem(key)
    return value && TOKEN_PATTERN.test(value) ? value : null
  } catch {
    return null
  }
}

/**
 * Personal links look like /contribute#t=<token>; the shared group link is /contribute#j=<token>.
 * The fragment is never sent to a server, so tokens stay out of hosting/CDN logs. Once read, the
 * token is removed from the address bar and kept on this device so the contributor can come back.
 */
export function takeTokenFromLocation(): LinkFromLocation {
  const hash = new URLSearchParams(window.location.hash.slice(1))
  const query = new URLSearchParams(window.location.search)
  const personal = hash.get('t') ?? query.get('t')
  const shared = hash.get('j') ?? query.get('j')
  if (personal !== null || shared !== null) {
    const url = new URL(window.location.href)
    url.hash = ''
    url.searchParams.delete('t')
    url.searchParams.delete('j')
    window.history.replaceState(window.history.state, '', url.pathname + url.search)
  }
  const candidate = personal ?? shared
  if (!candidate) return null
  if (!TOKEN_PATTERN.test(candidate)) return 'invalid'
  if (personal) {
    store(STORAGE_KEY, candidate)
    return { kind: 'personal', token: candidate }
  }
  store(SHARED_KEY, candidate)
  return { kind: 'shared', token: candidate }
}

export const readStoredToken = () => read(STORAGE_KEY)
export const readStoredSharedToken = () => read(SHARED_KEY)
export const storePersonalToken = (token: string) => store(STORAGE_KEY, token)

export function forgetSharedToken() {
  try {
    localStorage.removeItem(SHARED_KEY)
  } catch {
    /* ignore */
  }
}

/** Forgets this device's personal link and drafts. The shared link stays, so someone else can join. */
export function forgetToken() {
  try {
    localStorage.removeItem(STORAGE_KEY)
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('roni-archives.draft.') || key.startsWith('roni-archives.submit.')) localStorage.removeItem(key)
    }
  } catch {
    /* ignore */
  }
}

export const isValidTokenShape = (value: string) => TOKEN_PATTERN.test(value)
