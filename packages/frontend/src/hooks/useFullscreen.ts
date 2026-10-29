import { useCallback, useEffect, useRef, useState } from 'react'

interface PrefixedFullscreenElement extends HTMLElement {
  webkitRequestFullscreen?: () => Promise<void> | void
}

interface PrefixedDocument extends Document {
  webkitFullscreenElement?: Element | null
  webkitExitFullscreen?: () => Promise<void> | void
  webkitFullscreenEnabled?: boolean
}

export interface UseFullscreenResult {
  isFullscreen: boolean
  isSupported: boolean
  isImmersive: boolean
  isCssImmersive: boolean
  enter: () => Promise<void>
  exit: () => Promise<void>
  toggle: () => Promise<void>
}

export function useFullscreen(targetRef: React.RefObject<HTMLElement | null>): UseFullscreenResult {
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isCssImmersive, setIsCssImmersive] = useState(false)

  const isSupported =
    typeof document !== 'undefined' &&
    (document.fullscreenEnabled === true ||
      (document as PrefixedDocument).webkitFullscreenEnabled === true)

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
      }
    }
    setIsCssImmersive(false)
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
