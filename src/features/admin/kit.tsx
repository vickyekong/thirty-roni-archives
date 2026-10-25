import {
  useCallback,
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'
import { useSearchParams } from 'react-router'
import { Notice } from '@/components/ui/Notice'
import { cn } from '@/lib/cn'
import { supabase } from '@/lib/supabase'

/**
 * Editing state that starts on the item named in `?edit=` (the curator preview's Edit links)
 * and scrolls to its editor once the list has loaded. Give that editor `id="edit-<id>"`.
 */
export function useEditParam(loaded: boolean) {
  const [params] = useSearchParams()
  const [initial] = useState(() => params.get('edit'))
  const [editing, setEditing] = useState<string | 'new' | null>(initial)
  useEffect(() => {
    if (loaded && initial) document.getElementById(`edit-${initial}`)?.scrollIntoView({ block: 'start' })
  }, [loaded, initial])
  return [editing, setEditing] as const
}

// Compact curator form controls. The contributor studio uses large serif labels;
// the dashboard is a working tool and favours density.

function Label({ htmlFor, children, hint }: { htmlFor: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <span className="flex flex-col gap-0.5">
      <label htmlFor={htmlFor} className="text-sm text-ivory">
        {children}
      </label>
      {hint && <span className="text-xs leading-relaxed text-grey">{hint}</span>}
    </span>
  )
}

export function Input({
  label,
  hint,
  value,
  onValue,
  className,
  ...rest
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> & {
  label: ReactNode
  hint?: ReactNode
  value: string
  onValue: (value: string) => void
}) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <input id={id} className="field-input py-2.5" value={value} onChange={(e) => onValue(e.target.value)} {...rest} />
    </div>
  )
}

export function Area({
  label,
  hint,
  value,
  onValue,
  className,
  rows = 4,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  label: ReactNode
  hint?: ReactNode
  value: string
  onValue: (value: string) => void
}) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <textarea
        id={id}
        rows={rows}
        className="field-input field-sizing-content min-h-24 resize-y py-2.5"
        value={value}
        onChange={(e) => onValue(e.target.value)}
        {...rest}
      />
    </div>
  )
}

export function Select<T extends string>({
  label,
  hint,
  value,
  onValue,
  options,
  className,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & {
  label: ReactNode
  hint?: ReactNode
  value: T
  onValue: (value: T) => void
  options: { value: T; label: string }[]
}) {
  const id = useId()
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
      <select id={id} className="field-input py-2.5" value={value} onChange={(e) => onValue(e.target.value as T)} {...rest}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function Check({
  label,
  hint,
  checked,
  onChecked,
  disabled,
}: {
  label: ReactNode
  hint?: ReactNode
  checked: boolean
  onChecked: (value: boolean) => void
  disabled?: boolean
}) {
  const id = useId()
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        className="mt-1 size-4 shrink-0 cursor-pointer accent-[var(--color-gold)] disabled:cursor-not-allowed"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChecked(e.target.checked)}
      />
      <Label htmlFor={id} hint={hint}>
        {label}
      </Label>
    </div>
  )
}

export function Pill({ tone = 'grey', children }: { tone?: 'grey' | 'gold' | 'success' | 'danger'; children: ReactNode }) {
  const tones = {
    grey: 'border-grey/40 text-grey',
    gold: 'border-gold/50 text-gold-bright',
    success: 'border-success/50 text-success',
    danger: 'border-danger/50 text-danger',
  }
  return <span className={cn('rounded-full border px-2 py-0.5 text-xs whitespace-nowrap', tones[tone])}>{children}</span>
}

export function PublishedPill({ published }: { published: boolean }) {
  return <Pill tone={published ? 'success' : 'grey'}>{published ? 'Published' : 'Draft'}</Pill>
}

export function Panel({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('rounded-2xl border border-midnight-line p-5 sm:p-6', className)}>{children}</div>
}

