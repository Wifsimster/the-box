import { useCallback, useEffect, useRef, useState } from 'react'

// Webkit-prefixed surface kept around for older Safari/iOS — typed loosely
// so we don't pull in lib.dom.d.ts overrides just for this fallback path.
interface PrefixedFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}

interface PrefixedDocument extends Document {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  webkitFullscreenEnabled?: boolean
}

export interface UseFullscreenResult {
  // Native browser fullscreen state. Always false in the CSS fallback path.
  isFullscreen: boolean
  // True when the browser exposes a working Element.requestFullscreen on
  // arbitrary elements. iOS Safari (≤16, and ≤17 on iPhone for non-video
  // elements) reports false; the consumer should mount a CSS-only
  // immersive fallback in that case.
  isSupported: boolean
  // Combined state: native fullscreen OR CSS-immersive on unsupported
  // devices. Components should bind their "immersive UI" styling to this.
  isImmersive: boolean
  // CSS-only immersive flag. Consumers wire this to a `data-immersive`
  // attribute or `fixed inset-0` Tailwind variant.
  isCssImmersive: boolean
  enter: () => Promise<void>
  exit: () => Promise<void>
  toggle: () => Promise<void>
}

/**
 * Wraps the Fullscreen API with a CSS-only fallback for browsers that
 * refuse to put an arbitrary `<div>` into native fullscreen (iOS Safari,
 * historically). When native isn't available the hook still flips
 * `isImmersive`/`isCssImmersive` so the layout can pin itself to the
 * viewport via `position: fixed; inset: 0` instead.
 *
 * Focus return: callers should restore focus to the toggle button on
 * exit. We don't manage focus here because the toggle's lifecycle isn't
 * known to the hook (it can unmount on layout changes).
 */
export function useFullscreen(targetRef: React.RefObject<HTMLElement | null>): UseFullscreenResult {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isCssImmersive, setIsCssImmersive] = useState(false)

  // SSR-safe support detection. `document.fullscreenEnabled` reflects
  // both the API presence and any `<iframe allow="fullscreen">` policy.
  const isSupported =
    typeof document !== 'undefined' &&
    (document.fullscreenEnabled === true ||
      (document as PrefixedDocument).webkitFullscreenEnabled === true)

  // Track the previously focused element so the consumer can restore it
  // after exit. Stored in a ref to avoid re-renders.
  const prevFocusRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const onChange = () => {
      const native =
        document.fullscreenElement ??
        (document as PrefixedDocument).webkitFullscreenElement ??
        null
      setIsFullscreen(!!native)
    }
    document.addEventListener('fullscreenchange', onChange)
    document.addEventListener('webkitfullscreenchange', onChange)
    return () => {
      document.removeEventListener('fullscreenchange', onChange)
      document.removeEventListener('webkitfullscreenchange', onChange)
    }
  }, [])

  // While in CSS-immersive mode, lock body scroll so a stray two-finger
  // pan can't drag the page underneath the immersive layer.
  useEffect(() => {
    if (!isCssImmersive) return
    const html = document.documentElement
    const prev = html.style.overflow
    html.style.overflow = 'hidden'
    return () => {
      html.style.overflow = prev
    }
  }, [isCssImmersive])

  const enter = useCallback(async () => {
    prevFocusRef.current =
      typeof document !== 'undefined' && document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null
    const el = targetRef.current as PrefixedFullscreenElement | null
    if (el && isSupported) {
      try {
        if (el.requestFullscreen) {
          await el.requestFullscreen()
        } else if (el.webkitRequestFullscreen) {
          await el.webkitRequestFullscreen()
        }
        return
      } catch {
        // Native call rejected (user gesture missing, iframe policy, etc.).
        // Fall through to CSS immersive so the user still gets the wide view.
      }
    }
    setIsCssImmersive(true)
  }, [isSupported, targetRef])

  const exit = useCallback(async () => {
    if (isFullscreen) {
      try {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        } else {
          const d = document as PrefixedDocument
          if (d.webkitExitFullscreen) {
            await d.webkitExitFullscreen()
          }
        }
      } catch {
        // Ignore — `fullscreenchange` will reconcile state if it fires,
        // and the CSS fallback below covers the user-visible case.
      }
    }
    setIsCssImmersive(false)
    // Restore focus best-effort: the toggle that opened immersive mode
    // is the most likely active element to want focus back.
    const prev = prevFocusRef.current
    if (prev && document.contains(prev)) {
      prev.focus({ preventScroll: true })
    }
  }, [isFullscreen])

  const toggle = useCallback(async () => {
    if (isFullscreen || isCssImmersive) await exit()
    else await enter()
  }, [enter, exit, isFullscreen, isCssImmersive])

  return {
    isFullscreen,
    isSupported,
    isImmersive: isFullscreen || isCssImmersive,
    isCssImmersive,
    enter,
    exit,
    toggle,
  }
}
