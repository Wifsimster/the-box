import { useCallback, useEffect, useRef, useState } from 'react'
import { pushApi, PushApiError } from '@/lib/api/push'

export type PushPermissionStatus = 'default' | 'granted' | 'denied'

export interface UseWebPushState {
  // Browser supports the full Notifications + Push + ServiceWorker stack.
  // iOS Safari requires the user to install the PWA first; before that,
  // PushManager exists but `pushManager.subscribe` will reject.
  isSupported: boolean
  // True iff we're on iOS Safari outside an installed PWA. The card shows
  // an install hint instead of a non-functional toggle in this case. Also
  // implies `isSupported: false` so callers don't have to combine flags.
  requiresPwaInstall: boolean
  // The server has VAPID keys configured. When false the toggle should be
  // hidden — there's nothing the user can do about it.
  isServerConfigured: boolean | null
  permission: PushPermissionStatus
  // True when this browser already has an active subscription. Computed from
  // the live ServiceWorkerRegistration so it stays accurate across tabs.
  isSubscribed: boolean
  isLoading: boolean
  // Async operations the UI can call. Both throw `PushApiError` with a
  // stable `.code` so the card can render the right localized toast.
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
}

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  // iOS exposes navigator.standalone; the cross-platform check is the
  // display-mode media query, which Chrome/Edge also honor.
  const iosStandalone = (navigator as { standalone?: boolean }).standalone === true
  const matchesStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  return iosStandalone || matchesStandalone
}

function detectSupport(): boolean {
  if (typeof window === 'undefined') return false
  const hasStack =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!hasStack) return false
  // iOS only allows push from an installed PWA; treat the in-tab case as
  // unsupported so the card shows the install hint rather than a toggle that
  // will throw when the user clicks it.
  if (isIos() && !isStandalonePwa()) return false
  return true
}

// Convert a base64url-encoded VAPID key into the Uint8Array shape that
// PushManager.subscribe expects as `applicationServerKey`.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

function arrayBufferToBase64(buffer: ArrayBuffer | null): string {
  if (!buffer) return ''
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i] as number)
  return btoa(binary)
}

