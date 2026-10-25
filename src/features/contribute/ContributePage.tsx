import { motion, useReducedMotion, type Variants } from 'motion/react'
import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { GlassButton } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { ApiError, callContribute, type Draft, type OpenContribution, type SessionData } from './api'
import { ContributionForm, type SubmittedResult } from './ContributionForm'
import { RemovalRequest } from './RemovalRequest'
import { StudioShell } from './StudioShell'
import { forgetToken, readStoredToken, takeTokenFromLocation } from './token'

type View =
  | { kind: 'loading' }
  | { kind: 'no-token' }
  | { kind: 'error'; title: string; message: string; retry?: boolean }
  | { kind: 'welcome'; session: SessionData }
  | { kind: 'form'; session: SessionData; contribution: OpenContribution; draft: Draft }
  | { kind: 'thanks'; session: SessionData; result: SubmittedResult }

const ERROR_TITLES: Record<string, string> = {
  invalid_invitation: 'We don’t recognise this link',
  invitation_revoked: 'This invitation is no longer active',
  invitation_expired: 'This invitation has expired',
  rate_limited: 'Please wait a moment',
  closed: 'Contributions are now closed',
}

export function ContributePage() {
  const [token, setToken] = useState<string | null>(null)
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const loadSession = useCallback(async (value: string) => {
    setView({ kind: 'loading' })
    try {
      const session = await callContribute('session', value, {})
      setView({ kind: 'welcome', session })
      return session
    } catch (error) {
      const e = error instanceof ApiError ? error : new ApiError(0, 'unknown', 'Something went wrong.')
      if (e.code === 'invalid_invitation' || e.code === 'invitation_revoked' || e.code === 'invitation_expired') forgetToken()
      setView({
        kind: 'error',
        title: ERROR_TITLES[e.code] ?? 'We couldn’t open your invitation',
        message: e.message,
        retry: e.isNetwork || e.status >= 500 || e.code === 'rate_limited',
      })
      return null
    }
  }, [])

  useEffect(() => {
    const fromUrl = takeTokenFromLocation()
    if (fromUrl === 'invalid') {
      setView({
        kind: 'error',
        title: ERROR_TITLES.invalid_invitation!,
        message: 'The link seems to be incomplete. Please open the full link from your invitation message.',
      })
      return
    }
    const value = fromUrl ?? readStoredToken()
    if (!value) {
      setView({ kind: 'no-token' })
      return
    }
    setToken(value)
    void loadSession(value)
  }, [loadSession])

  const begin = async (session: SessionData) => {
    if (!token) return
    setStartError(null)
    if (session.current?.draft) {
      setView({ kind: 'form', session, contribution: session.current, draft: session.current.draft })
      return
    }
    setStarting(true)
    try {
      await callContribute('start', token, {})
      const fresh = await callContribute('session', token, {})
      if (fresh.current?.draft) setView({ kind: 'form', session: fresh, contribution: fresh.current, draft: fresh.current.draft })
      else setStartError('We could not open your contribution. Please try again.')
    } catch (error) {
      setStartError(error instanceof ApiError ? error.message : 'We could not start your contribution. Please try again.')
    } finally {
      setStarting(false)
    }
  }

  if (view.kind === 'form' && token)
    return (
      <ContributionForm
        token={token}
        contributor={view.session.contributor}
        contribution={view.contribution}
        draft={view.draft}
        onSubmitted={(result) => setView({ kind: 'thanks', session: view.session, result })}
      />
    )

  return (
    <StudioShell>
      {view.kind === 'loading' && (
        <div className="grid min-h-[50vh] place-items-center">
          <Spinner label="Opening your invitation…" />
        </div>
      )}
      {view.kind === 'no-token' && (
        <Centered eyebrow="Contribution Studio" title="This studio is by invitation">
          <p>
            Please open the personal link from your invitation message. If you have lost it, contact the person who invited you
            and they can send you a new one.
          </p>
        </Centered>
      )}
      {view.kind === 'error' && (
        <Centered eyebrow="Contribution Studio" title={view.title}>
          <p>{view.message}</p>
          {view.retry && token && (
            <button type="button" onClick={() => void loadSession(token)} className="mt-6 cursor-pointer text-gold underline underline-offset-4">
              Try again
            </button>
          )}
        </Centered>
      )}
      {view.kind === 'welcome' && token && (
        <Welcome
          session={view.session}
          token={token}
          starting={starting}
          error={startError}
          onBegin={() => void begin(view.session)}
          onForget={() => {
            forgetToken()
            setToken(null)
            setView({ kind: 'no-token' })
          }}
        />
      )}
      {view.kind === 'thanks' && token && <Thanks token={token} session={view.session} />}
    </StudioShell>
  )
}

function useReveal(): { container: Variants; item: Variants } {
  const reduce = useReducedMotion()
  return {
    container: { hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : 0.12, delayChildren: reduce ? 0 : 0.15 } } },
    item: {
      hidden: { opacity: 0, y: reduce ? 0 : 16 },
      show: { opacity: 1, y: 0, transition: { duration: reduce ? 0 : 0.9, ease: [0.22, 1, 0.36, 1] } },
    },
  }
}

