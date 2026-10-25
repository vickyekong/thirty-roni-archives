import { useCallback, useEffect, useRef, useState } from 'react'
import { payloadSchema, type ContributionPayload } from '@shared/contribution'
import { ApiError, callContribute, type Draft } from './api'

export type SaveStatus = 'saved' | 'pending' | 'saving' | 'offline' | 'error' | 'conflict'

const AUTOSAVE_DELAY = 2000
const OFFLINE_RETRY = 6000
const backupKey = (contributionId: string) => `roni-archives.draft.${contributionId}`

type Backup = { version: number; step: number; payload: unknown }

function readBackup(contributionId: string, draft: Draft): { payload: ContributionPayload; step: number } | null {
  try {
    const raw = localStorage.getItem(backupKey(contributionId))
    if (!raw) return null
    const backup = JSON.parse(raw) as Backup
    if (backup.version !== draft.version) return null
    const parsed = payloadSchema.safeParse(backup.payload)
    if (!parsed.success) return null
    if (JSON.stringify(parsed.data) === JSON.stringify(draft.payload)) return null
    return { payload: parsed.data, step: backup.step }
  } catch {
    return null
  }
}

export function clearDraftBackup(contributionId: string) {
  try {
    localStorage.removeItem(backupKey(contributionId))
  } catch {
    /* ignore */
  }
}

/**
 * Holds the contributor's working copy and keeps it saved:
 * - debounced autosave, one request in flight at a time
 * - optimistic concurrency via `version` (a 409 surfaces as a conflict to resolve)
 * - a local backup so nothing typed offline or before a crash is lost
 */
export function useDraft({ token, contributionId, initial }: { token: string; contributionId: string; initial: Draft }) {
  const [restored] = useState(() => readBackup(contributionId, initial))
  const [payload, setPayload] = useState<ContributionPayload>(restored?.payload ?? initial.payload)
  const [step, setStepState] = useState(restored?.step ?? initial.step)
  const [status, setStatus] = useState<SaveStatus>(restored ? 'pending' : 'saved')
  const [savedAt, setSavedAt] = useState<string | null>(initial.updatedAt)
  const [conflict, setConflict] = useState<Draft | null>(null)

  const current = useRef({ payload, step })
  const version = useRef(initial.version)
  const dirty = useRef(Boolean(restored))
  const inFlight = useRef<Promise<boolean> | null>(null)
  const timer = useRef<number | undefined>(undefined)
  const conflictRef = useRef<Draft | null>(null)

  const writeBackup = useCallback(() => {
    try {
      const backup: Backup = { version: version.current, step: current.current.step, payload: current.current.payload }
      localStorage.setItem(backupKey(contributionId), JSON.stringify(backup))
    } catch {
      /* storage full or unavailable */
    }
  }, [contributionId])

  const saveOnce = useCallback(async (): Promise<boolean> => {
    if (!dirty.current) return true
    if (conflictRef.current) return false
    const snapshot = current.current
    dirty.current = false
    setStatus('saving')
    try {
      const result = await callContribute('save', token, {
        contributionId,
        payload: snapshot.payload,
        step: snapshot.step,
        version: version.current,
      })
      version.current = result.version
      setSavedAt(result.updatedAt)
      writeBackup()
      setStatus(dirty.current ? 'pending' : 'saved')
      return true
    } catch (error) {
      dirty.current = true
      if (error instanceof ApiError && error.code === 'version_conflict') {
        conflictRef.current = error.latestDraft
        setConflict(error.latestDraft)
        setStatus('conflict')
      } else if (error instanceof ApiError && error.isNetwork) {
        setStatus('offline')
        window.clearTimeout(timer.current)
        timer.current = window.setTimeout(() => void flushRef.current(), OFFLINE_RETRY)
      } else {
        setStatus('error')
      }
      return false
    }
  }, [contributionId, token, writeBackup])

  /** Waits for any in-flight save, then saves the latest changes. Resolves `true` when everything is stored. */
  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current)
    for (;;) {
      while (inFlight.current) await inFlight.current
      if (!dirty.current) return !conflictRef.current
      // No await between the check above and claiming the slot, so concurrent callers never overlap.
      const run = saveOnce().finally(() => {
        inFlight.current = null
      })
      inFlight.current = run
      if (!(await run)) return false
    }
  }, [saveOnce])

  const flushRef = useRef(flush)
  useEffect(() => {
    flushRef.current = flush
  }, [flush])

  const markDirty = useCallback(
    (immediate = false) => {
      dirty.current = true
      if (!conflictRef.current) setStatus((s) => (s === 'saving' ? s : 'pending'))
      window.clearTimeout(timer.current)
      timer.current = window.setTimeout(() => void flushRef.current(), immediate ? 0 : AUTOSAVE_DELAY)
      writeBackup()
    },
    [writeBackup],
  )

  const update = useCallback(
    (updater: (draft: ContributionPayload) => ContributionPayload) => {
      const next = updater(current.current.payload)
      current.current = { ...current.current, payload: next }
      setPayload(next)
      markDirty()
    },
    [markDirty],
  )

  const setSection = useCallback(
    <S extends keyof ContributionPayload>(section: S, patch: Partial<ContributionPayload[S]>) =>
      update((draft) => ({ ...draft, [section]: { ...draft[section], ...patch } }) as ContributionPayload),
    [update],
  )

  const setStep = useCallback(
    (next: number) => {
      setStepState(next)
      current.current = { ...current.current, step: next }
      markDirty(true)
    },
    [markDirty],
  )

  const resolveConflict = useCallback(
    (choice: 'theirs' | 'mine') => {
      const latest = conflictRef.current
      if (!latest) return
      conflictRef.current = null
      setConflict(null)
      version.current = latest.version
      if (choice === 'theirs') {
        current.current = { payload: latest.payload, step: latest.step }
        setPayload(latest.payload)
        setStepState(latest.step)
        dirty.current = false
        setSavedAt(latest.updatedAt)
        writeBackup()
        setStatus('saved')
      } else {
        markDirty(true)
      }
    },
    [markDirty, writeBackup],
  )

  useEffect(() => {
    if (restored) void flushRef.current()
  }, [restored])

  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') void flushRef.current()
    }
    const onOnline = () => {
      if (dirty.current) void flushRef.current()
    }
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        void flushRef.current()
        event.preventDefault()
      }
    }
    document.addEventListener('visibilitychange', onHide)
    window.addEventListener('online', onOnline)
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('beforeunload', onBeforeUnload)
      window.clearTimeout(timer.current)
    }
  }, [])

  return {
    payload,
    update,
    setSection,
    step,
    setStep,
    status,
    savedAt,
    flush,
    conflict,
    hasConflict: useCallback(() => conflictRef.current !== null, []),
    resolveConflict,
    restoredFromDevice: Boolean(restored),
  }
}
