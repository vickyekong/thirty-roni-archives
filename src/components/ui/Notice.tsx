import type { ReactNode } from 'react'
import { cn } from '@/lib/cn'

type Tone = 'info' | 'error' | 'success' | 'sample'

const tones: Record<Tone, string> = {
  info: 'border-gold/30 bg-gold/[0.06] text-ivory',
  error: 'border-danger/40 bg-danger/[0.08] text-ivory',
  success: 'border-success/40 bg-success/[0.08] text-ivory',
  sample: 'border-dashed border-grey/50 bg-transparent text-grey',
}

export function Notice({
  tone = 'info',
  title,
  children,
  className,
  live,
}: {
  tone?: Tone
  title?: ReactNode
  children?: ReactNode
  className?: string
  live?: boolean
}) {
  return (
    <div
      role={tone === 'error' ? 'alert' : live ? 'status' : undefined}
      className={cn('rounded-xl border px-4 py-3 text-sm leading-relaxed', tones[tone], className)}
    >
      {title && <p className="font-medium">{title}</p>}
      {children && <div className={cn(title ? 'mt-1' : null, 'text-ivory/80')}>{children}</div>}
    </div>
  )
}
