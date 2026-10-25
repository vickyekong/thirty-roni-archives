import { useEffect, useRef, useState } from 'react'
import { baseMimeType } from '@shared/contribution'
import { Button } from '@/components/ui/Button'

const MAX_SECONDS = 5 * 60
const CANDIDATE_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg;codecs=opus', 'audio/webm']
const EXTENSIONS: Record<string, string> = { 'audio/webm': 'weba', 'audio/mp4': 'm4a', 'audio/ogg': 'ogg' }

type State =
  | { kind: 'idle' }
  | { kind: 'requesting' }
  | { kind: 'recording'; startedAt: number }
  | { kind: 'review'; file: File; url: string }
  | { kind: 'error'; message: string }

const formatDuration = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${Math.floor(seconds % 60)
    .toString()
    .padStart(2, '0')}`

/** Microphone access is requested only when the contributor presses “Record”. */
export function VoiceRecorder({ onRecorded }: { onRecorded: (file: File) => void }) {
  const [state, setState] = useState<State>({ kind: 'idle' })
  const [elapsed, setElapsed] = useState(0)
  const recorder = useRef<MediaRecorder | null>(null)
  const stream = useRef<MediaStream | null>(null)
  const chunks = useRef<Blob[]>([])

  const supported = typeof window !== 'undefined' && 'MediaRecorder' in window && !!navigator.mediaDevices?.getUserMedia

  const stopTracks = () => {
    stream.current?.getTracks().forEach((t) => t.stop())
    stream.current = null
  }

  useEffect(() => {
    if (state.kind !== 'recording') return
    const interval = window.setInterval(() => {
      const seconds = (Date.now() - state.startedAt) / 1000
      setElapsed(seconds)
      if (seconds >= MAX_SECONDS) recorder.current?.stop()
    }, 250)
    return () => window.clearInterval(interval)
  }, [state])

  useEffect(
    () => () => {
      if (recorder.current?.state === 'recording') recorder.current.stop()
      stopTracks()
    },
    [],
  )

  useEffect(() => {
    if (state.kind !== 'review') return
    return () => URL.revokeObjectURL(state.url)
  }, [state])

  const start = async () => {
    setState({ kind: 'requesting' })
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
      stream.current = media
      const mimeType = CANDIDATE_TYPES.find((t) => MediaRecorder.isTypeSupported(t))
      const rec = new MediaRecorder(media, mimeType ? { mimeType, audioBitsPerSecond: 96_000 } : undefined)
      chunks.current = []
      rec.ondataavailable = (event) => {
        if (event.data.size > 0) chunks.current.push(event.data)
      }
      rec.onstop = () => {
        stopTracks()
        const type = baseMimeType(rec.mimeType || mimeType || 'audio/webm')
        const blob = new Blob(chunks.current, { type })
        const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')
        const file = new File([blob], `voice-note-${stamp}.${EXTENSIONS[type] ?? 'weba'}`, { type })
        setState({ kind: 'review', file, url: URL.createObjectURL(blob) })
      }
      recorder.current = rec
      rec.start(1000)
      setElapsed(0)
      setState({ kind: 'recording', startedAt: Date.now() })
    } catch (error) {
      stopTracks()
      const denied = error instanceof DOMException && (error.name === 'NotAllowedError' || error.name === 'SecurityError')
      setState({
        kind: 'error',
        message: denied
          ? 'Microphone access was not allowed. You can enable it in your browser settings, or upload an audio file instead.'
          : 'We could not start the microphone on this device. You can upload an audio file instead.',
      })
    }
  }

  if (!supported) {
    return <p className="text-sm text-grey">Recording isn’t available in this browser, but you can upload an audio file above.</p>
  }

  return (
    <div className="rounded-xl border border-midnight-line bg-midnight-raised/60 p-4">
      {state.kind === 'idle' || state.kind === 'error' ? (
        <div className="flex flex-col gap-3">
          <Button variant="secondary" size="sm" onClick={() => void start()} className="self-start">
            <span aria-hidden="true" className="size-2 rounded-full bg-danger" /> Record a voice note
          </Button>
          <p className="text-xs leading-relaxed text-grey">
            Your browser will ask for microphone access when you press record. Up to {MAX_SECONDS / 60} minutes.
          </p>
          {state.kind === 'error' && (
            <p role="alert" className="text-sm text-danger">
              {state.message}
            </p>
          )}
        </div>
      ) : state.kind === 'requesting' ? (
        <p role="status" className="text-sm text-grey">
          Waiting for microphone permission…
        </p>
      ) : state.kind === 'recording' ? (
        <div className="flex flex-wrap items-center gap-4">
          <span className="inline-flex items-center gap-2 text-sm text-ivory" role="status" aria-live="off">
            <span aria-hidden="true" className="size-2.5 animate-pulse rounded-full bg-danger" />
            Recording <span className="tabular-nums text-grey">{formatDuration(elapsed)}</span>
          </span>
          <Button size="sm" onClick={() => recorder.current?.stop()}>
            Stop
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <audio controls src={state.url} className="w-full" preload="metadata">
            Your browser cannot play this recording.
          </audio>
          <div className="flex flex-wrap gap-3">
            <Button
              size="sm"
              onClick={() => {
                onRecorded(state.file)
                setState({ kind: 'idle' })
              }}
            >
              Use this recording
            </Button>
            <Button size="sm" variant="ghost" onClick={() => void start()}>
              Record again
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setState({ kind: 'idle' })}>
              Discard
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
