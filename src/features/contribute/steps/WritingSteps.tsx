import {
  BIRTH_YEAR,
  CATEGORY_QUESTION_KEYS,
  LIFE_STAGES,
  LIMITS,
  THIRTIETH_YEAR,
  type ContributionPayload,
  type ContributorCategory,
  type DatePrecision,
  type MessageVisibility,
  type NameVisibility,
  type SubmissionIssue,
} from '@shared/contribution'
import { useId } from 'react'
import { Checkbox, ChoiceGroup } from '@/components/ui/ChoiceGroup'
import { TextAreaField, TextField } from '@/components/ui/Field'
import {
  CATEGORY_INTRO,
  CATEGORY_QUESTIONS,
  LIFE_STAGE_LABELS,
  MEMORY_QUESTIONS,
  MESSAGE_VISIBILITY_COPY,
  NAME_VISIBILITY_COPY,
} from '../copy'
import { MediaUploader, type MediaContext } from '../media/MediaUploader'

export type SetSection = <S extends keyof ContributionPayload>(section: S, patch: Partial<ContributionPayload[S]>) => void

export type StepProps = {
  payload: ContributionPayload
  setSection: SetSection
  category: ContributorCategory
  issues: SubmissionIssue[]
  media: MediaContext
}

const issueFor = (issues: SubmissionIssue[], match: string) => issues.find((i) => i.message.includes(match))?.message ?? null

export function IntroductionStep({ payload, setSection, issues, media }: StepProps) {
  return (
    <div className="flex flex-col gap-8">
      <TextField
        label="Your full name"
        autoComplete="name"
        value={payload.introduction.fullName}
        maxLength={LIMITS.name}
        onValueChange={(fullName) => setSection('introduction', { fullName })}
        error={issueFor(issues, 'your name')}
      />
      <TextField
        label="Your relationship to Roni"
        hint="For example: her mother, her younger brother, her friend since secondary school."
        value={payload.introduction.relationship}
        maxLength={LIMITS.name}
        onValueChange={(relationship) => setSection('introduction', { relationship })}
        error={issueFor(issues, 'how you know')}
      />
      <MediaUploader
        context={media}
        purpose="profile_photo"
        title={
          <>
            A photograph of you <span className="ml-2 align-middle font-sans text-xs tracking-wide text-grey">optional</span>
          </>
        }
        hint="Shown beside your words, if you would like."
        addLabel="Add a photograph"
      />
    </div>
  )
}

export function MemoriesStep({ payload, setSection, category }: StepProps) {
  const memories = payload.memories
  return (
    <div className="flex flex-col gap-8">
      {(Object.keys(MEMORY_QUESTIONS) as (keyof typeof MEMORY_QUESTIONS)[]).map((key) => (
        <TextAreaField
          key={key}
          label={MEMORY_QUESTIONS[key]}
          optional
          value={memories[key]}
          maxLength={LIMITS.answer}
          onValueChange={(value) => setSection('memories', { [key]: value })}
        />
      ))}
      <div className="mt-4 flex flex-col gap-8 border-t border-midnight-line pt-10">
        <div>
          <p className="eyebrow">Just for you</p>
          <h3 className="mt-2 font-serif text-2xl text-ivory">{CATEGORY_INTRO[category]}</h3>
          <p className="mt-1 text-sm text-grey">All optional.</p>
        </div>
        {CATEGORY_QUESTION_KEYS[category].map((key) => (
          <TextAreaField
            key={key}
            label={CATEGORY_QUESTIONS[key]}
            optional
            value={payload.categoryAnswers[key] ?? ''}
            maxLength={LIMITS.answer}
            onValueChange={(value) => setSection('categoryAnswers', { [key]: value })}
          />
        ))}
      </div>
    </div>
  )
}

function TripleInput({
  legend,
  values,
  maxLength,
  placeholder,
  onChange,
}: {
  legend: string
  values: string[]
  maxLength: number
  placeholder: (i: number) => string
  onChange: (values: string[]) => void
}) {
  const id = useId()
  return (
    <fieldset className="flex flex-col gap-3">
      <legend className="mb-2 font-serif text-xl leading-snug text-ivory sm:text-[1.35rem]">
        {legend}
        <span className="ml-2 align-middle font-sans text-xs tracking-wide text-grey">optional</span>
      </legend>
      {[0, 1, 2].map((i) => (
        <div key={i} className="flex items-center gap-3">
          <span aria-hidden="true" className="w-5 font-serif text-lg text-gold">
            {i + 1}
          </span>
          <label htmlFor={`${id}-${i}`} className="sr-only">
            {`${legend} (${i + 1} of 3)`}
          </label>
          <input
            id={`${id}-${i}`}
            className="field-input"
            value={values[i] ?? ''}
            maxLength={maxLength}
            placeholder={placeholder(i)}
            onChange={(event) => {
              const next = [0, 1, 2].map((j) => (j === i ? event.target.value : (values[j] ?? '')))
              onChange(next)
            }}
          />
        </div>
      ))}
    </fieldset>
  )
}

export function CelebratingStep({ payload, setSection }: StepProps) {
  const c = payload.celebrating
  return (
    <div className="flex flex-col gap-10">
      <TripleInput
        legend="What three things make Roni special?"
        values={c.specialThings}
        maxLength={LIMITS.short}
        placeholder={() => ''}
        onChange={(specialThings) => setSection('celebrating', { specialThings })}
      />
      <TextAreaField
        label="What do you admire most about her?"
        optional
        value={c.admire}
        maxLength={LIMITS.answer}
        onValueChange={(admire) => setSection('celebrating', { admire })}
      />
      <TripleInput
        legend="How would you describe Roni in three words?"
        values={c.threeWords}
        maxLength={LIMITS.word}
        placeholder={(i) => ['First word', 'Second word', 'Third word'][i] ?? ''}
        onChange={(threeWords) => setSection('celebrating', { threeWords })}
      />
    </div>
  )
}

