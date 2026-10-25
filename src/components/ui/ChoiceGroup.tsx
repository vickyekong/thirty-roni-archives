import { useId, type ReactNode } from 'react'
import { cn } from '@/lib/cn'

export type Choice<T extends string> = { value: T; label: ReactNode; description?: ReactNode }

export function ChoiceGroup<T extends string>({
  legend,
  hint,
  name,
  value,
  choices,
  onChange,
  columns = 1,
}: {
  legend: ReactNode
  hint?: ReactNode
  name: string
  value: T | null
  choices: Choice<T>[]
  onChange: (value: T) => void
  columns?: 1 | 2
}) {
  const hintId = useId()
  return (
    <fieldset className="flex flex-col gap-3" aria-describedby={hint ? hintId : undefined}>
      <legend className="mb-2 font-serif text-xl leading-snug text-ivory sm:text-[1.35rem]">{legend}</legend>
      {hint && (
        <p id={hintId} className="-mt-2 mb-1 text-sm leading-relaxed text-grey">
          {hint}
        </p>
      )}
      <div className={cn('grid gap-3', columns === 2 && 'sm:grid-cols-2')}>
        {choices.map((choice) => {
          const checked = value === choice.value
          return (
            <label
              key={choice.value}
              className={cn(
                'relative flex cursor-pointer gap-3 rounded-xl border px-4 py-3.5 transition-colors duration-200',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold',
                checked ? 'border-gold bg-gold/[0.07]' : 'border-midnight-line hover:border-gold/40',
              )}
            >
              <input
                type="radio"
                name={name}
                value={choice.value}
                checked={checked}
                onChange={() => onChange(choice.value)}
                className="peer sr-only"
              />
              <span
                aria-hidden="true"
                className={cn(
                  'mt-1 grid size-4 shrink-0 place-items-center rounded-full border transition-colors',
                  checked ? 'border-gold' : 'border-grey/60',
                )}
              >
                <span className={cn('size-2 rounded-full bg-gold transition-transform', checked ? 'scale-100' : 'scale-0')} />
              </span>
              <span className="flex flex-col gap-0.5">
                <span className="text-[0.95rem] text-ivory">{choice.label}</span>
                {choice.description && <span className="text-sm leading-relaxed text-grey">{choice.description}</span>}
              </span>
            </label>
          )
        })}
      </div>
    </fieldset>
  )
}

export function Checkbox({
  checked,
  onChange,
  children,
  describedBy,
  invalid,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  children: ReactNode
  describedBy?: string
  invalid?: boolean
}) {
  return (
    <label
      className={cn(
        'flex cursor-pointer gap-3 rounded-xl border px-4 py-4 transition-colors',
        'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-gold',
        checked ? 'border-gold bg-gold/[0.07]' : invalid ? 'border-danger/60' : 'border-midnight-line hover:border-gold/40',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={describedBy}
        aria-invalid={invalid || undefined}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-5 shrink-0 place-items-center rounded-md border transition-colors',
          checked ? 'border-gold bg-gold text-midnight' : 'border-grey/60',
        )}
      >
        {checked && (
          <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3.5 8.5l3 3 6-7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        )}
      </span>
      <span className="text-[0.95rem] leading-relaxed text-ivory">{children}</span>
    </label>
  )
}
