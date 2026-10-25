import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { MEDIA_RULES, formatBytes, type MediaPurpose } from '@shared/contribution'
import { Spinner } from '@/components/ui/Spinner'
import { cn } from '@/lib/cn'
import { ApiError, callContribute, type MediaItem } from '../api'
import { useUploadQueue } from './useUploadQueue'

const ACCEPT: Record<'image' | 'video' | 'audio', string> = {
  image: 'image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif',
  video: 'video/mp4,video/quicktime,video/webm,.mov',
  audio: 'audio/*,.m4a,.mp3,.wav',
}

export type MediaContext = {
  token: string
  contributionId: string
  media: MediaItem[]
  onMediaChange: (update: (media: MediaItem[]) => MediaItem[]) => void
  reportBusy: (purpose: MediaPurpose, busy: boolean) => void
}

export function MediaUploader({
  context,
  purpose,
  title,
  hint,
  addLabel,
  extra,
}: {
  context: MediaContext
  purpose: MediaPurpose
  title: ReactNode
  hint?: ReactNode
  addLabel: string
  extra?: (addFiles: (files: File[]) => void, remaining: number) => ReactNode
}) {
  const rule = MEDIA_RULES[purpose]
  const items = context.media.filter((m) => m.purpose === purpose)
  const inputRef = useRef<HTMLInputElement>(null)
  const headingId = useId()
  const [removing, setRemoving] = useState<string | null>(null)
  const [removeError, setRemoveError] = useState<string | null>(null)

  const uploads = useUploadQueue({
    token: context.token,
    contributionId: context.contributionId,
    purpose,
    existingCount: items.length,
    onUploaded: (media) => context.onMediaChange((all) => [...all.filter((m) => m.id !== media.id), media]),
  })

  const { reportBusy } = context
  useEffect(() => {
    reportBusy(purpose, uploads.busy)
  }, [reportBusy, purpose, uploads.busy])

  const remove = async (item: MediaItem) => {
    setRemoving(item.id)
    setRemoveError(null)
    try {
      await callContribute('delete-media', context.token, { contributionId: context.contributionId, mediaId: item.id })
      context.onMediaChange((all) => all.filter((m) => m.id !== item.id))
    } catch (error) {
      setRemoveError(error instanceof ApiError ? error.message : 'We could not remove that file. Please try again.')
    } finally {
      setRemoving(null)
    }
  }

  const isImage = rule.kind === 'image'

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-4">
      <div>
        <h3 id={headingId} className="font-serif text-xl text-ivory sm:text-[1.35rem]">
          {title}
        </h3>
        {hint && <p className="mt-1 text-sm leading-relaxed text-grey">{hint}</p>}
      </div>

      {(items.length > 0 || uploads.queue.length > 0) && (
        <ul className={cn('grid gap-3', isImage ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-1')}>
          {items.map((item) => (
            <li key={item.id} className="group relative overflow-hidden rounded-xl border border-midnight-line bg-midnight-raised">
              {isImage ? (
                item.previewUrl ? (
                  <img src={item.previewUrl} alt={item.fileName ?? 'Uploaded photograph'} className="aspect-[4/5] w-full object-cover" loading="lazy" />
                ) : (
                  <div className="grid aspect-[4/5] place-items-center p-3 text-center text-xs text-grey">{item.fileName ?? 'Photograph'}</div>
                )
              ) : (
                <div className="flex items-center gap-3 px-4 py-3 pr-28">
                  <span aria-hidden="true" className="text-gold">
                    {rule.kind === 'video' ? '▶' : '♪'}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm text-ivory">{item.fileName ?? 'Upload'}</span>
                    {item.size ? <span className="text-xs text-grey">{formatBytes(item.size)}</span> : null}
                  </span>
                </div>
              )}
              <span className="sr-only">Uploaded.</span>
              <button
                type="button"
                onClick={() => void remove(item)}
                disabled={removing === item.id}
                className={cn(
                  'absolute cursor-pointer rounded-full bg-midnight/85 px-3 py-1.5 text-xs text-ivory backdrop-blur transition-colors hover:text-danger focus-visible:opacity-100',
                  isImage ? 'top-2 right-2' : 'top-1/2 right-3 -translate-y-1/2',
                )}
                aria-label={`Remove ${item.fileName ?? 'this file'}`}
              >
                {removing === item.id ? 'Removing…' : 'Remove'}
              </button>
            </li>
          ))}
          {uploads.queue.map((upload) => (
            <li key={upload.localId} className="relative overflow-hidden rounded-xl border border-midnight-line bg-midnight-raised">
              {isImage && (
                <div className="aspect-[4/5] w-full">
                  {upload.localPreview && (
                    <img
                      src={upload.localPreview}
                      alt=""
                      className="size-full object-cover opacity-40"
                      onError={(event) => (event.currentTarget.style.display = 'none')}
                    />
                  )}
                </div>
              )}
              <div className={cn('flex flex-col gap-2 p-3', isImage && 'absolute inset-x-0 bottom-0 bg-midnight/80 backdrop-blur')}>
                <span className="truncate text-xs text-ivory">{upload.name}</span>
                {upload.state === 'error' ? (
                  <>
                    <span role="alert" className="text-xs leading-snug text-danger">
                      {upload.error}
                    </span>
                    <span className="flex gap-3 text-xs">
                      {upload.retryable && (
                        <button type="button" className="cursor-pointer text-gold underline underline-offset-2" onClick={() => uploads.retry(upload.localId)}>
                          Try again
                        </button>
                      )}
                      <button type="button" className="cursor-pointer text-grey underline underline-offset-2" onClick={() => uploads.cancel(upload.localId)}>
                        Dismiss
                      </button>
                    </span>
                  </>
                ) : (
                  <>
                    <div
                      className="h-1 overflow-hidden rounded-full bg-ivory/10"
                      role="progressbar"
                      aria-label={`Uploading ${upload.name}`}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-valuenow={Math.round(upload.progress * 100)}
                    >
                      <div className="h-full bg-gold transition-[width] duration-200" style={{ width: `${Math.max(4, upload.progress * 100)}%` }} />
                    </div>
                    <span className="flex items-center justify-between text-xs text-grey">
                      <span>{upload.state === 'preparing' ? 'Preparing…' : `${Math.round(upload.progress * 100)}%`}</span>
                      <button type="button" className="cursor-pointer underline underline-offset-2 hover:text-ivory" onClick={() => uploads.cancel(upload.localId)}>
                        Cancel
                      </button>
                    </span>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {removeError && (
        <p role="alert" className="text-sm text-danger">
          {removeError}
        </p>
      )}
      {uploads.rejections.length > 0 && (
        <ul role="alert" className="flex flex-col gap-1 text-sm text-danger">
          {uploads.rejections.map((r, i) => (
            <li key={i}>{r}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <input
          ref={inputRef}
          type="file"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          accept={ACCEPT[rule.kind]}
          multiple={rule.maxCount > 1}
          onChange={(event) => {
            if (event.target.files?.length) uploads.addFiles(event.target.files)
            event.target.value = ''
          }}
        />
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploads.remaining === 0}
          className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-dashed border-gold/50 px-5 text-sm text-ivory transition-colors hover:border-gold hover:bg-gold/[0.06] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <span aria-hidden="true" className="text-gold">
            +
          </span>
          {addLabel}
        </button>
        <span className="text-xs text-grey">
          {uploads.busy ? (
            <Spinner className="size-3.5" label="Uploading" />
          ) : rule.maxCount > 1 ? (
            `${uploads.remaining} of ${rule.maxCount} remaining · up to ${formatBytes(rule.maxBytes)} each`
          ) : (
            `Up to ${formatBytes(rule.maxBytes)}`
          )}
        </span>
      </div>
      {extra?.(uploads.addFiles, uploads.remaining)}
    </section>
  )
}