export function MessageStep({ payload, setSection }: StepProps) {
  return (
    <div className="flex flex-col gap-8">
      <TextAreaField
        label="What would you like Roni to know as she turns thirty?"
        optional
        rows={6}
        value={payload.message.turningThirty}
        maxLength={LIMITS.message}
        onValueChange={(turningThirty) => setSection('message', { turningThirty })}
      />
      <TextAreaField
        label="What is your biggest wish for her next decade?"
        optional
        value={payload.message.nextDecadeWish}
        maxLength={LIMITS.answer}
        onValueChange={(nextDecadeWish) => setSection('message', { nextDecadeWish })}
      />
    </div>
  )
}

const YEARS = Array.from({ length: THIRTIETH_YEAR - BIRTH_YEAR + 1 }, (_, i) => THIRTIETH_YEAR - i)

export function TimelineStep({ payload, setSection, issues }: StepProps) {
  const t = payload.timeline
  const yearId = useId()
  const precision = t.precision
  const needsYear = precision === 'specific_year' || precision === 'approximate_year'
  const yearError = issueFor(issues, 'Choose the year')
  const stageError = issueFor(issues, 'stage of life')

  return (
    <div className="flex flex-col gap-8">
      <ChoiceGroup<DatePrecision>
        legend="Approximately when did this memory happen?"
        hint="If you shared several memories, think of the one that matters most to you."
        name="precision"
        value={precision}
        onChange={(value) => setSection('timeline', { precision: value })}
        columns={2}
        choices={[
          { value: 'specific_year', label: 'I know the year' },
          { value: 'approximate_year', label: 'Around a certain year' },
          { value: 'life_stage', label: 'A stage of her life' },
          { value: 'unknown', label: 'I’m not sure' },
        ]}
      />

      {needsYear && (
        <div className="flex flex-col gap-2">
          <label htmlFor={yearId} className="font-serif text-xl text-ivory">
            {precision === 'specific_year' ? 'Which year?' : 'Roughly which year?'}
          </label>
          <select
            id={yearId}
            className="field-input max-w-56"
            value={t.year ?? ''}
            aria-invalid={yearError ? true : undefined}
            onChange={(event) => setSection('timeline', { year: event.target.value ? Number(event.target.value) : null })}
          >
            <option value="">Choose a year</option>
            {YEARS.map((year) => (
              <option key={year} value={year}>
                {precision === 'approximate_year' ? `Around ${year}` : year}
                {year === BIRTH_YEAR ? ' (the year she was born)' : ''}
              </option>
            ))}
          </select>
          {yearError && (
            <p role="alert" className="text-xs text-danger">
              {yearError}
            </p>
          )}
        </div>
      )}

      {precision === 'life_stage' && (
        <>
          <ChoiceGroup
            legend="Which stage of her life?"
            name="lifeStage"
            value={t.lifeStage}
            onChange={(lifeStage) => setSection('timeline', { lifeStage })}
            columns={2}
            choices={LIFE_STAGES.map((stage) => ({ value: stage, label: LIFE_STAGE_LABELS[stage] }))}
          />
          {stageError && (
            <p role="alert" className="-mt-4 text-xs text-danger">
              {stageError}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export function ConsentStep({ payload, setSection, issues }: StepProps) {
  const consent = payload.consent
  const explainId = useId()
  const consentError = issueFor(issues, 'permission')
  return (
    <div className="flex flex-col gap-10">
      <div className="flex flex-col gap-3">
        <p id={explainId} className="text-[0.95rem] leading-relaxed text-ivory/85">
          Approved contributions may appear in Roni’s private birthday experience, which only Roni and invited family can
          open. Nothing appears until the curator has reviewed it, and you can ask for your contribution to be removed at
          any time.
        </p>
        <Checkbox
          checked={consent.permission}
          onChange={(permission) => setSection('consent', { permission })}
          describedBy={explainId}
          invalid={Boolean(consentError)}
        >
          I confirm that what I am sharing is mine to share, and that anyone clearly shown in my photographs, video or
          recordings is happy for it to be included.
        </Checkbox>
        {consentError && (
          <p role="alert" className="text-xs text-danger">
            {consentError}
          </p>
        )}
      </div>

      <ChoiceGroup<NameVisibility>
        legend="How should your name appear?"
        name="nameVisibility"
        value={consent.nameVisibility}
        onChange={(nameVisibility) => setSection('consent', { nameVisibility })}
        choices={(Object.keys(NAME_VISIBILITY_COPY) as NameVisibility[]).map((value) => ({
          value,
          label: NAME_VISIBILITY_COPY[value].label,
          description: NAME_VISIBILITY_COPY[value].description,
        }))}
      />

      <ChoiceGroup<MessageVisibility>
        legend="Who may see your words?"
        name="messageVisibility"
        value={consent.messageVisibility}
        onChange={(messageVisibility) => setSection('consent', { messageVisibility })}
        choices={(Object.keys(MESSAGE_VISIBILITY_COPY) as MessageVisibility[]).map((value) => ({
          value,
          label: MESSAGE_VISIBILITY_COPY[value].label,
          description: MESSAGE_VISIBILITY_COPY[value].description,
        }))}
      />
    </div>
  )
}
