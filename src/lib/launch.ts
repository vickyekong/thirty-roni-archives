import { useEffect, useState } from 'react'
import { supabase } from './supabase'

export const LAUNCH_TIMEZONE = 'Africa/Lagos'

export type SiteSettings = {
  launch_at: string
  timezone: string
  experience_active: boolean
  contributions_open: boolean
  family_access_enabled: boolean
  preview_enabled: boolean
}

/** Launch configuration is public (it drives the countdown); it never contains archive content. */
export function useSiteSettings() {
  const [settings, setSettings] = useState<SiteSettings | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void supabase
      .from('site_settings')
      .select('launch_at, timezone, experience_active, contributions_open, family_access_enabled, preview_enabled')
      .eq('id', 1)
      .single()
      .then(({ data, error: e }) => {
        if (!active) return
        if (e || !data) setError('Could not load the launch schedule.')
        else setSettings(data as SiteSettings)
      })
    return () => {
      active = false
    }
  }, [])

  return { settings, error, setSettings }
}

export function formatInLagos(iso: string, options: Intl.DateTimeFormatOptions = { dateStyle: 'long', timeStyle: 'short' }) {
  return new Intl.DateTimeFormat('en-GB', { timeZone: LAUNCH_TIMEZONE, ...options }).format(new Date(iso))
}

// Africa/Lagos is fixed at UTC+1 with no daylight saving, so conversion is a constant offset.
const LAGOS_OFFSET_MS = 60 * 60 * 1000

/** ISO instant -> "YYYY-MM-DDTHH:mm" wall-clock time in Lagos, for datetime-local inputs. */
export function isoToLagosInput(iso: string) {
  return new Date(new Date(iso).getTime() + LAGOS_OFFSET_MS).toISOString().slice(0, 16)
}

/** "YYYY-MM-DDTHH:mm" entered as Lagos wall-clock time -> ISO instant. */
export function lagosInputToIso(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null
  const t = Date.parse(`${value}:00+01:00`)
  return Number.isNaN(t) ? null : new Date(t).toISOString()
}

export type Countdown = { days: number; hours: number; minutes: number; seconds: number; done: boolean }

export function countdownTo(target: number, now = Date.now()): Countdown {
  const diff = Math.max(0, target - now)
  return {
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff / 3_600_000) % 24),
    minutes: Math.floor((diff / 60_000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    done: diff === 0,
  }
}

export function useCountdown(targetIso: string | null) {
  const target = targetIso ? new Date(targetIso).getTime() : null
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (target === null) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [target])
  return target === null ? null : countdownTo(target, now)
}
