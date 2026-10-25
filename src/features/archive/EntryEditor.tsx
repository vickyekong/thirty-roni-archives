import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/Button'
import { TextAreaField, TextField } from '@/components/ui/Field'
import { Notice } from '@/components/ui/Notice'
import { Dialog } from '@/features/experience/ui'
import {
  isMilestone,
  kindLabel,
  LIMITS,
  saveEntry,
  validateDraft,
  validateFile,
  type Draft,
  type EntryKind,
  type NewFile,
  type Story,
  type StoryEntry,
} from './story'

const COPY: Record<EntryKind, { title: string; titleLabel: string; bodyLabel: string; bodyHint?: string }> = {
  memory: { title: 'A new memory', titleLabel: 'Title', bodyLabel: 'The story', bodyHint: 'As much or as little as you like.' },
  moment: { title: 'Photos & videos', titleLabel: 'Title', bodyLabel: 'A caption' },
  milestone: { title: 'A new milestone', titleLabel: 'What happened?', bodyLabel: 'Tell the story' },
  reflection: { title: 'A reflection', titleLabel: 'Title', bodyLabel: 'Your reflection' },
}

function blankDraft(kind: EntryKind): Draft {
  return { kind, title: '', body: '', year: isMilestone(kind) ? String(new Date().getFullYear()) : '', keep: [], altEdits: {}, added: [] }
}

function draftFrom(entry: StoryEntry): Draft {
  return { kind: entry.kind, title: entry.title, body: entry.body, year: entry.year ? String(entry.year) : '', keep: entry.mediaIds, altEdits: {}, added: [] }
}

const snapshot = (d: Draft) => JSON.stringify({ ...d, added: d.added.map((a) => [a.key, a.alt]) })

export function EntryEditor({
  kind,
  entry,
  story,
  urls,
  collectionId,
  userId,
  topSortOrder,
  onClose,
  onSaved,
}: {
  kind: EntryKind
  entry: StoryEntry | null
  story: Story
  urls: Record<string, string>
  collectionId: string
  userId: string
  topSortOrder: number
  onClose: () => void
  onSaved: (message: string) => void
}) {
  const [initial] = useState(() => (entry ? draftFrom(entry) : blankDraft(kind)))
  const [draft, setDraft] = useState(initial)
  const [errors, setErrors] = useState<ReturnType<typeof validateDraft>>({})
  const [fileErrors, setFileErrors] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)
  const added = useRef(draft.added)
  useEffect(() => {
    added.current = draft.added
  }, [draft.added])
  useEffect(() => () => added.current.forEach((a) => URL.revokeObjectURL(a.preview)), [])

  const copy = COPY[draft.kind]
  const milestone = isMilestone(draft.kind)
  const dirty = snapshot(draft) !== snapshot(initial)
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return
    const problems: string[] = []
    const next: NewFile[] = []
    for (const file of files) {
      const problem = validateFile(file)
      if (problem) problems.push(problem)
      else next.push({ key: crypto.randomUUID(), file, preview: URL.createObjectURL(file), alt: '' })
    }
    setFileErrors(problems)
    if (next.length) setErrors((e) => ({ ...e, media: undefined }))
    setDraft((d) => ({ ...d, added: [...d.added, ...next] }))
    if (fileRef.current) fileRef.current.value = ''
  }

  const removeAdded = (key: string) =>
    setDraft((d) => {
      const item = d.added.find((a) => a.key === key)
      if (item) URL.revokeObjectURL(item.preview)
      return { ...d, added: d.added.filter((a) => a.key !== key) }
    })

  const submit = async () => {
    const found = validateDraft(draft)
    setErrors(found)
    setFailure(null)
    if (Object.keys(found).length) {
      requestAnimationFrame(() => formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus())
      return
    }
    setSaving(true)
    try {
      await saveEntry({ draft, existing: entry, collectionId, userId, story, topSortOrder })
      onSaved(entry ? 'Your changes are saved.' : `${kindLabel(draft.kind)} added to your story.`)
    } catch (e) {
      setFailure(e instanceof Error ? e.message : 'Your entry could not be saved. Please try again.')
      setSaving(false)
    }
  }

  const canClose = () => saving ? false : !dirty || window.confirm('Discard what you have written?')

  return (
    <Dialog open onClose={onClose} canClose={canClose} title={entry ? `Edit: ${entry.title}` : copy.title}>
      <form
        ref={formRef}
        noValidate
        className="flex flex-col gap-6"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <div className="grid gap-x-4 gap-y-6 sm:grid-cols-[1fr_9rem]">
          <TextField
            label={copy.titleLabel}
            optional={draft.kind === 'moment'}
            value={draft.title}
            maxLength={LIMITS.title}
            onValueChange={(v) => set('title', v)}
            error={errors.title}
            autoComplete="off"
          />
          <TextField
            label="Year"
            optional={!milestone}
            value={draft.year}
            inputMode="numeric"
            maxLength={4}
            onValueChange={(v) => set('year', v.replace(/\D/g, ''))}
            error={errors.year}
          />
        </div>
        <TextAreaField
          label={copy.bodyLabel}
          hint={copy.bodyHint}
          optional={draft.kind !== 'reflection'}
          value={draft.body}
          maxLength={milestone ? LIMITS.milestoneBody : LIMITS.memoryBody}
          rows={draft.kind === 'reflection' ? 8 : 5}
          onValueChange={(v) => set('body', v)}
          error={errors.body}
        />

        {draft.kind !== 'reflection' && (
          <fieldset className="flex flex-col gap-3">
            <legend className="font-serif text-xl text-ivory">
              Photos & videos{draft.kind !== 'moment' && <span className="ml-2 align-middle font-sans text-xs tracking-wide text-grey">optional</span>}
            </legend>
            {(draft.keep.length > 0 || draft.added.length > 0) && (
              <ul className="grid gap-3 sm:grid-cols-2">
                {draft.keep.map((id) => {
                  const m = story.media[id]
                  if (!m) return null
                  return (
                    <MediaRow
                      key={id}
                      kind={m.kind === 'video' ? 'video' : 'image'}
                      src={urls[id]}
                      alt={draft.altEdits[id] ?? m.alt_text ?? ''}
                      onAlt={(v) => set('altEdits', { ...draft.altEdits, [id]: v })}
                      onRemove={() => set('keep', draft.keep.filter((k) => k !== id))}
                    />
                  )
                })}
                {draft.added.map((a) => (
                  <MediaRow
                    key={a.key}
                    kind={a.file.type.startsWith('video/') ? 'video' : 'image'}
                    src={a.preview}
                    alt={a.alt}
                    isNew
                    onAlt={(v) => set('added', draft.added.map((x) => (x.key === a.key ? { ...x, alt: v } : x)))}
                    onRemove={() => removeAdded(a.key)}
                  />
                ))}
              </ul>
            )}
            <div>
              <input
                ref={fileRef}
                type="file"
                multiple
                accept="image/jpeg,image/png,image/webp,image/heic,image/heif,video/mp4,video/quicktime,video/webm"
                className="sr-only"
                id="story-files"
                onChange={(e) => addFiles(e.target.files)}
              />
              <label htmlFor="story-files" className="inline-flex min-h-11 cursor-pointer items-center rounded-full border border-ivory/25 px-5 text-sm text-ivory hover:border-gold hover:text-gold-bright focus-within:outline-2">
                Choose photos or videos
              </label>
              <p className="mt-2 text-xs text-grey">Up to {LIMITS.files} per entry, 50 MB each. Only you can see them.</p>
            </div>
            {errors.media && (
              <p className="text-xs text-danger" role="alert">
                {errors.media}
              </p>
            )}
            {fileErrors.length > 0 && (
              <Notice tone="error">
                <ul>
                  {fileErrors.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </Notice>
            )}
            {entry && entry.mediaIds.some((m) => !draft.keep.includes(m)) && (
              <p className="text-xs text-gold">Removed photos and videos are deleted when you save.</p>
            )}
          </fieldset>
        )}

        {failure && <Notice tone="error">{failure}</Notice>}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button type="submit" loading={saving}>
            {saving ? (draft.added.length ? 'Uploading…' : 'Saving…') : entry ? 'Save changes' : 'Add to my story'}
          </Button>
          <Button variant="ghost" onClick={() => canClose() && onClose()} disabled={saving}>
            Cancel
          </Button>
        </div>
      </form>
    </Dialog>
  )
}

