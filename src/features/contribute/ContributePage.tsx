import { CONTRIBUTOR_CATEGORIES, type ContributorCategory } from '@shared/contribution'
import { motion, useReducedMotion, type Variants } from 'motion/react'
import { useCallback, useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Button, GlassButton } from '@/components/ui/Button'
import { ChoiceGroup } from '@/components/ui/ChoiceGroup'
import { TextField } from '@/components/ui/Field'
import { Notice } from '@/components/ui/Notice'
import { Spinner } from '@/components/ui/Spinner'
import { ApiError, callContribute, type Draft, type OpenContribution, type SessionData } from './api'
import { ContributionForm, type SubmittedResult } from './ContributionForm'
import { RemovalRequest } from './RemovalRequest'
import { StudioShell } from './StudioShell'
import { forgetSharedToken, forgetToken, readStoredSharedToken, readStoredToken, storePersonalToken, takeTokenFromLocation } from './token'

type View =
  | { kind: 'loading' }
  | { kind: 'no-token' }
  | { kind: 'error'; title: string; message: string; retry?: () => void }
  | { kind: 'join'; contributionsOpen: boolean }
  | { kind: 'welcome'; session: SessionData }
  | { kind: 'form'; session: SessionData; contribution: OpenContribution; draft: Draft }
  | { kind: 'thanks'; session: SessionData; result: SubmittedResult }

type JoinDetails = { fullName: string; relationship: string; category: ContributorCategory }

const ERROR_TITLES: Record<string, string> = {
  invalid_invitation: 'We don’t recognise this link',
  invitation_revoked: 'This invitation is no longer active',
  invitation_expired: 'This invitation has expired',
  invalid_shared_link: 'We don’t recognise this link',
  shared_link_off: 'This link has been turned off',
  shared_link_expired: 'This link has expired',
  rate_limited: 'Please wait a moment',
  closed: 'Contributions are now closed',
}

const DEAD_PERSONAL = new Set(['invalid_invitation', 'invitation_revoked', 'invitation_expired'])
const DEAD_SHARED = new Set(['invalid_shared_link', 'shared_link_off', 'shared_link_expired'])

const asApiError = (error: unknown) => (error instanceof ApiError ? error : new ApiError(0, 'unknown', 'Something went wrong.'))
const canRetry = (e: ApiError) => e.isNetwork || e.status >= 500 || e.code === 'rate_limited'

