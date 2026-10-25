import { useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react'
import { cn } from '@/lib/cn'

type FieldShellProps = {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  className?: string
  counter?: ReactNode
  children: (ids: { inputId: string; describedBy: string | undefined }) => ReactNode
}

export function FieldShell({ label, hint, error, optional, className, counter, children }: FieldShellProps) {
  const inputId = useId()
  const hintId = `${inputId}-hint`
  const errorId = `${inputId}-error`
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(' ') || undefined
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <label htmlFor={inputId} className="font-serif text-xl leading-snug text-ivory sm:text-[1.35rem]">
        {label}
        {optional && <span className="ml-2 align-middle font-sans text-xs tracking-wide text-grey">optional</span>}
      </label>
      {hint && (
        <p id={hintId} className="-mt-1 text-sm leading-relaxed text-grey">
          {hint}
        </p>
      )}
      {children({ inputId, describedBy })}
      <div className="flex min-h-5 items-start justify-between gap-4 text-xs">
        <span id={errorId} className="text-danger" role={error ? 'alert' : undefined}>
          {error}
        </span>
        {counter}
      </div>
    </div>
  )
}

function Counter({ length, max }: { length: number; max: number }) {
  const near = length > max * 0.9
  if (length < max * 0.6) return null
  return (
    <span className={cn('tabular-nums', near ? 'text-gold' : 'text-grey')} aria-live="polite">
      {length.toLocaleString()} / {max.toLocaleString()}
    </span>
  )
}

type TextAreaFieldProps = Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  value: string
  maxLength: number
  onValueChange: (value: string) => void
}

export function TextAreaField({ label, hint, error, optional, value, maxLength, onValueChange, className, rows = 4, ...rest }: TextAreaFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={className} counter={<Counter length={value.length} max={maxLength} />}>
      {({ inputId, describedBy }) => (
        <textarea
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className="field-input field-sizing-content min-h-28 resize-y"
          value={value}
          maxLength={maxLength}
          rows={rows}
          onChange={(event) => onValueChange(event.target.value)}
          {...rest}
        />
      )}
    </FieldShell>
  )
}

type TextFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label: ReactNode
  hint?: ReactNode
  error?: string | null
  optional?: boolean
  value: string
  onValueChange: (value: string) => void
}

export function TextField({ label, hint, error, optional, value, onValueChange, className, ...rest }: TextFieldProps) {
  return (
    <FieldShell label={label} hint={hint} error={error} optional={optional} className={className}>
      {({ inputId, describedBy }) => (
        <input
          id={inputId}
          aria-describedby={describedBy}
          aria-invalid={error ? true : undefined}
          className="field-input"
          value={value}
          onChange={(event) => onValueChange(event.target.value)}
          {...rest}
        />
      )}
    </FieldShell>
  )
}