function MediaRow({
  kind,
  src,
  alt,
  isNew,
  onAlt,
  onRemove,
}: {
  kind: 'image' | 'video'
  src: string | undefined
  alt: string
  isNew?: boolean
  onAlt: (value: string) => void
  onRemove: () => void
}) {
  return (
    <li className="flex flex-col gap-2 rounded-xl border border-midnight-line p-2">
      <div className="relative aspect-[4/3] overflow-hidden rounded-lg bg-midnight">
        {src &&
          (kind === 'image' ? (
            <img src={src} alt="" className="h-full w-full object-cover" />
          ) : (
            <video src={src} muted playsInline preload="metadata" className="h-full w-full object-cover" aria-hidden="true" />
          ))}
        {isNew && <span className="absolute top-2 left-2 rounded-full bg-midnight/80 px-2 py-0.5 text-[0.625rem] tracking-[0.2em] text-gold uppercase">New</span>}
        {kind === 'video' && <span className="absolute right-2 bottom-2 rounded-full bg-midnight/80 px-2 py-0.5 text-[0.625rem] tracking-[0.2em] text-ivory uppercase">Video</span>}
      </div>
      <label className="flex flex-col gap-1 text-xs text-grey">
        {kind === 'image' ? 'Describe this photo (optional)' : 'Describe this video (optional)'}
        <input className="field-input min-h-10 py-2 text-sm" value={alt} maxLength={LIMITS.alt} onChange={(e) => onAlt(e.target.value)} />
      </label>
      <button type="button" onClick={onRemove} aria-label={kind === 'image' ? 'Remove this photo' : 'Remove this video'} className="min-h-9 cursor-pointer self-start rounded-full px-3 text-xs text-danger underline underline-offset-4">
        Remove
      </button>
    </li>
  )
}
