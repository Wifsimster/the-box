# Web Push Notifications

The Box delivers browser push notifications (daily challenge, streak risk, etc.) over the W3C Web Push protocol. This doc covers the end-to-end lifecycle: VAPID setup, the wire contract, fan-out, reliability behavior, and how the service worker renders incoming pushes.

## Architecture

```
┌─────────────┐   subscribe     ┌──────────────┐   enqueue    ┌────────────┐
│  Frontend   │ ───────────────▶│ /api/push    │ ────────────▶│ pushQueue  │
│ (useWebPush │                 │  (Express)   │              │  (BullMQ)  │
│   + sw.ts)  │ ◀─ push event ──┤              │              └─────┬──────┘
└─────────────┘                 └──────────────┘                    │
       ▲                                                            ▼
       │                              ┌─────────────────────────────────┐
       │                              │ push.worker.ts                   │
       │                              │  • listActiveForUser            │
       │                              │  • Promise.allSettled fan-out    │
       │                              │  • web-push send (8s timeout)    │
       │                              │  • mark success / failure / 410  │
       │                              └─────────────┬────────────────────┘
       │                                            │
       │       FCM / Mozilla autopush / APNS        ▼
       └───────────────────────────────  push provider edge
```

## Layer map

| Layer | File | Role |
|---|---|---|
| Domain | `packages/backend/src/domain/services/push.service.ts` | `sendToUser(userId, payload)` — enqueues a fan-out job. |
| Infrastructure | `packages/backend/src/infrastructure/push/push-sender.ts` | `web-push` wrapper with 8s timeout and three-way failure classification. |
| Infrastructure | `packages/backend/src/infrastructure/repositories/push-subscription.repository.ts` | Subscription CRUD; all writes scoped by `(endpoint, user_id)`. |
| Infrastructure | `packages/backend/src/infrastructure/queue/queues.ts` | `pushQueue` definition (4 attempts, exponential backoff). |
| Infrastructure | `packages/backend/src/infrastructure/queue/workers/push.worker.ts` | BullMQ worker; concurrency 10. |
| Infrastructure | `packages/backend/src/infrastructure/queue/workers/push-fanout-logic.ts` | Per-user fan-out with `Promise.allSettled`. |
| Infrastructure | `packages/backend/src/infrastructure/queue/workers/prune-push-subscriptions-logic.ts` | Daily cron; hard-deletes dead rows >30 d old. |
| Presentation | `packages/backend/src/presentation/routes/push.routes.ts` | `GET /vapid-public-key`, `POST /subscribe`, `DELETE /subscribe`. |
| Frontend | `packages/frontend/src/hooks/useWebPush.ts` | Subscription lifecycle, cross-tab sync, iOS PWA detection. |
| Frontend | `packages/frontend/src/components/profile/PushNotificationCard.tsx` | Profile settings toggle. |
| Frontend | `packages/frontend/src/sw.ts` | Push event, click handler, `pushsubscriptionchange`, locale fallback. |
| DB | `packages/backend/migrations/20260517_push_subscriptions.ts` | Initial schema. |
| DB | `packages/backend/migrations/20260519_push_subscriptions_user_fk.ts` | Adds FK + `ON DELETE CASCADE`. |

## VAPID setup

Push deliveries are signed with a VAPID keypair so providers can rate-limit per app rather than per IP. Generate once per environment:

```bash
npm run vapid:generate -w @the-box/backend
```

Copy the three lines into the environment:

```
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:no-reply@the-box.battistella.ovh
```

When any of the three is missing:
- `pushService.isConfigured()` returns `false`.
- `GET /api/push/vapid-public-key` returns `503 PUSH_NOT_CONFIGURED`.
- The frontend hides `PushNotificationCard` (treats 503 as "feature off").
- `pushService.sendToUser` is a no-op (warns and returns `{ enqueued: false }`).

### Key rotation

Rotating VAPID keys invalidates every browser-side `applicationServerKey`, so the next send to each existing subscription returns 410 and the worker deactivates the row. Expect a one-time `pruned` spike. Plan a rotation by:

1. Generating new keys with `npm run vapid:generate`.
2. Deploying with the new key set.
3. Watching `prune-push-subscriptions` and the worker `pruned` counter for the spike to settle.
4. Users will silently re-subscribe on their next visit (the SW handles `pushsubscriptionchange`).

## Wire contract

### Frontend → backend

`POST /api/push/subscribe` (auth-required, rate-limited to 10/min/user):

```json
{
  "endpoint": "https://fcm.googleapis.com/fcm/send/<token>",
  "keys": { "p256dh": "...", "auth": "..." },
  "userAgent": "Mozilla/5.0 ..."
}
```

`endpoint` host must be on the allowlist in `push.routes.ts` (FCM, Mozilla autopush, Apple, Windows). Off-allowlist hosts get a 400.

`DELETE /api/push/subscribe` (auth-required, rate-limited to 30/min/user) — same body shape, `endpoint` only.

### Backend → browser (push payload)

Every payload that leaves `pushService.sendToUser` matches `PushPayload`:

```ts
interface PushPayload {
  type: string                 // discriminator, e.g. 'daily_challenge_ready'
  title: string                // localized at the call site
  body: string                 // localized at the call site
  url?: string                 // resolved as same-origin path on click
  data?: Record<string, unknown>
}
```

