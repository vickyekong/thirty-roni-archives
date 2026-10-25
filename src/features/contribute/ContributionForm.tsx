import { STEP_KEYS, validateForSubmission, type MediaPurpose, type SubmissionIssue } from '@shared/contribution'
import { useCallback, useEffect, useMemo, useRef, useState, type ComponentType } from 'react'
import { Button } from '@/components/ui/Button'
import { Notice } from '@/components/ui/Notice'
import { cn } from '@/lib/cn'
import { ApiError, callContribute, type ContributorInfo, type Draft, type MediaItem, type OpenContribution } from './api'
import { STEP_COPY } from './copy'
import { SaveIndicator } from './SaveIndicator'
import { MediaStep } from './steps/MediaStep'
import { ReviewStep } from './steps/ReviewStep'
import {
  CelebratingStep,
  ConsentStep,
  IntroductionStep,
  MemoriesStep,
  MessageStep,
  TimelineStep,
  type StepProps,
} from './steps/WritingSteps'
import { StudioShell } from './StudioShell'
import { clearDraftBackup, useDraft } from './useDraft'

const STEP_COMPONENTS: Record<Exclude<(typeof STEP_KEYS)[number], 'review'>, ComponentType<StepProps>> = {
  introduction: IntroductionStep,
  memories: MemoriesStep,
  celebrating: CelebratingStep,
  message: MessageStep,
  media: MediaStep,
  timeline: TimelineStep,
  consent: ConsentStep,
}

const submitKeyName = (contributionId: string) => `roni-archives.submit.${contributionId}`

function idempotencyKeyFor(contributionId: string) {
  try {
    const existing = localStorage.getItem(submitKeyName(contributionId))
    if (existing) return existing
    const key = crypto.randomUUID()
    localStorage.setItem(submitKeyName(contributionId), key)
    return key
  } catch {
    return crypto.randomUUID()
  }
}

export type SubmittedResult = { submittedAt: string | null }

