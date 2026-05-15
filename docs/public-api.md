# Public API — Streamer Kit

Read-only, opt-in, key-authenticated HTTP API for wiring The Box into
Twitch / YouTube chat bots and OBS overlays. Audience: integrators building
chat commands, overlays, and webhook consumers.

> This document is the grep-friendly reference. For a visual walkthrough with
> copy-paste snippets see [`streamer-kit.html`](./streamer-kit.html). The
> machine-readable contract is [`public-api.openapi.yaml`](./public-api.openapi.yaml).

Base URL: `https://the-box.battistella.ovh/api/public/v1` (prod) ·
`http://localhost:3000/api/public/v1` (dev).

All JSON responses use the envelope `{ success: boolean, data?, error? }`.
The one exception is `GET /streamers/:slug?format=chat`, which returns
`text/plain` (see below).

## Opt-in

The public API exposes **nothing** about a player until they opt in:

1. Profile → **Streamer Kit** → enable *Public Streamer Profile*.
2. Claim a `slug` (3–32 chars, `[a-z0-9_-]`). This is the public identifier;
   it is intentionally separate from the account username.
3. Generate an API key.

With the toggle off, every endpoint behaves as if the streamer does not exist
(`404 STREAMER_NOT_FOUND`).

## Authentication

Bearer API keys. Two modes:

