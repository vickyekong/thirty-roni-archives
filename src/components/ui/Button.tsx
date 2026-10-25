import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { LiquidGlass } from '@/components/glass/LiquidGlass'
import { cn } from '@/lib/cn'
import { Spinner } from './Spinner'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md' | 'lg'

const variants: Record<Variant, string> = {
  primary:
    'bg-gold text-midnight hover:bg-gold-bright disabled:bg-gold/40 disabled:text-midnight/70 shadow-[0_10px_30px_-12px_rgba(198,166,107,0.6)]',
  secondary: 'border border-ivory/25 text-ivory hover:border-gold hover:text-gold-bright disabled:opacity-50',
  ghost: 'text-ivory/80 hover:text-gold-bright disabled:opacity-50',
  danger: 'border border-danger/50 text-danger hover:bg-danger/10 disabled:opacity-50',
}

const sizes: Record<Size, string> = {
  sm: 'min-h-9 px-4 text-sm',
  md: 'min-h-11 px-6 text-[0.95rem]',
  lg: 'min-h-13 px-8 text-base',
}

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant
  size?: Size
  loading?: boolean
}

export const buttonClasses = (variant: Variant = 'primary', size: Size = 'md', className?: string) =>
  cn(
    'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium tracking-wide transition-colors duration-200 ease-[var(--ease-editorial)] cursor-pointer disabled:cursor-not-allowed select-none',
    variants[variant],
    sizes[size],
    className,
  )

export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, type = 'button', ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClasses(variant, size, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading && <Spinner className="size-4" />}
      {children}
    </button>
  )
}

/** Editorial call to action: a liquid-glass pill with bracketed label, e.g. [ BEGIN ]. */
export function GlassButton({
  children,
  className,
  loading,
  disabled,
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { loading?: boolean; children: ReactNode }) {
  return (
    <LiquidGlass
      as="button"
      type={type}
      glass={{ type: 'pill', tintOpacity: 0.12, shadow: '0 18px 40px rgba(0,0,0,0.35)' }}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={cn(
        'group inline-flex min-h-14 items-center justify-center gap-2.5 rounded-full px-6 text-[0.7rem] font-medium tracking-[0.2em] whitespace-nowrap text-ivory uppercase sm:gap-3 sm:px-8 sm:text-[0.75rem] sm:tracking-[0.28em] transition-[color,transform] duration-300 ease-[var(--ease-editorial)] hover:text-gold-bright active:scale-[0.98] disabled:opacity-60 cursor-pointer disabled:cursor-not-allowed',
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner className="size-4" /> : <span aria-hidden="true" className="text-gold">[</span>}
      <span>{children}</span>
      {!loading && <span aria-hidden="true" className="text-gold">]</span>}
    </LiquidGlass>
  )
}
