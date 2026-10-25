import {
  CATEGORY_QUESTION_KEYS,
  STEP_KEYS,
  type ContributionPayload,
  type ContributorCategory,
  type StepKey,
  type SubmissionIssue,
} from '@shared/contribution'
import type { ReactNode } from 'react'
import { Notice } from '@/components/ui/Notice'
import type { MediaItem } from '../api'
import {
  CATEGORY_QUESTIONS,
  LIFE_STAGE_LABELS,
  MEMORY_QUESTIONS,
  MESSAGE_VISIBILITY_COPY,
  NAME_VISIBILITY_COPY,
  STEP_COPY,
} from '../copy'

function Section({ step, onEdit, children }: { step: StepKey; onEdit: (step: number) => void; children: ReactNode }) {
  return (
    <section className="border-t border-midnight-line py-6">
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <h3 className="font-serif text-xl text-ivory">{STEP_COPY[step].label}</h3>
        <button
          type="button"
          onClick={() => onEdit(STEP_KEYS.indexOf(step))}
          className="cursor-pointer text-sm text-gold underline-offset-4 hover:underline"
        >
          Edit<span className="sr-only"> {STEP_COPY[step].label}</span>
        </button>
      </div>
      <div className="flex flex-col gap-3 text-[0.95rem] leading-relaxed text-ivory/85">{children}</div>
    </section>
  )
}

function Answer({ question, answer }: { question: string; answer: string }) {
  if (!answer.trim()) return null
  return (
    <div>
      <p className="text-sm text-grey">{question}</p>
      <p className="mt-1 whitespace-pre-line">{answer}</p>
    </div>
  )
}

const Empty = () => <p className="text-grey italic">Nothing added. That’s fine.</p>

export function ReviewStep({
  payload,
  category,
  media,
  issues,
  onEdit,
}: {
  payload: ContributionPayload
  category: ContributorCategory
  media: MediaItem[]
  issues: SubmissionIssue[]
  onEdit: (step: number) => void
}) {
  const p = payload
  const memoryAnswers = (Object.keys(MEMORY_QUESTIONS) as (keyof typeof MEMORY_QUESTIONS)[]).filter((k) => p.memories[k].trim())
  const categoryAnswers = CATEGORY_QUESTION_KEYS[category].filter((k) => p.categoryAnswers[k]?.trim())
  const special = p.celebrating.specialThings.filter((s) => s.trim())
  const words = p.celebrating.threeWords.filter((s) => s.trim())
  const count = (purpose: MediaItem['purpose']) => media.filter((m) => m.purpose === purpose).length

  const timeline = (() => {
    const t = p.timeline
    if (t.precision === 'specific_year' && t.year) return String(t.year)
    if (t.precision === 'approximate_year' && t.year) return `Around ${t.year}`
    if (t.precision === 'life_stage' && t.lifeStage) return LIFE_STAGE_LABELS[t.lifeStage]
    if (t.precision === 'unknown') return 'Not sure'
    return null
  })()

  return (
    <div className="flex flex-col">
      {issues.length > 0 && (
        <Notice tone="error" title="A few things before you submit" className="mb-6">
          <ul className="mt-1 flex flex-col gap-1">
            {issues.map((issue) => (
              <li key={issue.message}>
                <button
                  type="button"
                  className="cursor-pointer text-left underline underline-offset-2"
                  onClick={() => onEdit(STEP_KEYS.indexOf(issue.step))}
                >
                  {issue.message}
                </button>
              </li>
            ))}
          </ul>
        </Notice>
      )}

      <Section step="introduction" onEdit={onEdit}>
        <p>
          {p.introduction.fullName || <span className="text-grey italic">Name missing</span>}
          {p.introduction.relationship && <span className="text-grey"> · {p.introduction.relationship}</span>}
        </p>
        {count('profile_photo') > 0 && <p className="text-sm text-grey">Profile photograph added</p>}
      </Section>

      <Section step="memories" onEdit={onEdit}>
        {memoryAnswers.length + categoryAnswers.length === 0 ? (
          <Empty />
        ) : (
          <>
            {memoryAnswers.map((k) => (
              <Answer key={k} question={MEMORY_QUESTIONS[k]} answer={p.memories[k]} />
            ))}
            {categoryAnswers.map((k) => (
              <Answer key={k} question={CATEGORY_QUESTIONS[k]} answer={p.categoryAnswers[k] ?? ''} />
            ))}
          </>
        )}
      </Section>

      <Section step="celebrating" onEdit={onEdit}>
        {special.length + words.length === 0 && !p.celebrating.admire.trim() ? (
          <Empty />
        ) : (
          <>
            {special.length > 0 && <Answer question="Three things that make her special" answer={special.join(' · ')} />}
            <Answer question="What you admire most" answer={p.celebrating.admire} />
            {words.length > 0 && <Answer question="Roni in three words" answer={words.join(', ')} />}
          </>
        )}
      </Section>

      <Section step="message" onEdit={onEdit}>
        {!p.message.turningThirty.trim() && !p.message.nextDecadeWish.trim() ? (
          <Empty />
        ) : (
          <>
            <Answer question="As she turns thirty" answer={p.message.turningThirty} />
            <Answer question="Your wish for her next decade" answer={p.message.nextDecadeWish} />
          </>
        )}
      </Section>

      <Section step="media" onEdit={onEdit}>
        <p>
          {count('photo')} photograph{count('photo') === 1 ? '' : 's'} · {count('video') ? 'a video' : 'no video'} ·{' '}
          {count('voice') ? 'a voice note' : 'no voice note'} · {p.letter.body.trim() ? 'a letter' : 'no letter'}
        </p>
      </Section>

      <Section step="timeline" onEdit={onEdit}>
        {timeline ? <p>{timeline}</p> : <Empty />}
      </Section>

      <Section step="consent" onEdit={onEdit}>
        <p>{p.consent.permission ? 'Permission confirmed' : <span className="text-danger">Permission not yet confirmed</span>}</p>
        <p className="text-sm text-grey">
          {NAME_VISIBILITY_COPY[p.consent.nameVisibility].label} · Visible to: {MESSAGE_VISIBILITY_COPY[p.consent.messageVisibility].label}
        </p>
      </Section>
    </div>
  )
}
