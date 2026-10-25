import { useId, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { ApiError, callContribute } from './api'

export function RemovalRequest({ token, contributionId }: { token: string; contributionId?: string }) {
  const [open, setOpen] = useState(false)
  const [details, setDetails] = useState('')
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')
  const [error, setError] = useState<string | null>(null)
  const fieldId = useId()

  const send = async () => {
    if (!details.trim()) {
      setError('Please tell the curator what you would like changed or removed.')
      return
    }
    setState('sending')
    setError(null)
    try {
      await callContribute('removal-request', token, { details: details.trim(), contributionId })
      setState('sent')
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'We could not send your request. Please try again.')
      setState('idle')
    }
  }

  if (state === 'sent')
    return (
      <Notice tone="success" live>
        Your request has been sent to the curator privately. They will take care of it.
      </Notice>
    )

  return (
    <div className="flex flex-col gap-3">
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className="-my-2 min-h-11 cursor-pointer self-start text-sm text-grey underline underline-offset-4 hover:text-ivory">
          Need something changed or removed?
        </button>
      ) : (
        <div className="flex flex-col gap-3 rounded-xl border border-midnight-line p-4">
          <label htmlFor={fieldId} className="text-sm text-ivory">
            What would you like changed or removed? Only the curator will see this.
          </label>
          <textarea
            id={fieldId}
            className="field-input min-h-24"
            value={details}
            maxLength={4000}
            onChange={(e) => setDetails(e.target.value)}
            aria-invalid={error ? true : undefined}
          />
          {error && (
            <p role="alert" className="text-sm text-danger">
              {error}
            </p>
          )}
          <div className="flex gap-3">
            <Button size="sm" onClick={() => void send()} loading={state === 'sending'}>
              Send request
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
