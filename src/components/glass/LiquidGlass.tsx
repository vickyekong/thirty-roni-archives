import { useEffect, useRef, useState, type ComponentPropsWithoutRef, type ElementType, type ReactNode } from 'react'
import { cn } from '@/lib/cn'
import {
  LiquidGlassContainer,
  SNAPSHOT_IGNORE_ATTRIBUTE,
  type LiquidGlassOptions,
} from '@/vendor/liquid-glass/container'

let supportCache: boolean | null = null

/**
 * The WebGL glass re-renders a page snapshot taken with html2canvas, which is costly.
 * Use it only where the device can afford it and the visitor has not asked for less.
 */
export function glassIsSupported() {
  if (supportCache !== null) return supportCache
  if (typeof window === 'undefined') return false
  const media = (query: string) => window.matchMedia?.(query).matches ?? false
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection
  supportCache =
    LiquidGlassContainer.isSupported() &&
    !media('(prefers-reduced-transparency: reduce)') &&
    !media('(forced-colors: active)') &&
    !connection?.saveData &&
    !new URLSearchParams(window.location.search).has('lite') &&
    (navigator.hardwareConcurrency ?? 4) >= 4
  return supportCache
}

type LiquidGlassProps<T extends ElementType> = {
  as?: T
  children?: ReactNode
  className?: string
  glass?: LiquidGlassOptions
} & Omit<ComponentPropsWithoutRef<T>, 'as' | 'children' | 'className'>

/**
 * Wraps content in a liquid-glass surface. Content is always rendered by React (and stays
 * accessible); the WebGL canvas is a decorative layer behind it. Until the shader is ready,
 * or when it is unsupported, a CSS `backdrop-filter` fallback is shown instead.
 */
export function LiquidGlass<T extends ElementType = 'div'>({
  as,
  children,
  className,
  glass,
  ...rest
}: LiquidGlassProps<T>) {
  const Component = (as ?? 'div') as ElementType
  const hostRef = useRef<HTMLElement>(null)
  const [ready, setReady] = useState(false)
  const optionsKey = JSON.stringify(glass ?? {})

  useEffect(() => {
    const host = hostRef.current
    if (!host || !glassIsSupported()) return
    let instance: LiquidGlassContainer | null = null
    let cancelled = false
    let poll = 0

    const mount = async () => {
      await document.fonts?.ready
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      if (cancelled) return
      LiquidGlassContainer.ensureFreshSnapshot(400)
      instance = new LiquidGlassContainer(JSON.parse(optionsKey) as LiquidGlassOptions)
      host.prepend(instance.element)
      const check = () => {
        if (cancelled || !instance) return
        if (instance.isReady) setReady(true)
        else poll = window.setTimeout(check, 120)
      }
      check()
    }
    void mount()

    const resize = new ResizeObserver(() => instance?.updateSizeFromDOM())
    resize.observe(host)
    const onWindowResize = () => instance?.updateSizeFromDOM()
    window.addEventListener('resize', onWindowResize)

    return () => {
      cancelled = true
      window.clearTimeout(poll)
      resize.disconnect()
      window.removeEventListener('resize', onWindowResize)
      instance?.destroy()
      setReady(false)
    }
  }, [optionsKey])

  return (
    <Component
      ref={hostRef}
      {...{ [SNAPSHOT_IGNORE_ATTRIBUTE]: '' }}
      data-glass={ready ? 'webgl' : 'css'}
      className={cn('relative isolate', !ready && 'glass-fallback', className)}
      {...rest}
    >
      {children}
    </Component>
  )
}
