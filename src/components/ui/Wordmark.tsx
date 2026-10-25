import { cn } from '@/lib/cn'

export function Wordmark({
  className,
  compact,
  collapseOnMobile,
}: {
  className?: string
  compact?: boolean
  /** Hide the subtitle on narrow screens, for headers that share the row with other content. */
  collapseOnMobile?: boolean
}) {
  return (
    <span className={cn('inline-flex items-baseline gap-3 text-ivory', className)}>
      <span className="font-serif text-xl font-medium tracking-[0.18em]">THIRTY</span>
      {!compact && (
        <>
          <span aria-hidden="true" className={cn('text-gold', collapseOnMobile && 'max-sm:hidden')}>
            |
          </span>
          <span
            className={cn(
              'text-[0.625rem] font-medium tracking-[0.3em] whitespace-nowrap text-grey uppercase',
              collapseOnMobile && 'max-sm:sr-only',
            )}
          >
            The Roni Archives
          </span>
        </>
      )}
    </span>
  )
}
