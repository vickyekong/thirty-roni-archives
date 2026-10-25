import { cn } from '@/lib/cn'
import type { SaveStatus } from './useDraft'

const LABELS: Record<SaveStatus, string> = {
  saved: 'All changes saved',
  pending: 'Unsaved changes',
  saving: 'Saving…',
  offline: 'Offline. Saved on this device, retrying',
  error: 'Could not save. Retrying when you continue',
  conflict: 'Updated elsewhere',
}

export function SaveIndicator({ status, onRetry }: { status: SaveStatus; onRetry?: () => void }) {
  const tone =
    status === 'saved' ? 'bg-success' : status === 'saving' || status === 'pending' ? 'bg-gold' : 'bg-danger'
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-2 text-xs text-grey">
      <span aria-hidden="true" className={cn('size-1.5 rounded-full', tone, status === 'saving' && 'animate-pulse')} />
      <span>{LABELS[status]}</span>
      {(status === 'error' || status === 'offline') && onRetry && (
        <button type="button" onClick={onRetry} className="cursor-pointer text-gold underline underline-offset-2">
          Retry
        </button>
      )}
    </span>
  )
}
