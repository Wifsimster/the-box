/// <reference lib="WebWorker" />

// Custom service worker for The Box (vite-plugin-pwa injectManifest mode).
// Replaces the previous generateSW config 1:1 for caching, then layers on
// the push + notificationclick handlers that generateSW can't host.

import { cleanupOutdatedCaches, precacheAndRoute } from 'workbox-precaching'
import { NavigationRoute, registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, StaleWhileRevalidate } from 'workbox-strategies'
import { ExpirationPlugin } from 'workbox-expiration'
import { CacheableResponsePlugin } from 'workbox-cacheable-response'

declare const self: ServiceWorkerGlobalScope

// Injected at build time by vite-plugin-pwa with the precache manifest.
precacheAndRoute(self.__WB_MANIFEST)
cleanupOutdatedCaches()

// SPA navigation fallback — same denylist as the previous generateSW config.
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

// Game screenshots — large images, immutable per URL, safe to serve from cache.
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

// i18n bundles — small JSON, fine to revalidate in the background.
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

// API GETs — try the network with a 4s budget, fall back to a recent cached
// response so the app stays usable through brief blips. Auth endpoints are
// excluded since stale auth state is worse than a clear failure.
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

// ---------------------------------------------------------------------------
// Web Push
// ---------------------------------------------------------------------------

interface PushPayload {
  type: string
  title: string
  body: string
  url?: string
  data?: Record<string, unknown>
}

// Locale-aware fallback strings. The page persists the active i18n language
// via `SET_LOCALE` postMessage; when the SW is woken cold by a push event
// the module-level cache is gone so we fall back to the Cache API entry.
// French is the project default and the last-resort fallback.
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
    // ignore — Cache API can fail in private mode, fall through to default
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
    // best-effort
  }
}

// Best-effort payload parse: even if the server sends a malformed payload (or
// none at all, which Apple does for VoIP-style "wake up" pushes), we still
// surface a generic notification so the user knows something happened.
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
    // fall through
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

// Pick a notification tag that coalesces correctly. Distinct events must NOT
// share a tag (the second one would silently replace the first); per-type
// coalescing is right when the server intends it (e.g. multiple
// 'streak_at_risk' nudges for the same day). When the payload carries a
// stable id in `data.id` we honor it; otherwise we fall back to the type.
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
      // Coalesce: a second push with the same `tag` replaces the first instead
      // of stacking. `renotify` re-alerts the user even when an existing
      // notification with the same tag is being replaced — supported by
      // Chrome/Edge/Firefox but missing from the lib.dom.d.ts type, hence
      // the cast.
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

// Browsers re-issue endpoints on their own schedule (Chrome rotates FCM
// tokens, Firefox refreshes after long offline periods). When that happens
// the SW gets a `pushsubscriptionchange` event — we re-subscribe with the
// stored VAPID key and tell the server about the new endpoint so the user
// keeps receiving pushes without having to toggle the card off and on.
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
            // best-effort — the next page mount will reconcile via the hook
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
          // best-effort
        }
      }
    })(),
  )
})

// Restrict click navigation to same-origin URLs: the payload arrives over
// the network and a compromised or spoofed sender could otherwise deliver
// an off-origin URL that lands the user on a phishing page styled as The
// Box. Anything off-origin (or unparseable) falls back to the app root.
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
      // Reuse an existing window if one is already on the same scope —
      // matches the manifest's launch_handler client_mode: navigate-existing.
      // Pick the first focusable client without awaiting per-iteration so the
      // search stays a pure synchronous find; the (loop-carried) focus +
      // navigate awaits then run once, in order, on that single client.
      const existing = allClients.find((client) => 'focus' in client)
      if (existing) {
        await existing.focus()
        if ('navigate' in existing && existing.url !== new URL(target, self.location.origin).href) {
          try {
            await (existing as WindowClient).navigate(target)
          } catch {
            // navigate() can reject for cross-origin or bfcache cases; the
            // focus is enough — user lands on whatever page was open.
          }
        }
        return
      }
      await self.clients.openWindow(target)
    })(),
  )
})

// Allow the page to trigger an immediate activation when the user clicks the
// PWAUpdatePrompt "refresh" toast — registerType: 'prompt' relies on this.
// Also accept SET_LOCALE from the page so push fallback notifications match
// the user's i18n setting; see PWAUpdatePrompt.tsx for the sender side.
self.addEventListener('message', (event) => {
  const data = event.data as { type?: string; locale?: string } | null
  if (!data) return
  if (data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
    return
  }
  if (data.type === 'SET_LOCALE' && typeof data.locale === 'string' && data.locale) {
    void writePersistedLocale(data.locale)
  }
})
