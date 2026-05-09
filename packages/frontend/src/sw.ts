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

// Best-effort payload parse: even if the server sends a malformed payload (or
// none at all, which Apple does for VoIP-style "wake up" pushes), we still
// surface a generic notification so the user knows something happened.
function parsePushPayload(event: PushEvent): PushPayload {
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

function fallbackPayload(): PushPayload {
  return {
    type: 'generic',
    title: 'The Box',
    body: 'Vous avez une notification.',
  }
}

self.addEventListener('push', (event: PushEvent) => {
  const payload = parsePushPayload(event)
  // Coalesce: a second push with the same `tag` replaces the first instead
  // of stacking, which avoids a notification queue if the user hasn't opened
  // the app in a few days. `renotify` is widely supported in browsers but
  // missing from the lib.dom.d.ts NotificationOptions type, hence the cast.
  const options = {
    body: payload.body,
    icon: '/pwa-192x192.png',
    badge: '/pwa-64x64.png',
    tag: payload.type,
    renotify: true,
    data: { url: payload.url ?? '/', ...(payload.data ?? {}) },
  } as NotificationOptions
  event.waitUntil(self.registration.showNotification(payload.title, options))
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
      for (const client of allClients) {
        if ('focus' in client) {
          await client.focus()
          if ('navigate' in client && client.url !== new URL(target, self.location.origin).href) {
            try {
              await (client as WindowClient).navigate(target)
            } catch {
              // navigate() can reject for cross-origin or bfcache cases; the
              // focus is enough — user lands on whatever page was open.
            }
          }
          return
        }
      }
      await self.clients.openWindow(target)
    })(),
  )
})

// Allow the page to trigger an immediate activation when the user clicks the
// PWAUpdatePrompt "refresh" toast — registerType: 'prompt' relies on this.
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    void self.skipWaiting()
  }
})
