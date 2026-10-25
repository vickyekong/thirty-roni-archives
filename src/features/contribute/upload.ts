import { MEDIA_RULES, MIME_EXTENSIONS, baseMimeType, formatBytes, type MediaPurpose } from '@shared/contribution'
import { ApiError, callContribute, type MediaItem } from './api'

const EXTENSION_MIME: Record<string, string> = Object.fromEntries(
  Object.entries(MIME_EXTENSIONS).map(([mime, ext]) => [ext, mime]),
)
EXTENSION_MIME.jpeg = 'image/jpeg'
EXTENSION_MIME.qt = 'video/quicktime'

/** Some browsers report an empty type for HEIC/MOV; fall back to the extension. */
export function detectMimeType(file: File): string {
  const declared = baseMimeType(file.type || '')
  if (declared) return declared === 'audio/x-m4a' ? 'audio/mp4' : declared
  const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
  return EXTENSION_MIME[ext] ?? 'application/octet-stream'
}

export function checkFile(file: File, purpose: MediaPurpose): string | null {
  const rule = MEDIA_RULES[purpose]
  const mime = detectMimeType(file)
  if (!rule.mimeTypes.includes(mime)) {
    const kinds = { image: 'a JPEG, PNG, WebP or HEIC photo', video: 'an MP4, MOV or WebM video', audio: 'an audio recording' }
    return `“${file.name}” isn’t supported here. Please choose ${kinds[rule.kind]}.`
  }
  if (file.size > rule.maxBytes)
    return `“${file.name}” is ${formatBytes(file.size)}. The limit is ${formatBytes(rule.maxBytes)}.`
  if (file.size === 0) return `“${file.name}” appears to be empty.`
  return null
}

const REENCODE_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const MAX_EDGE = 2800

/**
 * Re-encodes photos in the browser: limits the longest edge, honours EXIF orientation and
 * drops embedded metadata (including GPS location). HEIC and anything the browser cannot
 * decode is uploaded unchanged.
 */
export async function prepareImage(file: File): Promise<File> {
  const mime = detectMimeType(file)
  if (!REENCODE_TYPES.has(mime) || typeof createImageBitmap !== 'function') return file
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
    const width = Math.round(bitmap.width * scale)
    const height = Math.round(bitmap.height * scale)
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')
    if (!context) return file
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, width, height)
    context.drawImage(bitmap, 0, 0, width, height)
    bitmap.close()
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (!blob) return file
    const name = file.name.replace(/\.[^.]+$/, '') + '.jpg'
    return new File([blob], name, { type: 'image/jpeg', lastModified: file.lastModified })
  } catch {
    return file
  }
}

function putWithProgress(url: string, file: Blob, mimeType: string, onProgress: (fraction: number) => void, signal?: AbortSignal) {
  return new Promise<number>((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url)
    xhr.setRequestHeader('Content-Type', mimeType)
    xhr.setRequestHeader('x-upsert', 'false')
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => resolve(xhr.status)
    xhr.onerror = () => reject(new ApiError(0, 'network_error', 'The upload was interrupted.'))
    xhr.ontimeout = () => reject(new ApiError(0, 'network_error', 'The upload timed out.'))
    xhr.onabort = () => reject(new DOMException('Upload cancelled', 'AbortError'))
    signal?.addEventListener('abort', () => xhr.abort(), { once: true })
    xhr.send(file)
  })
}

export type UploadArgs = {
  token: string
  contributionId: string
  purpose: MediaPurpose
  file: File
  onProgress?: (fraction: number) => void
  signal?: AbortSignal
}

/**
 * 1. ask the edge function for a one-time signed upload URL
 * 2. PUT the bytes straight to private storage (retried on the same URL)
 * 3. ask the edge function to verify the stored file's signature and size
 * A failed upload is cleaned up so it does not count towards the contributor's limit.
 */
export async function uploadMedia({ token, contributionId, purpose, file, onProgress, signal }: UploadArgs): Promise<MediaItem> {
  const mimeType = detectMimeType(file)
  const prepared = await callContribute(
    'upload-url',
    token,
    { contributionId, purpose, fileName: file.name, mimeType, size: file.size },
    { signal },
  )

  try {
    let stored = false
    let lastStatus = 0
    for (let attempt = 0; attempt < 3 && !stored; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 800 * attempt))
      try {
        lastStatus = await putWithProgress(prepared.signedUrl, file, prepared.mimeType, (f) => onProgress?.(f * 0.95), signal)
      } catch (error) {
        if (signal?.aborted) throw error
        continue
      }
      // A 400/409 after a retry usually means the first attempt landed but its response was lost.
      stored = (lastStatus >= 200 && lastStatus < 300) || (attempt > 0 && (lastStatus === 400 || lastStatus === 409))
      if (!stored && lastStatus >= 400 && lastStatus < 500) break
    }
    if (!stored) throw new ApiError(lastStatus, 'upload_failed', 'The upload did not finish. Please try again.')

    const { media } = await callContribute('finalize-upload', token, { contributionId, mediaId: prepared.mediaId }, { signal })
    if (!media) throw new ApiError(500, 'upload_failed', 'The upload could not be confirmed. Please try again.')
    onProgress?.(1)
    return media
  } catch (error) {
    if (!(error instanceof ApiError && error.code === 'invalid_file')) {
      void callContribute('delete-media', token, { contributionId, mediaId: prepared.mediaId }).catch(() => {})
    }
    throw error
  }
}
