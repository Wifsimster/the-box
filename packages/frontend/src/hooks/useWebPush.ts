import { useCallback, useEffect, useRef, useState } from 'react'
import { pushApi, PushApiError } from '@/lib/api/push'

export type PushPermissionStatus = 'default' | 'granted' | 'denied'

export interface UseWebPushState {
  isSupported: boolean
  requiresPwaInstall: boolean
  isServerConfigured: boolean | null
  permission: PushPermissionStatus
  isSubscribed: boolean
  isLoading: boolean
  subscribe: () => Promise<void>
  unsubscribe: () => Promise<void>
}

function isIos(): boolean {
  if (typeof navigator === 'undefined') return false
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !('MSStream' in window)
}

function isStandalonePwa(): boolean {
  if (typeof window === 'undefined') return false
  const iosStandalone = (navigator as { standalone?: boolean }).standalone === true
  const matchesStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false
  return iosStandalone || matchesStandalone
}

function detectSupport(): boolean {
  if (typeof window === 'undefined') return false
  const hasStack =
    'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
  if (!hasStack) return false
  if (isIos() && !isStandalonePwa()) return false
  return true
}

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
  const [isServerConfigured, setIsServerConfigured] = useState<boolean | null>(
    isSupported ? null : false,
  )
  const [permission, setPermission] = useState<PushPermissionStatus>(
    typeof Notification !== 'undefined'
      ? (Notification.permission as PushPermissionStatus)
      : 'default',
  )
  const [isSubscribed, setIsSubscribed] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const inFlightRef = useRef(false)

  const refreshSubscription = useCallback(async () => {
    try {
      const sub = await readExistingSubscription()
      setIsSubscribed(sub !== null)
    } catch {
      setIsSubscribed(false)
    }
  }, [])

  useEffect(() => {
    if (!isSupported) return
    let cancelled = false
    void (async () => {
      try {
        const key = await pushApi.getVapidPublicKey()
        if (cancelled) return
        setIsServerConfigured(key !== null)
      } catch (err) {
        if (cancelled) return
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

      const next = (await Notification.requestPermission()) as PushPermissionStatus
      setPermission(next)
      if (next !== 'granted') {
        throw new PushApiError('PERMISSION_DENIED', 'User denied notification permission')
      }

      const reg = await navigator.serviceWorker.ready
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
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
        try {
          await subscription.unsubscribe()
        } catch {
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
