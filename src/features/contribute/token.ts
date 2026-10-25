const STORAGE_KEY = 'roni-archives.invitation'
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

/**
 * Invitation links look like /contribute#t=<token>. The fragment is never sent to a server,
 * so the token stays out of hosting/CDN logs. Once read, it is removed from the address bar
 * and kept on this device so the contributor can come back to an unfinished draft.
 */
export function takeTokenFromLocation(): string | null {
  const fromHash = new URLSearchParams(window.location.hash.slice(1)).get('t')
  const fromQuery = new URLSearchParams(window.location.search).get('t')
  const candidate = fromHash ?? fromQuery
  if (fromHash !== null || fromQuery !== null) {
    const url = new URL(window.location.href)
    url.hash = ''
    url.searchParams.delete('t')
    window.history.replaceState(window.history.state, '', url.pathname + url.search)
  }
  if (candidate && TOKEN_PATTERN.test(candidate)) {
    try {
      localStorage.setItem(STORAGE_KEY, candidate)
    } catch {
      /* storage may be unavailable (private mode); the token is still used for this visit */
    }
    return candidate
  }
  return candidate ? 'invalid' : null
}

export function readStoredToken(): string | null {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    return value && TOKEN_PATTERN.test(value) ? value : null
  } catch {
    return null
  }
}

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