export function ContributePage() {
  const [token, setToken] = useState<string | null>(null)
  const [sharedToken, setSharedToken] = useState<string | null>(null)
  const [justJoined, setJustJoined] = useState(false)
  const [view, setView] = useState<View>({ kind: 'loading' })
  const [starting, setStarting] = useState(false)
  const [startError, setStartError] = useState<string | null>(null)

  const openJoin = useCallback(async (shared: string) => {
    setView({ kind: 'loading' })
    try {
      const info = await callContribute('link', shared, {})
      setView({ kind: 'join', contributionsOpen: info.contributionsOpen })
    } catch (error) {
      const e = asApiError(error)
      if (DEAD_SHARED.has(e.code)) forgetSharedToken()
      setView({
        kind: 'error',
        title: ERROR_TITLES[e.code] ?? 'We couldn’t open this link',
        message: e.message,
        retry: canRetry(e) ? () => void openJoin(shared) : undefined,
      })
    }
  }, [])

  const loadSession = useCallback(
    async (value: string, shared: string | null) => {
      setView({ kind: 'loading' })
      try {
        const session = await callContribute('session', value, {})
        setView({ kind: 'welcome', session })
      } catch (error) {
        const e = asApiError(error)
        if (DEAD_PERSONAL.has(e.code)) {
          forgetToken()
          if (shared) {
            setToken(null)
            void openJoin(shared)
            return
          }
        }
        setView({
          kind: 'error',
          title: ERROR_TITLES[e.code] ?? 'We couldn’t open your invitation',
          message: e.message,
          retry: canRetry(e) ? () => void loadSession(value, shared) : undefined,
        })
      }
    },
    [openJoin],
  )

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
    const shared = fromUrl?.kind === 'shared' ? fromUrl.token : readStoredSharedToken()
    const personal = fromUrl?.kind === 'personal' ? fromUrl.token : readStoredToken()
    setSharedToken(shared)
    if (personal) {
      setToken(personal)
      void loadSession(personal, shared)
    } else if (shared) {
      void openJoin(shared)
    } else {
      setView({ kind: 'no-token' })
    }
  }, [loadSession, openJoin])

  const join = async (details: JoinDetails) => {
    if (!sharedToken) return
    const { token: personal } = await callContribute('join', sharedToken, details)
    storePersonalToken(personal)
    setToken(personal)
    setJustJoined(true)
    await loadSession(personal, sharedToken)
  }

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
            Please open the link from your invitation message. If you have lost it, ask the person who invited you to send it
            again.
          </p>
        </Centered>
      )}
      {view.kind === 'error' && (
        <Centered eyebrow="Contribution Studio" title={view.title}>
          <p>{view.message}</p>
          {view.retry && (
            <button type="button" onClick={view.retry} className="mt-6 cursor-pointer text-gold underline underline-offset-4">
              Try again
            </button>
          )}
        </Centered>
      )}
      {view.kind === 'join' && <Join contributionsOpen={view.contributionsOpen} onJoin={join} />}
      {view.kind === 'welcome' && token && (
        <Welcome
          session={view.session}
          token={token}
          justJoined={justJoined}
          starting={starting}
          error={startError}
          onBegin={() => void begin(view.session)}
          onForget={() => {
            forgetToken()
            setToken(null)
            setJustJoined(false)
            if (sharedToken) void openJoin(sharedToken)
            else setView({ kind: 'no-token' })
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

const CATEGORY_CHOICES: Record<ContributorCategory, { label: string; description?: string }> = {
  parent: { label: 'I’m her parent' },
  sibling: { label: 'I’m her brother or sister' },
  friend: { label: 'Friend, or anyone else', description: 'Cousins, aunties, uncles, colleagues and friends' },
}

function Join({ contributionsOpen, onJoin }: { contributionsOpen: boolean; onJoin: (details: JoinDetails) => Promise<void> }) {
  const { container, item } = useReveal()
  const [fullName, setFullName] = useState('')
  const [relationship, setRelationship] = useState('')
  const [category, setCategory] = useState<ContributorCategory | null>(null)
  const [errors, setErrors] = useState<{ fullName?: string; category?: string }>({})
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = {
      fullName: fullName.trim() ? undefined : 'Please tell us your name.',
      category: category ? undefined : 'Please choose one.',
    }
    setErrors(next)
    if (next.fullName || !category) {
      const form = event.currentTarget
      requestAnimationFrame(() => form.querySelector<HTMLElement>(next.fullName ? 'input[autocomplete="name"]' : 'input[type="radio"]')?.focus())
      return
    }
    setPending(true)
    setError(null)
    try {
      await onJoin({ fullName: fullName.trim(), relationship: relationship.trim(), category })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'We could not set up your contribution. Please try again.')
      setPending(false)
    }
  }

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="flex flex-col items-start">
      <motion.p variants={item} className="eyebrow">
        Contribution Studio
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

      <motion.div variants={item} className="mt-12 w-full max-w-xl">
        {!contributionsOpen ? (
          <Notice title="Contributions are now closed">Thank you so much. The archive is being prepared for her birthday.</Notice>
        ) : (
          <form onSubmit={(e) => void submit(e)} noValidate className="flex flex-col gap-6">
            <h2 className="font-serif text-2xl text-ivory">First, who are you?</h2>
            <TextField
              label="Your name"
              hint="As Roni would know you. You choose later how it appears."
              value={fullName}
              onValueChange={setFullName}
              error={errors.fullName}
              maxLength={120}
              autoComplete="name"
              required
            />
            <div className="flex flex-col gap-2">
              <ChoiceGroup<ContributorCategory>
                legend="How do you know Roni?"
                hint="This decides a few of the questions you’ll see."
                name="category"
                value={category}
                onChange={(value) => {
                  setCategory(value)
                  setErrors((e) => ({ ...e, category: undefined }))
                }}
                choices={CONTRIBUTOR_CATEGORIES.map((c) => ({ value: c, ...CATEGORY_CHOICES[c] }))}
              />
              <span className="min-h-5 text-xs text-danger" role={errors.category ? 'alert' : undefined}>
                {errors.category}
              </span>
            </div>
            <TextField
              label="Your relationship to her"
              hint="For example: cousin, school friend, mum."
              optional
              value={relationship}
              onValueChange={setRelationship}
              maxLength={120}
            />
            {error && <Notice tone="error">{error}</Notice>}
            <GlassButton type="submit" loading={pending} className="self-start">
              Continue
            </GlassButton>
          </form>
        )}
      </motion.div>

      <motion.ul variants={item} className="mt-14 grid w-full gap-3 border-t border-midnight-line pt-8 text-sm leading-relaxed text-grey sm:grid-cols-3">
        <li>You don’t need an account. Your progress saves automatically on this device.</li>
        <li>Everything you share is private and reviewed before it appears anywhere.</li>
        <li>Answer as much or as little as you like. Every question is optional.</li>
      </motion.ul>
    </motion.div>
  )
}

function PersonalLink({ token, open }: { token: string; open: boolean }) {
  const [copied, setCopied] = useState(false)
  const link = `${window.location.origin}/contribute#t=${token}`
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <details open={open} className="w-full rounded-2xl border border-midnight-line p-5 open:border-gold/40 open:bg-gold/[0.04]">
      <summary className="cursor-pointer text-ivory">Continue on another device</summary>
      <p className="mt-3 text-sm leading-relaxed text-grey">
        This is your personal link. Save it somewhere safe to come back from another phone or computer. Keep it to yourself: it
        opens your contribution.
      </p>
      <div className="mt-4 flex flex-col gap-3 sm:flex-row">
        <input readOnly value={link} aria-label="Your personal link" className="field-input font-mono text-xs" onFocus={(e) => e.target.select()} />
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy link'}
        </Button>
      </div>
    </details>
  )
}

function Welcome({
  session,
  token,
  justJoined,
  starting,
  error,
  onBegin,
  onForget,
}: {
  session: SessionData
  token: string
  justJoined: boolean
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
        <PersonalLink token={token} open={justJoined} />
      </motion.div>

      <motion.div variants={item} className="mt-14 flex w-full flex-col gap-6 border-t border-midnight-line pt-8 text-sm leading-relaxed text-grey">
        <ul className="grid gap-3 sm:grid-cols-3">
          <li>Your progress saves automatically. Come back on this device, or with your personal link, at any time.</li>
          <li>Everything you share is private and reviewed before it appears anywhere.</li>
          <li>Answer as much or as little as you like. Every question is optional.</li>
        </ul>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <span>
            Contributing as <span className="text-ivory">{session.contributor.fullName}</span>
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