The SW uses `payload.type` (or `payload.data.id` if present) as the notification tag so events with the same id replace earlier ones, but distinct events don't accidentally overwrite each other.

## Reliability

### Fan-out

`pushService.sendToUser` does not send anything synchronously. It enqueues a `send-to-user` job on `pushQueue`. The worker:

1. Looks up active subscriptions with `pushSubscriptionRepository.listActiveForUser(userId)` (hits the partial `(user_id, is_active)` index).
2. Sends to each device with `Promise.allSettled` — one slow provider can't stall siblings.
3. Wraps every `webpush.sendNotification` call in an 8s `Promise.race` timeout.
4. Classifies each failure:
   - **gone** (404/410) — terminal. Row flipped to `is_active=false`. Counted as `pruned`.
   - **retryable** (timeout, 5xx, 429) — bookkeeping only; the job rethrows so BullMQ retries the *whole user* with exponential backoff (4 attempts, base delay 5 s).
   - **permanent** (other 4xx) — bookkeeping only; not retried.
5. The job succeeds if at least one device delivered, or if every failure was permanent. It fails (and retries) only if every attempted device returned a retryable failure.

### Per-user device cap

`POST /subscribe` rejects the new subscription with `429 PUSH_DEVICE_CAP_REACHED` once the user has 20 active rows. Re-subscribing the same browser (existing endpoint) bypasses the cap because the upsert just rebinds in place.

### Pruning

`prune-push-subscriptions` runs daily at 02:00 UTC via `importQueue`. It hard-deletes rows where `is_active = false` AND `last_failure_at < now() - 30 d` (or where `last_failure_at IS NULL`, which only happens for old rows that were deactivated before the column existed).

## Frontend behavior

### Hook (`useWebPush`)

Returns `{ isSupported, requiresPwaInstall, isServerConfigured, permission, isSubscribed, isLoading, subscribe, unsubscribe }`.

- `isSupported` is `false` on iOS Safari outside an installed PWA (push only works inside the standalone app there).
- `requiresPwaInstall` is the explicit "iOS, install required" flag — the card uses it to show an install hint instead of a non-functional toggle.
- Cross-tab synchronization: a `permissions.query({name: 'notifications'})` change listener plus `visibilitychange` / `focus` listeners keep `permission` and `isSubscribed` honest when the user toggles in another tab or grants/blocks in browser settings.
- A `useRef` re-entry guard prevents double-click double-subscribe.
- `subscribe()` rolls back the browser-side subscription on a server error (cap reached, etc.) so the user can try again later without holding a useless endpoint.

### Service worker (`sw.ts`)

- `push` handler: parses payload, picks tag via `data.id ?? type`, calls `showNotification`. On malformed/empty payloads (Apple sometimes sends content-less wake-up pushes) it falls back to a localized "you have a new notification" string. The current locale is persisted by the page via `SET_LOCALE` postMessage and cached in `caches.open('app-state')` so it survives SW restarts.
- `notificationclick` handler: same-origin guard on the click target — anything off-origin (or unparseable) falls back to `/`.
- `pushsubscriptionchange` handler: when the browser rotates an endpoint, the SW re-subscribes (fetching the VAPID key via `/api/push/vapid-public-key`) and posts the new endpoint to the backend. The old endpoint is unsubscribed server-side.

## Security

- Repository writes are all `WHERE endpoint = ? AND user_id = ?` so a session-authed caller cannot mutate another user's row.
- Endpoint hostnames are restricted to known push providers via Zod refinement on `POST /subscribe`.
- The notification click handler resolves `url` against `self.location.origin` and falls back to `/` if it's off-origin (closes a phishing pivot via spoofed payloads).
- Rate limiters on subscribe (10/min/user) and unsubscribe (30/min/user) blunt the obvious DoS / table-bloat angles.
- VAPID `private` key is read from `VAPID_PRIVATE_KEY` only — the generation script writes to stdout for one-time copy, do not commit `.env`.

## Operations cheat sheet

| Symptom | First check |
|---|---|
| Card never appears | `GET /api/push/vapid-public-key`. If 503, set `VAPID_*` env vars. |
| Card appears, toggle errors silently | Browser console for `PushApiError.code`. The card maps each code to a localized toast — see `toastKeyForError` in `PushNotificationCard.tsx`. |
| Push delivered to phone but not laptop | Look at the row in `push_subscriptions` for the laptop endpoint: `is_active=false` + `last_failure_status=410` means the browser dropped it; user needs to toggle off+on. |
| Sudden `pruned` spike | Did anything rotate the VAPID key? Match the timing against deploys. |
| Send latency growing | `push.worker.ts` log line `push fan-out complete` includes `attempted/succeeded/pruned/retryable`. A growing `retryable` means a provider is slow — consider raising `SEND_TIMEOUT_MS` carefully. |

## Triggering a push (for callers)

```ts
import { pushService } from '@/domain/services/push.service.js'

await pushService.sendToUser('user-id-here', {
  type: 'daily_challenge_ready',
  title: 'New challenge available',
  body: 'Your daily Box is ready.',
  url: '/play',
})
```

The call returns `{ enqueued: true, jobId }` immediately — actual delivery is best-effort and observable via BullMQ. Callers must already have the user's locale and produce localized copy at the call site (server-side i18n on payloads is a future tier).