async function readExistingSubscription(): Promise<PushSubscription | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export function useWebPush(): UseWebPushState {
  const isSupported = detectSupport()
  const requiresPwaInstall = isIos() && !isStandalonePwa()
  const [isServerConfigured, setIsServerConfigured] = useState<boolean | null>(null)
  const [permission, setPermission] = useState<PushPermissionStatus>(
    typeof Notification !== 'undefined'
      ? (Notification.permission as PushPermissionStatus)
      : 'default',
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  // Synchronous re-entry guard. setIsLoading goes through React's state
  // queue, so a fast double-click can fire two subscribe() calls before the
  // disabled flag has rendered. The ref flips immediately.
  const inFlightRef = useRef(false)

  const refreshSubscription = useCallback(async () => {
    try {
      const sub = await readExistingSubscription()
      setIsSubscribed(sub !== null)
    } catch {
      setIsSubscribed(false)
    }
  }, [])

  // Probe both the server config and the current subscription state on mount.
  // Failures are non-fatal — the UI just stays in "not subscribed".
  useEffect(() => {
    if (!isSupported) {
      setIsServerConfigured(false)
      return
    }
    let cancelled = false
    void (async () => {
      try {
        const key = await pushApi.getVapidPublicKey()
        if (cancelled) return
        setIsServerConfigured(key !== null)
      } catch (err) {
        if (cancelled) return
        // Distinguish "server explicitly says not configured" (handled above
        // via null return) from a network error. On NETWORK_ERROR we leave
        // isServerConfigured as null so the card stays in "loading" rather
        // than vanishing — the next mount will retry.
        if (err instanceof PushApiError && err.code === 'NETWORK_ERROR') {
          setIsServerConfigured(null)
        } else {
          setIsServerConfigured(false)
        }
      }
      if (!cancelled) await refreshSubscription()
    })()
    return () => {
      cancelled = true
    }
  }, [isSupported, refreshSubscription])

  // Cross-tab and post-permission-change sync. If the user grants/blocks in
  // another tab, or subscribes/unsubscribes from a different tab, we want
  // this card to reflect reality without a hard refresh.
  useEffect(() => {
    if (!isSupported) return
    let cancelled = false

    const syncPermission = (): void => {
      if (cancelled) return
      setPermission(Notification.permission as PushPermissionStatus)
    }
    const syncAll = (): void => {
      syncPermission()
      void refreshSubscription()
    }

    window.addEventListener('visibilitychange', syncAll)
    window.addEventListener('focus', syncAll)

    let permissionStatus: PermissionStatus | null = null
    void (async () => {
      try {
        if (!('permissions' in navigator)) return
        permissionStatus = await navigator.permissions.query({
          name: 'notifications' as PermissionName,
        })
        if (cancelled) return
        permissionStatus.addEventListener('change', syncPermission)
      } catch {
        // Some browsers (older Firefox) reject the query for 'notifications';
        // visibilitychange + focus are still wired up so we're not blind.
      }
    })()

    return () => {
      cancelled = true
      window.removeEventListener('visibilitychange', syncAll)
      window.removeEventListener('focus', syncAll)
      permissionStatus?.removeEventListener('change', syncPermission)
    }
  }, [isSupported, refreshSubscription])

  const subscribe = useCallback(async () => {
    if (!isSupported) {
      throw new PushApiError('NOT_SUPPORTED', 'Push notifications not supported in this browser')
    }
    if (inFlightRef.current) return
    inFlightRef.current = true
    setIsLoading(true)
    try {
      const publicKey = await pushApi.getVapidPublicKey()
      if (!publicKey) {
        throw new PushApiError('SERVER_UNAVAILABLE', 'Push service is not configured')
      }

      // Permission prompt must be tied to the user gesture; this hook
      // expects to be called from a click handler.
      const next = (await Notification.requestPermission()) as PushPermissionStatus
      setPermission(next)
      if (next !== 'granted') {
        throw new PushApiError('PERMISSION_DENIED', 'User denied notification permission')
      }

      const reg = await navigator.serviceWorker.ready
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        // applicationServerKey accepts BufferSource at runtime; the lib types
        // narrow it to ArrayBuffer specifically, so cast through unknown.
        applicationServerKey: urlBase64ToUint8Array(publicKey) as unknown as ArrayBuffer,
      })

      const json = subscription.toJSON()
      const p256dh =
        json.keys?.p256dh ?? arrayBufferToBase64(subscription.getKey('p256dh'))
      const auth = json.keys?.auth ?? arrayBufferToBase64(subscription.getKey('auth'))

      try {
        await pushApi.subscribe({
          endpoint: subscription.endpoint,
          keys: { p256dh, auth },
          userAgent: navigator.userAgent,
        })
      } catch (err) {
        // Server rejected (cap reached, rate-limited, etc.). Roll the
        // browser-side subscription back so the user can try again later
        // without us holding a useless endpoint.
        try {
          await subscription.unsubscribe()
        } catch {
          // best-effort
        }
        throw err
      }
      setIsSubscribed(true)
    } finally {
      inFlightRef.current = false
      setIsLoading(false)
    }
  }, [isSupported])

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return
    if (inFlightRef.current) return
    inFlightRef.current = true
    setIsLoading(true)
    try {
      const sub = await readExistingSubscription()
      if (sub) {
        // Tell the server first; if it errors we still want to drop the
        // browser-side subscription so the UI doesn't get stuck "subscribed"
        // with a 410'd endpoint.
        try {
          await pushApi.unsubscribe(sub.endpoint)
        } catch (err) {
          if (typeof console !== 'undefined') {
            console.warn('push: server unsubscribe failed; continuing with browser-side', err)
          }
        }
        await sub.unsubscribe()
      }
      setIsSubscribed(false)
    } finally {
      inFlightRef.current = false
      setIsLoading(false)
    }
  }, [isSupported])

  return {
    isSupported,
    requiresPwaInstall,
    isServerConfigured,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  }
}