| Prefix | Mode | Notes |
|--------|------|-------|
| `tb_pk_live_…` | live | Production key. |
| `tb_pk_test_…` | test | Test key. Behaves identically to a live key against read endpoints — use it while building against the [`boxbot` sandbox](#sandbox). |

```http
Authorization: Bearer tb_pk_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Keys are stored as SHA-256 hashes — the plaintext is shown **once** at
creation. Lost keys must be revoked and recreated.

**SSE exception.** `EventSource` cannot set headers, so the live endpoint
accepts the key as a `?key=` query parameter. Request logging redacts it.
Use the header form everywhere else.

### Keyed vs anonymous

| Endpoint | Anonymous | Keyed |
|----------|-----------|-------|
| `challenge/today`, `leaderboard/*` | allowed | allowed |
| `streamers/:slug`, `streamers/:slug/today` | allowed | allowed |
| `streamers/:slug/live` (SSE) | — | required |
| `webhooks` (all) | — | required (`webhooks:self` scope) |

A key never elevates access to another account's data. Holding a key
identifies *you*; reading `streamers/<someone-else>` returns the same public
data an anonymous caller sees.

## Rate limits

Fixed-window, per minute. Every response carries the IETF draft headers:

| Caller | Limit | `RateLimit-Limit` |
|--------|-------|-------------------|
| Anonymous (per IP) | 60 / min | `60` |
| Keyed (per key) | 600 / min | `600` |

```http
RateLimit-Limit: 600
RateLimit-Remaining: 597
RateLimit-Reset: 42
```

On exhaustion: `429` with `Retry-After` (seconds) and
`{ "error": { "code": "RATE_LIMITED" } }`.

SSE connections are capped at 3 concurrent per key.

## Sandbox

Building an overlay or chat command means staring at a streamer who is
mid-game — inconvenient if nobody is playing right now. The slug **`boxbot`**
is a permanent sandbox streamer you can hit any time:

```http
GET /api/public/v1/streamers/boxbot
GET /api/public/v1/streamers/boxbot/today
GET /api/public/v1/streamers/boxbot/live?key=tb_pk_test_…
```

`boxbot` runs a **10-minute loop**: ~7 minutes `in_progress` with a climbing
score, then ~3 minutes `completed`, then it repeats. It is a pure simulation —
not a real account — so it never appears on any leaderboard and its sessions
always carry `countsForLeaderboard: false`. The slug is reserved; no real user
can claim it.

Use it to develop and demo without waiting for a live session. All three
streamer endpoints work against it; webhooks do not fire for `boxbot` (no real
session completes), so test webhook *delivery* against your own account.

## Endpoints

### `GET /challenge/today`

Today's challenge metadata. No spoilers.

```json
{
  "success": true,
  "data": {
    "date": "2026-05-14",
    "totalScreenshots": 10,
    "scoringConfig": { "initialScore": 1000, "decayRate": 2 }
  }
}
```

`404 NO_CHALLENGE` if no challenge is scheduled.

### `GET /streamers/:slug`

Public profile by slug.

```json
{
  "success": true,
  "data": {
    "slug": "wifsim",
    "displayName": "Wifsim",
    "avatarUrl": "https://…",
    "currentStreak": 11,
    "longestStreak": 24,
    "totalScore": 184320,
    "gamesPlayed": 96,
    "today": { "score": 7820, "rank": 42, "completed": true }
  }
}
```

`today` is `null` when the streamer has not started today's challenge.
`today.rank` is `null` until the session is completed.

**Chat format.** Append `?format=chat` for a single-line, `text/plain`
response sized for Nightbot's `$(urlfetch json …)` — no JSON to parse:

```
🎮 @Wifsim · Today: 7,820 pts (#42) · Streak: 11d
```

Add `&emoji=0` to drop the leading emoji.

`404 STREAMER_NOT_FOUND` · `400 INVALID_SLUG`.

### `GET /streamers/:slug/today`

Today-only session state for an overlay. No answers, no current-screenshot id.

```json
{
  "success": true,
  "data": {
    "slug": "wifsim",
    "status": "in_progress",
    "session": {
      "score": 5210,
      "screenshotsDone": 6,
      "totalScreenshots": 10,
      "tier": 2,
      "startedAt": "2026-05-14T14:30:00.000Z",
      "completedAt": null,
      "rank": null,
      "countsForLeaderboard": true
    }
  }
}
```

`status` is `not_started` | `in_progress` | `completed`. `session` is `null`
when `not_started`. `countsForLeaderboard` is `false` for catch-up sessions.

### `GET /leaderboard/daily`

| Query | Default | Notes |
|-------|---------|-------|
| `date` | today | `YYYY-MM-DD` |
| `limit` | `10` | 1–100 |

```json
{
  "success": true,
  "data": [
    {
      "rank": 1,
      "slug": "wifsim",
      "displayName": "Wifsim",
      "avatarUrl": "https://…",
      "totalScore": 9120,
      "completedAt": "2026-05-14T14:41:00.000Z"
    }
  ]
}
```

`slug` is `null` for players who have not opted into a public profile —
their `displayName` is still listed (the leaderboard itself is public) but
they are not addressable via the API.

### `GET /leaderboard/monthly`

| Query | Default | Notes |
|-------|---------|-------|
| `month` | current | `YYYY-MM` |
| `limit` | `10` | 1–100 |

Same entry shape as daily, with `gamesPlayed` instead of `completedAt`.

### `GET /streamers/:slug/live` — SSE

Server-Sent Events stream for OBS overlays. Requires a key (query param).

```
GET /api/public/v1/streamers/wifsim/live?key=tb_pk_live_…
Accept: text/event-stream
```

Events:

| `event:` | When | `data` |
|----------|------|--------|
| `connected` | On open | `{ slug, pollIntervalMs }` |
| `screenshot.scored` | Score / progress changed | snapshot (see below) |
| `session.completed` | Session finished | snapshot |
| `heartbeat` | Every 15s, and on close | `{ ts }` or `{ reason }` |

Snapshot payload:

```json
{
  "status": "in_progress",
  "score": 5210,
  "screenshotsDone": 6,
  "rank": null,
  "startedAt": "2026-05-14T14:30:00.000Z",
  "completedAt": null
}
```

The server polls every 1.5s and only emits when state changes. The stream
auto-closes 30s after completion, after 30 min idle, or at a 2h hard cap.
Reconnect with stock `EventSource` auto-retry.

```js
const es = new EventSource(
  'https://the-box.battistella.ovh/api/public/v1/streamers/wifsim/live?key=' + KEY
)
es.addEventListener('screenshot.scored', (e) => {
  const { score, screenshotsDone } = JSON.parse(e.data)
  // update overlay
})
```

## Webhooks

Outbound `POST` callbacks. Manage them either with a key here, or visually
in Profile → Streamer Kit.

### `POST /webhooks`

Scope: `webhooks:self`.

```json
{
  "url": "https://hooks.example.com/the-box",
  "label": "Discord bot",
  "events": ["session.completed"]
}
```

`events` may be empty — an empty array subscribes to **all** event types.
`url` must be HTTPS and must survive the SSRF guard (no private / loopback /
metadata / link-local addresses, not The Box's own host).

Response (`201`) — the `secret` is shown **once**:

```json
{
  "success": true,
  "data": {
    "id": 7,
    "url": "https://hooks.example.com/the-box",
    "label": "Discord bot",
    "secretPrefix": "whsec_a1b2c",
    "events": ["session.completed"],
    "isActive": true,
    "createdAt": "2026-05-14T…",
    "lastDeliveredAt": null,
    "secret": "whsec_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
  }
}
```

Rejections: `400` with code `NOT_HTTPS`, `PRIVATE_IP`, `METADATA_IP`,
`BLOCKED_HOST`, `OWN_HOST`, `INVALID_URL`, or `TOO_MANY_WEBHOOKS` (cap: 10
active per account).

### `GET /webhooks`

Lists your webhooks (without secrets).

### `DELETE /webhooks/:id`

Revokes a webhook. Soft-delete — the row stays for delivery history.
`404 WEBHOOK_NOT_FOUND` · `409 ALREADY_REVOKED`.

### Delivery

Each event is delivered as:

```http
POST https://hooks.example.com/the-box
Content-Type: application/json
X-TheBox-Event: session.completed
X-TheBox-Delivery: 4821
X-TheBox-Event-Id: session.completed:9f3c…
X-TheBox-Signature: t=1715712000,v1=<hex hmac_sha256>
User-Agent: TheBox-Webhooks/1 (+https://thebox.app/docs/public-api)
```

Body:

```json
{
  "eventId": "session.completed:9f3c…",
  "event": "session.completed",
  "occurredAt": "2026-05-14T14:41:00.000Z",
  "slug": "wifsim",
  "data": {
    "score": 7820,
    "screenshotsFound": 9,
    "totalScreenshots": 10,
    "rank": 42,
    "challengeDate": "2026-05-14",
    "countsForLeaderboard": true
  }
}
```

Retries: 3 attempts, exponential backoff (15s / 60s / 240s). `2xx` = success,
`429` + `5xx` = retry, other `4xx` = permanent failure. After 3 failures the
delivery is marked `dead` and kept 24h for debugging. Redirects are **not**
followed.

**Idempotency.** De-duplicate on `eventId` (or the `X-TheBox-Event-Id`
header) — a retry sends the identical body.

### Verifying the signature

`X-TheBox-Signature` is `t=<unix_seconds>,v1=<hex>` where `v1` is
`HMAC_SHA256(secret, "<t>.<raw_body>")`. Verify on the **raw** body:

```js
import crypto from 'node:crypto'

function verify(rawBody, header, secret) {
  const parts = Object.fromEntries(header.split(',').map((p) => p.split('=')))
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${parts.t}.${rawBody}`)
    .digest('hex')
  // constant-time compare
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(parts.v1))
}
```

```python
import hmac, hashlib

def verify(raw_body: bytes, header: str, secret: str) -> bool:
    parts = dict(p.split("=", 1) for p in header.split(","))
    expected = hmac.new(
        secret.encode(), f'{parts["t"]}.'.encode() + raw_body, hashlib.sha256
    ).hexdigest()
    return hmac.compare_digest(expected, parts["v1"])
```

Signing secrets are encrypted at rest (AES-256-GCM) and decrypted per
delivery, so signatures survive a backend restart. The plaintext secret is
returned only once — at registration — and is otherwise unrecoverable; lose
it and you must revoke and re-register.

## Event types

| Event | Webhook | SSE | Status |
|-------|---------|-----|--------|
| `session.started` | ✅ | — | Live |
| `session.completed` | ✅ | ✅ | Live |
| `rank.changed` | ✅ | — | Live |
| `screenshot.scored` | — | ✅ | Live (SSE only) |

`session.started` fires once when a streamer begins their daily (not on
resume); its `data` is `{ sessionId, challengeDate, countsForLeaderboard }`.

`rank.changed` fires alongside `session.completed` for the player who just
finished a ranked session — a rank-only signal for bots that don't need the
full result. Its `data` is `{ rank, challengeDate }`. It is not dispatched for
catch-up sessions (those carry no leaderboard rank).

## Error codes

| Code | HTTP | Meaning |
|------|------|---------|
| `UNAUTHORIZED` | 401 | Missing / malformed / invalid key |
| `INSUFFICIENT_SCOPE` | 403 | Key lacks the required scope |
| `RATE_LIMITED` | 429 | Per-minute limit hit; see `Retry-After` |
| `STREAMER_NOT_FOUND` | 404 | No such slug, or profile not public |
| `INVALID_SLUG` | 400 | Slug fails the `[a-z0-9_-]{3,32}` pattern |
| `NO_CHALLENGE` | 404 | No challenge scheduled for the date |
| `WEBHOOK_NOT_FOUND` | 404 | No such webhook, or not yours |
| `TOO_MANY_WEBHOOKS` | 400 | 10 active webhooks already |
| `NOT_HTTPS` / `PRIVATE_IP` / `METADATA_IP` / `BLOCKED_HOST` / `OWN_HOST` / `INVALID_URL` | 400 | Webhook URL rejected by the SSRF guard |
| `VALIDATION_ERROR` | 400 | Request body / query failed validation |
| `INTERNAL_ERROR` | 500 | Server error |

## Versioning

The version is in the path (`/v1`). Changes within `v1` are additive only;
any breaking change ships as `/v2` alongside `/v1`. Pin to `v1`.
