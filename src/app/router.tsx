import { lazy, Suspense, type ReactNode } from 'react'
import { createBrowserRouter, Link, Navigate } from 'react-router'
import { RequireRole } from '@/components/RequireRole'
import { Spinner } from '@/components/ui/Spinner'
const HomePage = lazy(() => import('@/features/experience/HomePage').then((m) => ({ default: m.HomePage })))
const ContributePage = lazy(() => import('@/features/contribute/ContributePage').then((m) => ({ default: m.ContributePage })))
const SignInPage = lazy(() => import('@/features/auth/SignInPage').then((m) => ({ default: m.SignInPage })))
const AdminLayout = lazy(() => import('@/features/admin/AdminLayout').then((m) => ({ default: m.AdminLayout })))
const AdminOverview = lazy(() => import('@/features/admin/AdminOverview').then((m) => ({ default: m.AdminOverview })))
const AdminContributors = lazy(() => import('@/features/admin/AdminContributors').then((m) => ({ default: m.AdminContributors })))
const AdminSubmissions = lazy(() => import('@/features/admin/AdminSubmissions').then((m) => ({ default: m.AdminSubmissions })))
const AdminLibrary = lazy(() => import('@/features/admin/AdminLibrary').then((m) => ({ default: m.AdminLibrary })))
const AdminTimeline = lazy(() => import('@/features/admin/AdminTimeline').then((m) => ({ default: m.AdminTimeline })))
const AdminStories = lazy(() => import('@/features/admin/AdminStories').then((m) => ({ default: m.AdminStories })))
const AdminPeople = lazy(() => import('@/features/admin/AdminPeople').then((m) => ({ default: m.AdminPeople })))
const AdminWishes = lazy(() => import('@/features/admin/AdminWishes').then((m) => ({ default: m.AdminWishes })))
const AdminEditorial = lazy(() => import('@/features/admin/AdminEditorial').then((m) => ({ default: m.AdminEditorial })))
const AdminAccounts = lazy(() => import('@/features/admin/AdminAccounts').then((m) => ({ default: m.AdminAccounts })))
const MyArchivePage = lazy(() => import('@/features/archive/MyArchivePage').then((m) => ({ default: m.MyArchivePage })))

const page = (node: ReactNode) => (
  <Suspense
    fallback={
      <div className="grid min-h-dvh place-items-center">
        <Spinner label="Loading…" />
      </div>
    }
  >
    {node}
  </Suspense>
)

function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-6">
      <p className="eyebrow">404</p>
      <h1 className="display text-5xl">This page isn’t part of the archive</h1>
      <Link to="/" className="text-gold underline underline-offset-4">
        Return home
      </Link>
    </div>
  )
}

export const router = createBrowserRouter([
  { path: '/', element: page(<HomePage />) },
  { path: '/contribute', element: page(<ContributePage />) },
  { path: '/sign-in', element: page(<SignInPage />) },
  { path: '/admin/login', element: page(<SignInPage defaultNext="/admin" />) },
  {
    path: '/admin',
    element: page(
      <RequireRole roles={['admin']}>
        <AdminLayout />
      </RequireRole>,
    ),
    children: [
      { index: true, element: page(<AdminOverview />) },
      { path: 'contributors', element: page(<AdminContributors />) },
      { path: 'submissions', element: page(<AdminSubmissions />) },
      { path: 'library', element: page(<AdminLibrary />) },
      { path: 'timeline', element: page(<AdminTimeline />) },
      { path: 'stories', element: page(<AdminStories />) },
      { path: 'people', element: page(<AdminPeople />) },
      { path: 'wishes', element: page(<AdminWishes />) },
      { path: 'editorial', element: page(<AdminEditorial />) },
      { path: 'accounts', element: page(<AdminAccounts />) },
      { path: '*', element: <Navigate to="/admin" replace /> },
    ],
  },
  {
    path: '/my-archive',
    element: page(
      <RequireRole roles={['roni', 'admin']}>
        <MyArchivePage />
      </RequireRole>,
    ),
  },
  { path: '*', element: <NotFound /> },
])