export const CHAPTER_OPTIONS = [
  { value: 'beginning', label: 'The Beginning (1996–2005)' },
  { value: 'becoming', label: 'The Becoming (2006–2015)' },
  { value: 'finding_her_way', label: 'Finding Her Way (2016–2025)' },
  { value: 'thirty', label: 'Thirty (2026)' },
] as const
export type ChapterKey = (typeof CHAPTER_OPTIONS)[number]['value']

export const chapterForYear = (year: number): ChapterKey =>
  year <= 2005 ? 'beginning' : year <= 2015 ? 'becoming' : year <= 2025 ? 'finding_her_way' : 'thirty'

export const AUDIENCE_OPTIONS = [
  { value: 'everyone', label: 'Roni and family' },
  { value: 'roni_only', label: 'Roni only' },
] as const
export type Audience = (typeof AUDIENCE_OPTIONS)[number]['value']

export type OriginalCollection = { id: string; is_locked: boolean; snapshot_at: string | null }

/** The single "Original Thirty" collection all birthday content belongs to. */
export function useOriginalCollection() {
  const [collection, setCollection] = useState<OriginalCollection | null>(null)
  const reload = useCallback(async () => {
    const { data } = await supabase
      .from('archive_collections')
      .select('id, is_locked, snapshot_at')
      .eq('kind', 'original_thirty')
      .single()
    if (data) setCollection(data as OriginalCollection)
  }, [])
  useEffect(() => {
    void reload()
  }, [reload])
  return { collection, reload }
}

export function LockedNotice({ collection }: { collection: OriginalCollection | null }) {
  if (!collection?.is_locked) return null
  return (
    <Notice className="mb-8" title="The Original Thirty is locked">
      It was preserved as a snapshot, so edits are refused by the database. Unlock it from the Overview page if a correction is
      genuinely needed.
    </Notice>
  )
}

/** Publishes media rows referenced by a newly published item, so viewers can actually load them. */
export async function publishMedia(ids: (string | null | undefined)[]) {
  const list = ids.filter((id): id is string => Boolean(id))
  if (!list.length) return
  await supabase.from('media_assets').update({ is_published: true }).in('id', list)
}

export type SampleKind = 'memory' | 'wish' | 'letter' | 'person' | 'milestone' | 'editorial'

const MAKE_REAL_HINT: Record<SampleKind, string> = {
  memory: 'It becomes a memory you added as a curator, no longer linked to the sample person, so set the attribution to who it is really from.',
  wish: 'It becomes a wish you added as a curator, no longer linked to the sample person, so set the name to who it is really from.',
  letter: 'It becomes a letter you added as a curator, no longer linked to the sample person, so set who it is from.',
  person: 'A real person record is created under the name above. You can invite them from Contributors later.',
  milestone: 'Your edits are kept when the samples are removed.',
  editorial: 'Your edits are kept when the samples are removed.',
}

/** Shown in the editor of a sample item. When ticked, saving also turns the item into real content. */
export function MakeRealCheck({ kind, checked, onChecked }: { kind: SampleKind; checked: boolean; onChecked: (value: boolean) => void }) {
  return (
    <div className="mt-6 rounded-xl border border-dashed border-gold/40 p-4">
      <p className="mb-3 flex flex-wrap items-center gap-2 text-sm text-grey">
        <Pill tone="gold">Sample</Pill>
        Only curators see this, and it is deleted with the other samples.
      </p>
      <Check
        label="Make this real content when I save"
        hint={`${MAKE_REAL_HINT[kind]} Roni sees it once it is published. Replace the placeholder wording and remove any sample photos first.`}
        checked={checked}
        onChecked={onChecked}
      />
    </div>
  )
}

/** Returns an error message, or null when the item is now real content. */
export async function makeReal(kind: SampleKind, id: string): Promise<string | null> {
  const { error } = await supabase.rpc('admin_make_real', { p_kind: kind, p_id: id })
  return error ? `Your changes were saved, but it is still a sample: ${error.message}.` : null
}

export function moveItem<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta
  if (target < 0 || target >= list.length) return list
  const next = [...list]
  const [item] = next.splice(index, 1)
  next.splice(target, 0, item as T)
  return next
}
