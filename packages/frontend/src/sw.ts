/// <reference lib="WebWorker" />

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare const self: ServiceWorkerGlobalScope

precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

void self.skipWaiting()
self.addEventListener('activate', () => {
  void self.clients.claim()
})

registerRoute(
  new NavigationRoute(
    async ({ event }) => {
      try {
        return await fetch((event as FetchEvent).request)
      } catch {
        const cache = await caches.match('/index.html')
        return cache ?? Response.error()
      }
    },
    {
      denylist: [/^\/api/, /^\/socket\.io/, /^\/uploads/],
    },
  ),
)

registerRoute(
  ({ url }) => url.pathname.startsWith('/uploads/'),
  new CacheFirst({
    cacheName: 'screenshots',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
)

registerRoute(
  ({ url }) => url.pathname.startsWith('/locales/') && url.pathname.endsWith('.json'),
  new StaleWhileRevalidate({
    cacheName: 'i18n-locales',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 7 }),
    ],
  }),
)

registerRoute(
  ({ url, request }) =>
    request.method === 'GET' &&
    url.pathname.startsWith('/api/') &&
    !url.pathname.startsWith('/api/auth/'),
  new NetworkFirst({
    cacheName: 'api',
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 60 * 5 }),
    ],
  }),
)

interface PushPayload {
  type: string
  title: string
  body: string
  url?: string
  data?: Record<string, unknown>
}

const FALLBACK_BODY: Record<string, string> = {
  fr: 'Vous avez une nouvelle notification.',
  en: 'You have a new notification.',
}
const LOCALE_CACHE = 'app-state'
const LOCALE_KEY = '/__locale'
let cachedLocale: string | null = null

async function readPersistedLocale(): Promise<string> {
  if (cachedLocale) return cachedLocale
  try {
    const cache = await caches.open(LOCALE_CACHE)
    const res = await cache.match(LOCALE_KEY)
    if (res) {
      const text = (await res.text()).trim().slice(0, 8)
      if (text) {
        cachedLocale = text
        return text
      }
    }
  } catch {
  }
  return 'fr'
}

async function writePersistedLocale(locale: string): Promise<void> {
  cachedLocale = locale
  try {
    const cache = await caches.open(LOCALE_CACHE)
    await cache.put(
      LOCALE_KEY,
      new Response(locale, { headers: { 'Content-Type': 'text/plain' } }),
    )
  } catch {
  }
}

async function parsePushPayload(event: PushEvent): Promise<PushPayload> {
  if (!event.data) return fallbackPayload()
  try {
    const parsed = event.data.json() as Partial<PushPayload>
    if (parsed && typeof parsed.title === 'string' && typeof parsed.body === 'string') {
      return {
        type: typeof parsed.type === 'string' ? parsed.type : 'generic',
        title: parsed.title,
        body: parsed.body,
        url: typeof parsed.url === 'string' ? parsed.url : undefined,
        data: parsed.data,
      }
    }
  } catch {
  }
  return fallbackPayload()
}

async function fallbackPayload(): Promise<PushPayload> {
  const locale = await readPersistedLocale()
  return {
    type: 'generic',
    title: 'The Box',
    body: FALLBACK_BODY[locale] ?? FALLBACK_BODY.fr ?? 'You have a new notification.',
  }
}

function tagFor(payload: PushPayload): string {
  const id = (payload.data?.id ?? payload.data?.notificationId) as unknown
  if (typeof id === 'string' && id.length > 0) return `${payload.type}:${id}`
  if (typeof id === 'number') return `${payload.type}:${id}`
  return payload.type
}

self.addEventListener('push', (event: PushEvent) => {
  event.waitUntil(
    (async () => {
      const payload = await parsePushPayload(event)
      const options = {
        body: payload.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-64x64.png',
        tag: tagFor(payload),
        renotify: true,
        data: { url: payload.url ?? '/', ...(payload.data ?? {}) },
      } as NotificationOptions
      await self.registration.showNotification(payload.title, options)
    })(),
  )
})

interface PushSubscriptionChangeEvent extends ExtendableEvent {
  readonly newSubscription: PushSubscription | null
  readonly oldSubscription: PushSubscription | null
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

async function reSubscribe(): Promise<PushSubscription | null> {
  try {
    const res = await fetch('/api/push/vapid-public-key', { credentials: 'include' })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { publicKey?: string } }
    const key = json.data?.publicKey
    if (!key) return null
    return await self.registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key) as unknown as ArrayBuffer,
    })
  } catch {
    return null
  }
}

self.addEventListener('pushsubscriptionchange', (rawEvent) => {
  const event = rawEvent as PushSubscriptionChangeEvent
  event.waitUntil(
    (async () => {
      const newSub = event.newSubscription ?? (await reSubscribe())
      const oldSub = event.oldSubscription
      if (newSub) {
        const json = newSub.toJSON()
        const p256dh = json.keys?.p256dh
        const auth = json.keys?.auth
        if (p256dh && auth) {
          try {
            await fetch('/api/push/subscribe', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                endpoint: newSub.endpoint,
                keys: { p256dh, auth },
              }),
            })
          } catch {
          }
        }
      }
      if (oldSub && (!newSub || oldSub.endpoint !== newSub.endpoint)) {
        try {
          await fetch('/api/push/subscribe', {
            method: 'DELETE',
            credentials: 'include',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ endpoint: oldSub.endpoint }),
          })
        } catch {
        }
      }
    })(),
  )
})

function resolveSameOriginTarget(raw: string): string {
  try {
    const resolved = new URL(raw, self.location.origin)
    if (resolved.origin !== self.location.origin) return '/'
    return resolved.pathname + resolved.search + resolved.hash
  } catch {
    return '/'
  }
}

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close()
  const data = (event.notification.data ?? {}) as { url?: string }
  const target = resolveSameOriginTarget(data.url ?? '/')
  event.waitUntil(
    (async () => {
      const allClients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const existing = allClients.find((client) => 'focus' in client)
      if (existing) {
        await existing.focus()
        if ('navigate' in existing && existing.url !== new URL(target, self.location.origin).href) {
          try {
            await (existing as WindowClient).navigate(target)
          } catch {
          }
        }
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})

self.addEventListener('message', (event) => {
  const data = event.data as { type?: string; locale?: string } | null
  if (!data) return
  if (data.type === 'SET_LOCALE' && typeof data.locale === 'string' && data.locale) {
    void writePersistedLocale(data.locale)
  }
})