function Centered({ eyebrow, title, children }: { eyebrow: string; title: string; children: ReactNode }) {
  const { container, item } = useReveal()
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="flex min-h-[55vh] flex-col justify-center">
      <motion.p variants={item} className="eyebrow">
        {eyebrow}
      </motion.p>
      <motion.h1 variants={item} className="display mt-4 text-4xl sm:text-6xl">
        {title}
      </motion.h1>
      <motion.div variants={item} className="mt-6 max-w-prose leading-relaxed text-ivory/80">
        {children}
      </motion.div>
    </motion.div>
  )
}

function Welcome({
  session,
  token,
  starting,
  error,
  onBegin,
  onForget,
}: {
  session: SessionData
  token: string
  starting: boolean
  error: string | null
  onBegin: () => void
  onForget: () => void
}) {
  const { container, item } = useReveal()
  const hasDraft = Boolean(session.current)
  const alreadySubmitted = session.submitted.length > 0 && !hasDraft
  const firstName = session.contributor.fullName.split(' ')[0]

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col items-start">
      <motion.p variants={item} className="eyebrow">
        {firstName ? `For ${firstName}` : 'Contribution Studio'}
      </motion.p>
      <motion.h1 variants={item} className="display mt-6 text-[3.25rem] uppercase sm:text-[5.5rem]">
        Help us tell <br className="hidden sm:block" />
        her story
      </motion.h1>
      <motion.hr variants={item} className="hairline my-8 w-40" />
      <motion.p variants={item} className="font-serif text-2xl text-gold-bright italic sm:text-[1.75rem]">
        Thirty years. Countless memories. One extraordinary woman.
      </motion.p>
      <motion.p variants={item} className="mt-5 max-w-prose text-[1.05rem] leading-relaxed text-ivory/80">
        We’re creating something special for Roni’s 30th birthday. Share a memory, photograph, story, or wish to become part
        of her celebration.
      </motion.p>

      <motion.div variants={item} className="mt-12 flex w-full flex-col items-start gap-5">
        {!session.contributionsOpen ? (
          <Notice title="Contributions are now closed">Thank you so much. The archive is being prepared for her birthday.</Notice>
        ) : alreadySubmitted ? (
          <>
            <Notice tone="success" title="Your contribution has been received">
              Thank you. If another memory comes to mind, you are welcome to add a second contribution.
            </Notice>
            <GlassButton onClick={onBegin} loading={starting}>
              Add another contribution
            </GlassButton>
          </>
        ) : (
          <GlassButton onClick={onBegin} loading={starting}>
            {hasDraft ? 'Continue your contribution' : 'Begin your contribution'}
          </GlassButton>
        )}
        {error && <Notice tone="error">{error}</Notice>}
        {session.current?.status === 'changes_requested' && (
          <Notice title="The curator has asked for a small change">Open your contribution to see their note.</Notice>
        )}
      </motion.div>

      <motion.div variants={item} className="mt-14 flex w-full flex-col gap-6 border-t border-midnight-line pt-8 text-sm leading-relaxed text-grey">
        <ul className="grid gap-3 sm:grid-cols-3">
          <li>Your progress saves automatically. Come back with your link at any time.</li>
          <li>Everything you share is private and reviewed before it appears anywhere.</li>
          <li>Answer as much or as little as you like. Every question is optional.</li>
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span>
            Invited as <span className="text-ivory">{session.contributor.fullName}</span>
          </span>
          <button type="button" onClick={onForget} className="-my-2 min-h-11 cursor-pointer underline underline-offset-4 hover:text-ivory">
            Not you? Forget this device
          </button>
        </div>
        {alreadySubmitted && <RemovalRequest token={token} contributionId={session.submitted[0]?.id} />}
      </motion.div>
    </motion.div>
  )
}

function Thanks({ token, session }: { token: string; session: SessionData }) {
  const { container, item } = useReveal()
  return (
    <motion.div variants={container} initial="hidden" animate="show" className="flex min-h-[60vh] flex-col justify-center">
      <motion.p variants={item} className="eyebrow">
        Contribution received
      </motion.p>
      <motion.h1 variants={item} className="display mt-6 text-[3rem] uppercase sm:text-[5rem]">
        You’re part of <br className="hidden sm:block" />
        her story.
      </motion.h1>
      <motion.hr variants={item} className="hairline my-8 w-40" />
      <motion.p variants={item} className="max-w-prose font-serif text-2xl leading-snug text-gold-bright italic">
        Thank you for helping make Roni’s thirtieth birthday unforgettable.
      </motion.p>
      <motion.p variants={item} className="mt-6 max-w-prose leading-relaxed text-ivory/75">
        The curator will review what you’ve shared. Please keep it a surprise. Roni will see it on her birthday.
      </motion.p>
      <motion.div variants={item} className="mt-12">
        <RemovalRequest token={token} contributionId={session.current?.id} />
      </motion.div>
    </motion.div>
  )
}
