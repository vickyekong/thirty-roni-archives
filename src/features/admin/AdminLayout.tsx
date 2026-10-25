import type { ReactNode } from 'react'
import { NavLink, Outlet } from 'react-router'
import { Wordmark } from '@/components/ui/Wordmark'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/cn'

const NAV = [
  { to: '/admin', label: 'Overview', end: true },
  { to: '/admin/contributors', label: 'Contributors' },
  { to: '/admin/submissions', label: 'Submissions' },
  { to: '/admin/library', label: 'Library' },
  { to: '/admin/timeline', label: 'Timeline' },
  { to: '/admin/stories', label: 'Stories' },
  { to: '/admin/people', label: 'People' },
  { to: '/admin/wishes', label: 'Wishes' },
  { to: '/admin/editorial', label: 'Editorial' },
  { to: '/admin/accounts', label: 'Accounts' },
]

export function AdminLayout() {
  const auth = useAuth()
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-midnight-line bg-midnight/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-4">
            <Wordmark compact />
            <span className="eyebrow">Curator</span>
          </div>
          <nav aria-label="Curator" className="order-3 -mx-2 flex w-full gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'rounded-full px-3 py-1.5 text-sm whitespace-nowrap transition-colors',
                    isActive ? 'bg-gold/15 text-gold-bright' : 'text-grey hover:text-ivory',
                  )
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
          <div className="flex items-center gap-4 text-sm text-grey">
            <span className="hidden max-w-48 truncate md:inline">{auth.user?.email}</span>
            <button type="button" onClick={() => void auth.signOut()} className="cursor-pointer underline underline-offset-4 hover:text-ivory">
              Sign out
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10 sm:px-8">
        <Outlet />
      </main>
    </div>
  )
}

export function PageTitle({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-2 text-4xl sm:text-5xl">{title}</h1>
      </div>
      {children}
    </div>
  )
}