export function ContributionForm({
  token,
  contributor,
  contribution,
  draft: initialDraft,
  onSubmitted,
}: {
  token: string
  contributor: ContributorInfo
  contribution: OpenContribution
  draft: Draft
  onSubmitted: (result: SubmittedResult) => void
}) {
  const contributionId = contribution.id
  const draft = useDraft({ token, contributionId, initial: initialDraft })
  const [media, setMedia] = useState<MediaItem[]>(contribution.media)
  const [busyPurposes, setBusyPurposes] = useState<ReadonlySet<MediaPurpose>>(new Set())
  const [attempted, setAttempted] = useState(false)
  const [serverIssues, setServerIssues] = useState<SubmissionIssue[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [savedForLater, setSavedForLater] = useState(false)
  const headingRefs = useRef<(HTMLHeadingElement | null)[]>([])
  const firstRender = useRef(true)

  const stepIndex = Math.min(Math.max(draft.step, 0), STEP_KEYS.length - 1)
  const stepKey = STEP_KEYS[stepIndex] ?? 'introduction'
  const isReview = stepKey === 'review'
  const uploading = busyPurposes.size > 0

  const liveIssues = useMemo(() => validateForSubmission(draft.payload, media.length), [draft.payload, media.length])
  const issues = attempted || isReview ? (serverIssues.length ? serverIssues : liveIssues) : []

  const reportBusy = useCallback((purpose: MediaPurpose, busy: boolean) => {
    setBusyPurposes((current) => {
      if (current.has(purpose) === busy) return current
      const next = new Set(current)
      if (busy) next.add(purpose)
      else next.delete(purpose)
      return next
    })
  }, [])

  const mediaContext = useMemo(
    () => ({ token, contributionId, media, onMediaChange: setMedia, reportBusy }),
    [token, contributionId, media, reportBusy],
  )

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' })
    headingRefs.current[stepIndex]?.focus({ preventScroll: true })
  }, [stepIndex])

  const goTo = (index: number) => {
    setServerIssues([])
    setSavedForLater(false)
    draft.setStep(Math.min(Math.max(index, 0), STEP_KEYS.length - 1))
  }

  const saveForLater = async () => {
    const ok = await draft.flush()
    setSavedForLater(ok)
  }

  const submit = async () => {
    setAttempted(true)
    setSubmitError(null)
    setServerIssues([])
    if (uploading) {
      setSubmitError('Please wait for your uploads to finish.')
      return
    }
    if (liveIssues.length) return
    setSubmitting(true)
    try {
      await draft.flush()
      if (draft.hasConflict()) {
        setSubmitError('Your contribution was changed in another window. Choose which version to keep, then submit.')
        return
      }
      const result = await callContribute('submit', token, {
        contributionId,
        payload: draft.payload,
        idempotencyKey: idempotencyKeyFor(contributionId),
      })
      clearDraftBackup(contributionId)
      try {
        localStorage.removeItem(submitKeyName(contributionId))
      } catch {
        /* ignore */
      }
      onSubmitted({ submittedAt: result.submittedAt })
    } catch (error) {
      if (error instanceof ApiError && error.issues.length) setServerIssues(error.issues)
      else
        setSubmitError(
          error instanceof ApiError ? error.message : 'We could not submit your contribution. Your words are saved. Please try again.',
        )
    } finally {
      setSubmitting(false)
    }
  }

  const progress = ((stepIndex + 1) / STEP_KEYS.length) * 100

  return (
    <StudioShell aside={<SaveIndicator status={draft.status} onRetry={() => void draft.flush()} />}>
      <div className="flex flex-col gap-3">
        <div className="flex items-center justify-between text-xs text-grey">
          <span>
            Step {stepIndex + 1} of {STEP_KEYS.length}
          </span>
          <span className="hidden sm:inline">Invited as {contributor.fullName}</span>
        </div>
        <div className="h-px w-full bg-midnight-line" aria-hidden="true">
          <div className="h-px bg-gold transition-[width] duration-500 ease-[var(--ease-editorial)]" style={{ width: `${progress}%` }} />
        </div>
        <nav aria-label="Contribution steps" className="-mx-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <ol className="flex min-w-max gap-1">
            {STEP_KEYS.map((key, index) => (
              <li key={key}>
                <button
                  type="button"
                  onClick={() => goTo(index)}
                  aria-current={index === stepIndex ? 'step' : undefined}
                  className={cn(
                    'cursor-pointer rounded-full px-3 py-1.5 text-xs whitespace-nowrap transition-colors',
                    index === stepIndex ? 'bg-gold/15 text-gold-bright' : 'text-grey hover:text-ivory',
                  )}
                >
                  {STEP_COPY[key].label}
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </div>

      {contribution.correctionRequest && (
        <Notice title="A note from the curator" className="mt-8">
          <p className="whitespace-pre-line">{contribution.correctionRequest}</p>
        </Notice>
      )}
      {draft.restoredFromDevice && stepIndex === initialDraft.step && (
        <Notice tone="success" className="mt-6" live>
          We restored changes saved on this device that hadn’t reached the server yet.
        </Notice>
      )}
      {draft.conflict && (
        <Notice tone="error" title="This contribution was changed in another window or device" className="mt-8">
          <p>Choose which version to keep.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Button size="sm" variant="secondary" onClick={() => draft.resolveConflict('theirs')}>
              Use the other version
            </Button>
            <Button size="sm" variant="secondary" onClick={() => draft.resolveConflict('mine')}>
              Keep what’s on this screen
            </Button>
          </div>
        </Notice>
      )}

      {STEP_KEYS.map((key, index) => {
        const copy = STEP_COPY[key]
        const StepComponent = key === 'review' ? null : STEP_COMPONENTS[key]
        return (
          <section key={key} hidden={index !== stepIndex} aria-labelledby={`step-${key}`} className="step-enter mt-12">
            <p className="eyebrow">{copy.eyebrow}</p>
            <h2
              id={`step-${key}`}
              ref={(el) => {
                headingRefs.current[index] = el
              }}
              tabIndex={-1}
              className="display mt-3 text-4xl outline-none sm:text-5xl"
            >
              {copy.title}
            </h2>
            <p className="mt-4 max-w-prose text-[0.95rem] leading-relaxed text-grey">{copy.intro}</p>
            <div className="mt-10">
              {StepComponent ? (
                <StepComponent
                  payload={draft.payload}
                  setSection={draft.setSection}
                  category={contributor.category}
                  issues={issues}
                  media={mediaContext}
                />
              ) : (
                <ReviewStep payload={draft.payload} category={contributor.category} media={media} issues={issues} onEdit={goTo} />
              )}
            </div>
          </section>
        )
      })}

      <div className="mt-14 flex flex-col gap-4 border-t border-midnight-line pt-8">
        {submitError && <Notice tone="error">{submitError}</Notice>}
        {savedForLater && (
          <Notice tone="success" live>
            Your progress is saved. Open your invitation link again whenever you’re ready to continue.
          </Notice>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Button variant="ghost" onClick={() => goTo(stepIndex - 1)} disabled={stepIndex === 0}>
            ← Back
          </Button>
          <div className="flex flex-wrap items-center gap-3">
            {!isReview && (
              <Button variant="ghost" size="sm" onClick={() => void saveForLater()}>
                Save and finish later
              </Button>
            )}
            {isReview ? (
              <Button size="lg" onClick={() => void submit()} loading={submitting} disabled={Boolean(draft.conflict)}>
                {contribution.status === 'changes_requested' ? 'Send updated contribution' : 'Submit contribution'}
              </Button>
            ) : (
              <Button onClick={() => goTo(stepIndex + 1)}>
                {stepIndex === STEP_KEYS.length - 2 ? 'Review' : 'Continue'} →
              </Button>
            )}
          </div>
        </div>
        {uploading && <p className="text-right text-xs text-grey">Uploads continue while you move between steps.</p>}
      </div>
    </StudioShell>
  )
}
