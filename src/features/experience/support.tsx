import { Component, useEffect, useRef, useState, type ReactNode } from 'react'

let webgl: boolean | null = null

/**
 * 3D scenes run only where WebGL works and the visitor has not asked for a lighter page
 * (`?lite` in the URL, or Save-Data). Everything they show also exists as plain HTML.
 */
export function canRender3D() {
  if (webgl !== null) return webgl
  if (typeof window === 'undefined') return false
  const lite = new URLSearchParams(window.location.search).has('lite')
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData
  let ok = false
  if (!lite && !saveData) {
    try {
      const canvas = document.createElement('canvas')
      const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl')
      ok = Boolean(gl)
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    } catch {
      ok = false
    }
  }
  webgl = ok
  return ok
}

/** Caps device pixel ratio: sharp enough on retina screens without burning mobile GPUs. */
export const DPR: [number, number] = [1, 1.75]

/** Renders `fallback` if a 3D scene throws (lost context, driver bugs, failed shader). */
export class SceneBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}

/** True while the element is within `margin` of the viewport; used to mount canvases lazily. */
export function useNearViewport<T extends Element>(margin = '200px') {
  const ref = useRef<T>(null)
  const [near, setNear] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const observer = new IntersectionObserver(([entry]) => setNear(Boolean(entry?.isIntersecting)), { rootMargin: margin })
    observer.observe(el)
    return () => observer.disconnect()
  }, [margin])
  return [ref, near] as const
}
