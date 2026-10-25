import type { ReactNode } from 'react'
import { Wordmark } from '@/components/ui/Wordmark'
import { cn } from '@/lib/cn'

export function StudioShell({ children, aside, wide }: { children: ReactNode; aside?: ReactNode; wide?: boolean }) {
  return (
    <div className="grain relative min-h-dvh overflow-x-clip">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[70vh] bg-[radial-gradient(60%_60%_at_50%_0%,rgba(87,44,61,0.55),transparent_70%)]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 bottom-0 h-[50vh] bg-[radial-gradient(50%_60%_at_80%_100%,rgba(198,166,107,0.08),transparent_70%)]"
      />
      <a
        href="#main"
        className="sr-only z-50 rounded-full bg-gold px-4 py-2 text-midnight focus:not-sr-only focus:fixed focus:top-4 focus:left-4"
      >
        Skip to content
      </a>
      <header className="relative z-10 mx-auto flex max-w-5xl items-center justify-between gap-4 px-5 pt-6 sm:px-8 sm:pt-8">
        <Wordmark collapseOnMobile={Boolean(aside)} />
        <div className="text-right">{aside}</div>
      </header>
      <main id="main" className={cn('relative z-10 mx-auto px-5 pt-10 pb-24 sm:px-8 sm:pt-16', wide ? 'max-w-5xl' : 'max-w-2xl')}>
        {children}
      </main>
      <footer className="relative z-10 mx-auto max-w-5xl px-5 pb-10 text-xs leading-relaxed text-grey/80 sm:px-8">
        <p>Private and invitation-only. Please keep it a surprise.</p>
      </footer>
    </div>
  )
}
