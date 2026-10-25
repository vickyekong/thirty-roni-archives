import { motion, useReducedMotion } from 'motion/react'
import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Link } from 'react-router'
import { cn } from '@/lib/cn'
import { useExperience, type ResolvedMedia, type Source } from './data'

export function SectionHeader({
  eyebrow,
  title,
  intro,
  id,
  align = 'center',
  tone = 'dark',
}: {
  eyebrow: string
  title: ReactNode
  intro?: ReactNode
  id: string
  align?: 'center' | 'left'
  tone?: 'dark' | 'paper'
}) {
  const reduce = useReducedMotion()
  return (
    <motion.header
      initial={{ opacity: 0, y: reduce ? 0 : 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: '-15% 0px' }}
      transition={{ duration: reduce ? 0 : 1.1, ease: [0.22, 1, 0.36, 1] }}
      className={cn('mb-14 flex flex-col gap-5', align === 'center' ? 'items-center text-center' : 'items-start')}
    >
      <p className={cn('eyebrow', tone === 'paper' && 'text-burgundy')}>{eyebrow}</p>
      <h2 id={id} tabIndex={-1} className={cn('display text-5xl outline-none sm:text-7xl', tone === 'paper' ? 'text-midnight' : 'text-ivory')}>
        {title}
      </h2>
      {intro && <p className={cn('max-w-xl leading-relaxed', tone === 'paper' ? 'text-midnight/70' : 'text-ivory/70')}>{intro}</p>}
    </motion.header>
  )
}

const tagLink = 'underline underline-offset-4 hover:text-gold-bright'

/**
 * Curator preview only: where an item came from, with links to edit it. Links open in a new
 * tab so the preview stays where it is.
 */
export function SourceTag({
  source,
  edit,
  sample,
  label,
  tone = 'dark',
  className,
}: {
  source?: Source
  edit: string
  /** For items without a source row (editorial copy). */
  sample?: boolean
  /** Overrides the "From …" text. */
  label?: string
  tone?: 'dark' | 'paper'
  className?: string
}) {
  const { preview, peek } = useExperience()
  if (!preview || peek) return null
  const isSample = sample ?? source?.sample ?? false
  const from =
    label ??
    (source?.contributor
      ? `From ${source.contributor}${source.relationship ? ` · ${source.relationship}` : ''}`
      : source?.contributionId
        ? 'From a contributor'
        : 'Added by a curator')
  return (
    <p
      className={cn(
        'flex flex-wrap items-center gap-x-3 gap-y-1 rounded-lg border border-dashed px-3 py-2 font-sans text-xs leading-relaxed not-italic',
        tone === 'paper' ? 'border-midnight/30 text-midnight/75' : 'border-gold/35 text-ivory/70',
        className,
      )}
    >
      {isSample && (
        <span
          className={cn(
            'rounded-full px-2 py-0.5 font-medium tracking-[0.15em] uppercase',
            tone === 'paper' ? 'bg-burgundy/15 text-burgundy' : 'bg-gold/20 text-gold-bright',
          )}
        >
          Sample
        </span>
      )}
      <span>{from}</span>
      {source?.contributionId && (
        <Link to={`/admin/submissions?id=${source.contributionId}`} target="_blank" className={tagLink}>
          View submission
        </Link>
      )}
      <Link to={edit} target="_blank" className={tagLink}>
        Edit
      </Link>
    </p>
  )
}

/** Shown only in the curator's preview, never to Roni or family. */
export function PreviewEmpty({
  children,
  to,
  note = 'Roni won’t see this section until it has published content.',
}: {
  children: ReactNode
  to: string
  note?: string
}) {
  const { preview, peek } = useExperience()
  if (!preview) return null
  if (peek)
    return (
      <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-grey/50 px-6 py-8 text-center">
        <p className="text-[0.625rem] tracking-[0.3em] text-grey uppercase">Sneak peek · placeholder</p>
        <p className="mt-3 text-sm leading-relaxed text-ivory/80">Real memories from family and friends will appear here on her birthday.</p>
      </div>
    )
  return (
    <div className="mx-auto max-w-xl rounded-2xl border border-dashed border-grey/50 px-6 py-8 text-center">
      <p className="text-[0.625rem] tracking-[0.3em] text-grey uppercase">Sample placeholder · curators only</p>
      <p className="mt-3 text-sm leading-relaxed text-ivory/80">{children}</p>
      <p className="mt-2 text-xs text-grey">{note}</p>
      <Link to={to} className="mt-4 inline-block text-sm text-gold underline underline-offset-4">
        Open in the dashboard
      </Link>
    </div>
  )
}

