import { useCallback, useEffect, useRef, useState } from 'react'
import { MEDIA_RULES, type MediaPurpose } from '@shared/contribution'
import { ApiError, type MediaItem } from '../api'
import { checkFile, prepareImage, uploadMedia } from '../upload'

export type QueuedUpload = {
  localId: string
  name: string
  file: File
  progress: number
  state: 'preparing' | 'uploading' | 'error'
  error: string | null
  /** False when the file itself was refused, so retrying the same bytes cannot succeed. */
  retryable: boolean
  localPreview: string | null
}

const CONCURRENCY = 2

/** Items that may still become uploads; refused files no longer take up a slot. */
const pendingCount = (queue: QueuedUpload[]) => queue.filter((i) => i.state !== 'error' || i.retryable).length

export function useUploadQueue({
  token,
  contributionId,
  purpose,
  existingCount,
  onUploaded,
}: {
  token: string
  contributionId: string
  purpose: MediaPurpose
  existingCount: number
  onUploaded: (media: MediaItem) => void
}) {
  const rule = MEDIA_RULES[purpose]
  const [queue, setQueue] = useState<QueuedUpload[]>([])
  const [rejections, setRejections] = useState<string[]>([])
  const controllers = useRef(new Map<string, AbortController>())
  const queueRef = useRef(queue)
  const onUploadedRef = useRef(onUploaded)

  useEffect(() => {
    queueRef.current = queue
  }, [queue])
  useEffect(() => {
    onUploadedRef.current = onUploaded
  }, [onUploaded])

  const patch = useCallback((localId: string, changes: Partial<QueuedUpload>) => {
    setQueue((items) => items.map((item) => (item.localId === localId ? { ...item, ...changes } : item)))
  }, [])

  const run = useCallback(
    async (item: QueuedUpload) => {
      const controller = new AbortController()
      controllers.current.set(item.localId, controller)
      try {
        patch(item.localId, { state: 'preparing', error: null, progress: 0 })
        const file = rule.kind === 'image' ? await prepareImage(item.file) : item.file
        patch(item.localId, { state: 'uploading' })
        const media = await uploadMedia({
          token,
          contributionId,
          purpose,
          file,
          signal: controller.signal,
          onProgress: (progress) => patch(item.localId, { progress }),
        })
        setQueue((items) => items.filter((i) => i.localId !== item.localId))
        if (item.localPreview) URL.revokeObjectURL(item.localPreview)
        onUploadedRef.current({ ...media, previewUrl: media.previewUrl ?? null })
      } catch (error) {
        if (controller.signal.aborted) return
        const message =
          error instanceof ApiError ? error.message : 'The upload did not finish. Please check your connection and try again.'
        const retryable = !(error instanceof ApiError && ['invalid_file', 'too_large', 'unsupported_type', 'limit_reached'].includes(error.code))
        patch(item.localId, { state: 'error', error: message, retryable })
      } finally {
        controllers.current.delete(item.localId)
      }
    },
    [contributionId, patch, purpose, rule.kind, token],
  )

  const pump = useCallback(
    (items: QueuedUpload[]) => {
      const active = controllers.current.size
      const waiting = items.filter((i) => i.state === 'preparing' && !controllers.current.has(i.localId))
      waiting.slice(0, Math.max(0, CONCURRENCY - active)).forEach((i) => void run(i))
    },
    [run],
  )

  useEffect(() => {
    pump(queue)
  }, [queue, pump])

  const addFiles = useCallback(
    (files: FileList | File[]) => {
      const list = Array.from(files)
      const problems: string[] = []
      const accepted: QueuedUpload[] = []
      let room = rule.maxCount - existingCount - pendingCount(queueRef.current)
      for (const file of list) {
        if (room <= 0) {
          problems.push(
            rule.maxCount === 1
              ? 'You can add one here. Remove the current one first to replace it.'
              : `You can add up to ${rule.maxCount}. “${file.name}” was not added.`,
          )
          continue
        }
        const problem = checkFile(file, purpose)
        if (problem) {
          problems.push(problem)
          continue
        }
        room--
        accepted.push({
          localId: crypto.randomUUID(),
          name: file.name,
          file,
          progress: 0,
          state: 'preparing',
          error: null,
          retryable: true,
          localPreview: rule.kind === 'image' && file.type && !file.type.includes('heic') ? URL.createObjectURL(file) : null,
        })
      }
      setRejections(problems)
      if (accepted.length) setQueue((items) => [...items, ...accepted])
    },
    [existingCount, purpose, rule.kind, rule.maxCount],
  )

  const retry = useCallback(
    (localId: string) => patch(localId, { state: 'preparing', error: null, progress: 0, retryable: true }),
    [patch],
  )

  const cancel = useCallback((localId: string) => {
    controllers.current.get(localId)?.abort()
    setQueue((items) => {
      const item = items.find((i) => i.localId === localId)
      if (item?.localPreview) URL.revokeObjectURL(item.localPreview)
      return items.filter((i) => i.localId !== localId)
    })
  }, [])

  useEffect(() => {
    const active = controllers.current
    return () => {
      active.forEach((c) => c.abort())
      queueRef.current.forEach((i) => i.localPreview && URL.revokeObjectURL(i.localPreview))
    }
  }, [])

  return {
    queue,
    rejections,
    addFiles,
    retry,
    cancel,
    remaining: Math.max(0, rule.maxCount - existingCount - pendingCount(queue)),
    busy: queue.some((i) => i.state !== 'error'),
  }
}
