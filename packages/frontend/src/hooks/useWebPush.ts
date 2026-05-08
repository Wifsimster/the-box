import { useCallback, useEffect, useState } from 'react'
import { pushApi } from '@/lib/api/push'

export type PushPermissionStatus = 'default' | 'granted' | 'denied'

export interface UseWebPushState {
  // Browser supports the full Notifications + Push + ServiceWorker stack.
  // iOS Safari requires the user to install the PWA first; Notification.permission
  // exists in the page but PushManager only inside the SW registration.
  isSupported: boolean
  // The server has VAPID keys configured. When false the toggle should be
  // hidden — there's nothing the user can do about it.
  isServerConfigured: boolean | null
  permission: PushPermissionStatus
  // True when this browser already has an active subscription. Computed from
  // the live ServiceWorkerRegistration so it stays accurate across tabs.
  isSubscribed: boolean
  isLoading: boolean
  // Async operations the UI can call.
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

function detectSupport(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
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
  if (!detectSupport()) return null
  const reg = await navigator.serviceWorker.ready
  return reg.pushManager.getSubscription()
}

export function useWebPush(): UseWebPushState {
  const isSupported = detectSupport()
  const [isServerConfigured, setIsServerConfigured] = useState<boolean | null>(null)
  const [permission, setPermission] = useState<PushPermissionStatus>(
    isSupported ? (Notification.permission as PushPermissionStatus) : 'default',
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)

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
      } catch {
        if (!cancelled) setIsServerConfigured(false)
      }
      try {
        const sub = await readExistingSubscription()
        if (!cancelled) setIsSubscribed(sub !== null)
      } catch {
        if (!cancelled) setIsSubscribed(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [isSupported])

  const subscribe = useCallback(async () => {
    if (!isSupported) throw new Error('push not supported')
    setIsLoading(true)
    try {
      const publicKey = await pushApi.getVapidPublicKey()
      if (!publicKey) throw new Error('server not configured')

      // Asking for permission must be tied to the user gesture; this hook
      // expects to be called from a click handler.
      const next = (await Notification.requestPermission()) as PushPermissionStatus
      setPermission(next)
      if (next !== 'granted') return

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

      await pushApi.subscribe({
        endpoint: subscription.endpoint,
        keys: { p256dh, auth },
        userAgent: navigator.userAgent,
      })
      setIsSubscribed(true)
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  const unsubscribe = useCallback(async () => {
    if (!isSupported) return
    setIsLoading(true)
    try {
      const sub = await readExistingSubscription()
      if (sub) {
        // Tell the server first; if it errors we still want to drop the
        // browser-side subscription so the UI doesn't get stuck "subscribed"
        // with a 410'd endpoint.
        try {
          await pushApi.unsubscribe(sub.endpoint)
        } catch {
          // Swallow — the unsubscribe below is what the user actually wanted.
        }
        await sub.unsubscribe()
      }
      setIsSubscribed(false)
    } finally {
      setIsLoading(false)
    }
  }, [isSupported])

  return {
    isSupported,
    isServerConfigured,
    permission,
    isSubscribed,
    isLoading,
    subscribe,
    unsubscribe,
  }
}