export function Photo({ media, className, eager }: { media: ResolvedMedia; className?: string; eager?: boolean }) {
  if (media.kind !== 'image') return null
  return (
    <img
      src={media.url}
      alt={media.alt_text ?? ''}
      width={media.width ?? undefined}
      height={media.height ?? undefined}
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className={cn('block h-auto w-full object-cover', className)}
    />
  )
}

function Transcript({ text, label = 'Read the transcript' }: { text: string | null; label?: string }) {
  if (!text?.trim()) return null
  return (
    <details className="mt-2 text-sm">
      <summary className="cursor-pointer text-gold underline-offset-4 hover:underline">{label}</summary>
      <p className="mt-2 leading-relaxed whitespace-pre-line opacity-80">{text}</p>
    </details>
  )
}

/** Audio and video never autoplay; both carry a transcript or caption alternative. */
export function MediaPlayer({ media, label }: { media: ResolvedMedia; label: string }) {
  if (media.kind === 'audio')
    return (
      <div>
        <audio controls preload="none" src={media.url} aria-label={label} className="w-full" />
        <Transcript text={media.transcript ?? media.caption} />
      </div>
    )
  if (media.kind === 'video')
    return (
      <div>
        <video controls preload="metadata" playsInline src={media.url} aria-label={label} className="w-full rounded-xl bg-black" />
        <Transcript text={media.transcript ?? media.caption} label="Read what is said" />
      </div>
    )
  return null
}

export function monogram(name: string | null | undefined, fallback: string) {
  return name?.match(/\p{L}/u)?.[0].toUpperCase() ?? fallback
}

/**
 * Native modal dialog: the browser traps focus and Escape closes it; focus returns to the
 * element that opened it. `canClose` lets a form refuse to close over unsaved work.
 */
export function Dialog({
  open,
  onClose,
  title,
  children,
  tone = 'dark',
  canClose,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  tone?: 'dark' | 'paper'
  canClose?: () => boolean
}) {
  const requestClose = () => {
    if (!canClose || canClose()) onClose()
  }
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (!open) return
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    if (!d.open) d.showModal()
    document.documentElement.style.overflow = 'hidden'
    return () => {
      if (d.open) d.close()
      document.documentElement.style.overflow = ''
      opener?.focus({ preventScroll: true })
    }
  }, [open])
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault()
        requestClose()
      }}
      onClose={() => {
        // The close event is queued, so it can land after a remount has already reopened the dialog.
        if (!ref.current?.open) onClose()
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) requestClose()
      }}
      className={cn(
        'm-auto max-h-[90dvh] w-[min(92vw,44rem)] overflow-y-auto overscroll-contain rounded-3xl p-0 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm',
        tone === 'paper' ? 'rounded-md bg-[#f3ecdf] text-midnight' : 'border border-midnight-line bg-midnight-raised text-ivory',
      )}
    >
      {open && (
        <div className="relative p-6 sm:p-10">
          <button
            type="button"
            onClick={requestClose}
            className="absolute top-4 right-4 min-h-11 cursor-pointer rounded-full px-4 text-xs tracking-[0.2em] uppercase opacity-70 hover:opacity-100"
          >
            Close
          </button>
          <h3 id={titleId} className="display pr-16 text-3xl sm:text-4xl">
            {title}
          </h3>
          <div className="mt-6">{children}</div>
        </div>
      )}
    </dialog>
  )
}

/** Bracketed call to action in CSS glass, for places where a WebGL glass snapshot would be too costly. */
export function PillButton({ children, onClick }: { children: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="glass-fallback inline-flex min-h-14 cursor-pointer items-center justify-center gap-3 rounded-full px-8 text-[0.75rem] font-medium tracking-[0.28em] whitespace-nowrap text-ivory uppercase transition-[color,transform] duration-300 hover:text-gold-bright active:scale-[0.98]"
    >
      <span aria-hidden="true" className="text-gold">
        [
      </span>
      {children}
      <span aria-hidden="true" className="text-gold">
        ]
      </span>
    </button>
  )
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`
