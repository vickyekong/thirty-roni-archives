import { useEffect, useMemo, useState } from 'react'
import { supabase } from './supabase'

export type MediaRef = { id: string; bucket: string; storage_path: string }

const SIGNED_URL_SECONDS = 60 * 60
// Re-sign a little before expiry so long sessions never hold a dead URL.
const REUSE_FOR_MS = (SIGNED_URL_SECONDS - 5 * 60) * 1000

const cache = new Map<string, { url: string; at: number }>()
const keyOf = (m: Pick<MediaRef, 'bucket' | 'storage_path'>) => `${m.bucket}/${m.storage_path}`

/**
 * Batch-signs private storage objects. Storage RLS decides what the caller may sign:
 * curators can sign anything, viewers only published media they are allowed to see.
 */
export async function signMedia(items: MediaRef[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  const now = Date.now()
  const missing = new Map<string, MediaRef[]>()
  for (const item of items) {
    const hit = cache.get(keyOf(item))
    if (hit && now - hit.at < REUSE_FOR_MS) out[item.id] = hit.url
    else missing.set(item.bucket, [...(missing.get(item.bucket) ?? []), item])
  }
  await Promise.all(
    [...missing].map(async ([bucket, refs]) => {
      const { data } = await supabase.storage.from(bucket).createSignedUrls(
        refs.map((r) => r.storage_path),
        SIGNED_URL_SECONDS,
      )
      data?.forEach((signed, i) => {
        const ref = refs[i]
        if (ref && signed.signedUrl) {
          out[ref.id] = signed.signedUrl
          cache.set(keyOf(ref), { url: signed.signedUrl, at: now })
        }
      })
    }),
  )
  return out
}

export function forgetSignedUrl(ref: Pick<MediaRef, 'bucket' | 'storage_path'>) {
  cache.delete(keyOf(ref))
}

export function useSignedUrls(items: MediaRef[] | null | undefined) {
  const [urls, setUrls] = useState<Record<string, string>>({})
  const signature = useMemo(() => (items ?? []).map((m) => `${m.id}:${m.storage_path}`).join('|'), [items])
  useEffect(() => {
    if (!items?.length) return
    let active = true
    void signMedia(items).then((next) => {
      if (active) setUrls((prev) => ({ ...prev, ...next }))
    })
    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on content, not identity
  }, [signature])
  return urls
}

export const MEDIA_ACCEPT = {
  image: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'],
  video: ['video/mp4', 'video/quicktime', 'video/webm'],
  audio: ['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/webm', 'audio/ogg', 'audio/wav', 'audio/x-wav'],
} as const

export const MAX_ARCHIVE_BYTES = 50 * 1024 * 1024

export function mediaKindFor(mime: string): 'image' | 'video' | 'audio' | null {
  const base = mime.split(';')[0]?.trim().toLowerCase() ?? ''
  if ((MEDIA_ACCEPT.image as readonly string[]).includes(base)) return 'image'
  if ((MEDIA_ACCEPT.video as readonly string[]).includes(base)) return 'video'
  if ((MEDIA_ACCEPT.audio as readonly string[]).includes(base)) return 'audio'
  return null
}

export function extensionFor(file: File): string {
  const fromName = file.name.split('.').pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  return file.type.split('/')[1]?.replace(/[^a-z0-9]/g, '').slice(0, 5) || 'bin'
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return '—'
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/** Reads natural dimensions/duration locally so the archive can lay media out without layout shift. */
export function probeMedia(file: File, kind: 'image' | 'video' | 'audio') {
  return new Promise<{ width?: number; height?: number; duration?: number }>((resolve) => {
    const url = URL.createObjectURL(file)
    const done = (value: { width?: number; height?: number; duration?: number }) => {
      URL.revokeObjectURL(url)
      resolve(value)
    }
    if (kind === 'image') {
      const img = new Image()
      img.onload = () => done({ width: img.naturalWidth, height: img.naturalHeight })
      img.onerror = () => done({})
      img.src = url
    } else {
      const el = document.createElement(kind)
      el.preload = 'metadata'
      el.onloadedmetadata = () =>
        done({
          duration: Number.isFinite(el.duration) ? el.duration : undefined,
          ...(el instanceof HTMLVideoElement ? { width: el.videoWidth || undefined, height: el.videoHeight || undefined } : {}),
        })
      el.onerror = () => done({})
      el.src = url
    }
  })
}
