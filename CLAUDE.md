# The Box - AI Assistant Guide

## Project Overview

"The Box" is a gaming screenshot guessing application where players identify video games from screenshots. The classic mode is a daily challenge with tiered difficulty, power-ups/hints, achievements, daily login rewards, tournaments, and live leaderboards with real-time updates. The app also ships a second game mode (**Geo Mode** – pinpoint where a screenshot was taken on a game map), a **premium subscription** tier, a **referral** program, **web push** notifications, and a key-authenticated **public API / streamer kit** with outbound webhooks.

## Tech Stack

- **Frontend**: React 19 + Vite 7 + TypeScript + TailwindCSS v4 + Zustand + i18next + react-router-dom 7
- **Backend**: Node.js 24 + Express 5 + Knex.js + Kysely + Socket.io 4 (Clean Architecture)
- **Database**: PostgreSQL 16 (via Docker)
- **Authentication**: Better Auth (session-based, email/password) + TOTP two-factor and passkeys
- **Job Queue**: BullMQ + Redis (imports, daily challenge, geo ingestion pipeline, push fan-out, emails, webhook delivery, leaderboard payouts)
- **Payments**: Stripe (premium subscription + lifetime supporter, Checkout + Billing Portal + webhooks)
- **Web Push**: W3C Web Push via VAPID, rendered by the PWA service worker
- **Email**: Resend (password reset, lifecycle / re-engagement)
- **Maps (Geo Mode)**: Leaflet tile rendering over ingested game maps
- **Screenshot Viewer**: Embla Carousel (`ScreenshotViewer` shows the current screenshot with prev/next pre-loaded)
- **Decorative 3D**: Three.js / React Three Fiber (used only by `CubeBackground` on the home page)
- **Animation / UI**: Framer Motion, Radix UI primitives, shadcn/ui, Lucide icons
- **Forms**: React Hook Form + Zod
- **Validation**: Zod (frontend and backend)
- **Analytics**: GoatCounter (privacy-friendly) + Koe feedback widget (HMAC identity)
- **Logging**: Pino (pino-pretty in dev)
- **Marketing**: Remotion (`@the-box/marketing-video` package) for rendered promo videos
- **Testing**: Node test runner (unit) + Playwright (E2E, incl. a11y & visual-regression specs)
- **Monorepo**: npm workspaces (`types`, `backend`, `frontend`, `marketing-video`)

## Project Structure

```
the-box/
├── package.json              # Root workspace config
├── compose.yml               # Production: full stack with Traefik + db-backup
├── compose.local.yml         # Development: PostgreSQL + Redis only
├── Dockerfile                # Multi-stage Alpine build (port 80)
├── docker-entrypoint.sh      # Runs migrations then starts app
├── commitlint.config.js      # Conventional commits rules
├── .husky/                   # commit-msg validation
├── .github/workflows/        # release, security review, GitHub Pages (docs/*.html)
├── .claude/                  # Local Claude Code config
├── AGENT.md                  # French autonomous-agent brief (read before automated edits)
├── tasks/                    # Task PRDs (markdown + HTML)
├── docs/                     # architecture, api, authentication, game-flow, database,
│                             # realtime, geo-mode, billing-stripe, push, public-api, ...
├── scripts/                  # db-backup helpers
├── secrets/                  # Docker secret mounts (gitkeep only)
├── backups/                  # DB backup volume
├── uploads/                  # Screenshot storage volume
└── packages/
    ├── types/                # @the-box/types - shared TypeScript types
    │   └── src/index.ts      # All domain types exported here
    ├── marketing-video/      # @the-box/marketing-video - Remotion promo compositions
    ├── backend/              # @the-box/backend - Express API (Clean Architecture)
    │   ├── src/
    │   │   ├── index.ts            # Entrypoint (HTTP + Socket + workers)
    │   │   ├── config/             # env.ts, billing.ts (Stripe price map), themes.ts
    │   │   ├── domain/services/    # Pure business logic (no infra deps)
    │   │   │   ├── achievement / admin / auth / daily-login / user
    │   │   │   ├── fuzzy-match.service.ts          # Game name matching
    │   │   │   ├── game / leaderboard / job
    │   │   │   ├── geo-*.service.ts                # consensus, contributor, game,
    │   │   │   │                                   # metadata, reward, scoring, tile-url
    │   │   │   ├── billing / referral / rewards / push
    │   │   │   ├── sandbox.service.ts              # `boxbot` public-API demo streamer
    │   │   │   ├── webhook-dispatch / webhook-signer
    │   │   │   └── display-name-safety, evening-nudge-copy
    │   │   ├── infrastructure/
    │   │   │   ├── auth/           # Better Auth (+ 2FA / passkey)
    │   │   │   ├── crypto/         # secret encryption at rest
    │   │   │   ├── database/       # Knex + Kysely connection
    │   │   │   ├── email/          # Resend client + templates
    │   │   │   ├── logger/         # Pino
    │   │   │   ├── push/           # Web Push (VAPID) sender
    │   │   │   ├── queue/          # BullMQ connection, queues.ts, workers/
    │   │   │   ├── redis/          # Redis client
    │   │   │   ├── repositories/   # ~30 Knex/Kysely repos (game, challenge, geo-*,
    │   │   │   │                   # subscription, reward, webhook, api-key, push-…)
    │   │   │   ├── stripe/         # Stripe client
    │   │   │   └── socket/         # Socket.io setup
    │   │   ├── presentation/
    │   │   │   ├── routes/         # achievement, admin, auth, daily-login, game,
    │   │   │   │                   # leaderboard, user, geo, geo-fetch, billing,
    │   │   │   │                   # billing-webhook, push, referral, rewards,
    │   │   │   │                   # public (+ public-sse), streamer-keys, koe,
    │   │   │   │                   # og (OpenGraph images), screenshot-report
    │   │   │   └── middleware/     # auth, validation, request logging, rate limit
    │   │   └── tools/              # screenshot-fetcher (RAWG) + steam-screenshot-fetcher
    │   ├── migrations/             # Knex TS migrations (YYYYMMDD_name.ts)
    │   ├── seeds/                  # DB seed files (incl. geo seed)
    │   ├── scripts/                # e2e-seed, stripe-check, generate-vapid, utilities
    │   ├── data/                   # JSON seed data
    │   └── knexfile.ts
    └── frontend/                   # @the-box/frontend - React SPA (+ PWA)
        ├── src/
        │   ├── main.tsx
        │   ├── App.tsx             # Router + providers
        │   ├── sw.ts               # PWA / push service worker
        │   ├── components/         # achievement, admin, backgrounds, daily-login,
        │   │                       # game, geo, history, home, layout, onboarding,
        │   │                       # pricing, profile, pwa, rewards, security, ui
        │   ├── pages/              # ~23 route pages (Home, Game, Leaderboard, Profile,
        │   │                       # PublicProfile, Admin, History, GeoPlay,
        │   │                       # GeoContribute, Pricing, SecuritySettings,
        │   │                       # TwoFactorChallenge, FAQ, Contact, Legal, Auth…)
        │   ├── hooks/              # useAuth, useGameGuess, useWebPush, useGeoHealth,
        │   │                       # useGeoRunPolling, useFullscreen, useReferralCapture…
        │   ├── lib/                # utilities, API client (incl. koe), i18n, analytics
        │   ├── services/           # guessSubmission, leaderboard (client-side logic)
        │   ├── stores/             # Zustand: auth, game, achievement, dailyLogin,
        │   │                       # admin, billing, geo, geoFetch, geoFreePlay, rewards
        │   ├── utils/
        │   └── types/              # Frontend-only types
        ├── e2e/                    # Playwright specs (auth, daily-game, leaderboard,
        │                           # geo-*, billing, referral, rewards, streamer-kit,
        │                           # a11y-smoke, visual-regression, …)
        ├── public/locales/         # i18n translations (en, fr)
        ├── vite.config.ts
        ├── playwright.config.ts
        └── components.json         # shadcn config
```

## Features

**Classic mode**
- **Daily Challenges** with tiered difficulty (Easy → Hard)
- **Per-Screenshot Countdown Timer** – 45s per screenshot (`tiers.time_limit_seconds`, exposed via `ScreenshotResponse.timeLimitSeconds`); running out is a permanent miss (`timed_out`). Time is a per-position active-time budget (`PositionState.timeSpentMs`) that pauses on navigation and resumes on return, so skipping away and back can't reset it
- **Catch-Up Mode** – play missed challenges from the last 7 days (doesn't count for leaderboard)
- **Hints / Power-ups** – reveal release year, developer, publisher; timer extensions
- **Achievements** (including beginner-tier and mastery/account-age milestones)
- **Daily Login Rewards** with streaks (UTC boundaries, streak-freeze) and calendar display
- **Reward grants / chests** – day-7 chest and other reward grants (`rewards` store + routes)
- **Live Leaderboards** – daily and monthly, Socket.io real-time updates, periodic payouts
- **Tournaments** – weekly + monthly, created/closed by scheduled jobs

**Geo Mode**
- **Geo Play** – pinpoint where a screenshot was taken on the game's map (Leaflet); scoring by distance
- **Geo Contribute** – eligible players (min days played) place/confirm pins; consensus service resolves ground truth
- **Ingestion pipeline** – BullMQ workers import maps & screenshots from many sources (RAWG, Steam, Fandom, Fextralife, StrategyWiki, MapGenie/Wand, Wikidata, registry); admin Geo-Fetch panel drives it. See `docs/geo-mode.md`

**Account & monetization**
- **Premium / Lifetime Supporter** – Stripe Checkout + Billing Portal, premium-only features. See `docs/billing-stripe.md`
- **Referrals** – invite codes, capture on signup, reward announcements
- **Two-Factor Auth & Passkeys** – TOTP + WebAuthn via Better Auth (`SecuritySettingsPage`, `TwoFactorChallengePage`)
- **Web Push** – daily challenge / streak-risk notifications via VAPID + service worker. See `docs/push.md`
- **Public API / Streamer Kit** – read-only, key-authenticated HTTP API + SSE + outbound webhooks for chat bots/overlays; `boxbot` sandbox streamer for integrators. See `docs/public-api.md`

**Platform**
- **User Profiles** – stats, game history, achievements; public shareable profiles + OG images
- **Admin Panel** – games, users, job queue, challenges, geo ingestion, screenshot reports, audit log
- **i18n** – French default, English supported

## Clean Architecture (Backend)

Three layers with strict dependency direction (presentation → domain → infrastructure; domain has no outward deps):

1. **Domain Layer** (`src/domain/services/`) – pure business logic: scoring, fuzzy matching, achievement evaluation, daily-login streak logic, geo consensus/scoring, billing rules, reward grants, webhook signing. No DB/HTTP/external imports.
2. **Infrastructure Layer** (`src/infrastructure/`) – repositories (Knex/Kysely), Better Auth, Socket.io server, BullMQ workers (import, sync, daily-challenge, geo ingestion, push fan-out, lifecycle emails, webhook delivery, leaderboard payouts, cleanup), Stripe, Web Push, Resend, Pino logger.
3. **Presentation Layer** (`src/presentation/`) – thin Express controllers in `routes/*.routes.ts`, middleware (auth, Zod validation, request logging, rate limiting). App routes mounted under `/api/`; the public API lives under `/api/public/` (key-authenticated).

## Development Commands

```bash
# Install (from root)
npm install

# Start Postgres + Redis (local dev)
docker compose -f compose.local.yml up -d

# Run both servers (backend :3000, frontend :5173)
npm run dev

# Individual services
npm run dev:backend
npm run dev:frontend

# Build
npm run build           # All packages
npm run build:types     # Rebuild first if shared types changed
npm run build:backend
npm run build:frontend

# Quality
npm run lint
npm test
```

## Database Commands

```bash
# Root
npm run db:migrate
npm run db:rollback
npm run db:seed
npm run db:seed:geo               # Seed the Geo-mode demo (Elden Ring)

# From packages/backend
npm run db:make-migration name    # New .ts migration
npm run e2e:seed                  # Seed DB for Playwright
npm run stripe:check              # Validate Stripe price/config wiring
npm run vapid:generate            # Generate VAPID keypair for web push
```

Migrations are TypeScript, date-prefixed (`YYYYMMDD_name.ts`) under `packages/backend/migrations/`. They run automatically on container start via `docker-entrypoint.sh`.

## Testing Commands

```bash
npm test                          # Root – all workspaces (Node test runner, unit)

# Playwright (from packages/frontend)
npm run test:e2e
npm run test:e2e:ui               # Interactive
npm run test:e2e:headed
npm run test:e2e:debug
npm run test:e2e:a11y             # a11y-smoke spec
npm run test:e2e:visual           # visual-regression spec
npm run test:e2e:visual:update    # Update visual snapshots
```

E2E specs cover: `auth` (+ rate-limit), `registration`, `daily-game`, `daily-login`, `countdown`, `history`, `leaderboard`, `achievements`, `profile`, `public-profile-share`, `admin-users`, `geo-play/contribute/admin`, `billing-webhook`, `referral`, `rewards`, `streamer-kit`, `i18n-switch`, `theme-switcher`, `a11y-smoke`, `visual-regression`.

## Docker / Release Commands

```bash
npm run docker:build   # Build with package version + git SHA
npm run docker:tag     # Tag semver variants (latest, 1.6, 1)
npm run docker:push
npm run release        # build + docker:build + docker:tag + docker:push

# Version bumps (all workspaces + root)
npm run version:patch
npm run version:minor
npm run version:major
```

Release workflow (`.github/workflows/release.yml`) is triggered manually and publishes multi-arch (amd64, arm64) images to Docker Hub.

## Screenshot Fetcher Tool

```bash
# From packages/backend (requires RAWG_API_KEY)
npm run fetch:games
npm run fetch:download
npm run fetch:all

# Steam variant
npm run fetch:steam
npm run fetch:steam-download
npm run fetch:steam-all
```

## Marketing Video (Remotion)

```bash
npm run dev:video       # Remotion preview/studio (@the-box/marketing-video)
npm run render:video    # Render the promo composition
```

## Key Conventions

- **Primary Language**: French (UI defaults to `fr`; `en` also supported)
- **Styling**: Dark gaming theme, neon accents (purple/pink gradients)
- **Client State**: Zustand stores with `persist` middleware where needed
- **Shared Types**: All cross-package types live in `@the-box/types/src/index.ts`. Rebuild the `types` package after edits so others pick them up.
- **API**: REST under `/api/`, JSON in/out
- **Real-time**: Socket.io for live leaderboard updates – events in `docs/realtime.md`
- **Validation**: Zod both sides (middleware on backend, form resolvers on frontend)
- **Auth Bootstrap**: First registered user becomes admin automatically
- **Path Aliases**: `@/` → `src/` in both packages
- **Tailwind helper**: `cn()` for conditional class merging
- **TypeScript**: strict mode everywhere
- **Commits**: Conventional Commits, enforced by commitlint + husky

### Commit Format

```
<type>(<scope>): <subject>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`.

## Environment

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | PostgreSQL connection string |
| `DATABASE_SSL` | Toggle SSL for the DB connection |
| `REDIS_URL` | Redis connection string (BullMQ) |
| `BETTER_AUTH_SECRET` | Auth secret (min 32 chars; `openssl rand -base64 32`) |
| `API_URL` | Public backend URL (Better Auth callbacks) |
| `FRONTEND_URL` | Public frontend URL (links in emails, redirects) |
| `CORS_ORIGIN` | Allowed frontend origin |
| `PORT` | Backend port (default 3000) |
| `LOG_LEVEL` | Pino log level |
| `RESEND_API_KEY` | Optional – Resend email API key |
| `EMAIL_FROM` | Sender address |
| `RELANCE_EMAIL_ENABLED` / `_CRON` | Re-engagement email job toggle + schedule |
| `INACTIVE_USER_REMINDER_ENABLED` / `_CRON` / `_DAYS` | Inactive win-back email job config |
| `STRIPE_SECRET_KEY` | Stripe API key (billing) |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhook signatures |
| `STRIPE_CHECKOUT_SUCCESS_URL` / `_CANCEL_URL` | Checkout redirect URLs |
| `STRIPE_PORTAL_RETURN_URL` / `STRIPE_PORTAL_CONFIG_ID` | Billing Portal config |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (VAPID) keys |
| `KOE_IDENTITY_SECRET` | Optional – HMAC secret for the Koe feedback widget |
| `RAWG_API_KEY` | Optional – screenshot-fetcher + admin imports |
| `VITE_API_URL` | Frontend API base URL |
| `VITE_USE_MOCK_API` | `true` → frontend uses mock services |
| `VITE_KOE_PROJECT_KEY` / `VITE_KOE_API_URL` | Koe feedback widget config |
| `VITE_GOATCOUNTER_URL` | GoatCounter analytics endpoint |

See `.env.example` for defaults. In production (single Docker image) Node serves the built frontend on port 80 and the API under `/api/`.

## Ports

- **3000** – backend dev server
- **5173** – frontend Vite dev server
- **5432** – PostgreSQL (dev, `compose.local.yml`)
- **6379** – Redis (dev, `compose.local.yml`)
- **80** – production container (UI + API)

## Feature Documentation

Detailed docs live in `docs/`:

- `architecture.md` (+ `architecture.html`) – Clean architecture overview
- `authentication.md`, `better-auth-setup.md` – Auth flow (incl. 2FA / passkeys)
- `game-flow.md` – Scoring, tiers, challenge mechanics
- `geo-mode.md` – Geo mode mechanics + ingestion pipeline
- `billing-stripe.md` – Premium subscription + lifetime supporter
- `push.md` – Web Push lifecycle (VAPID, fan-out, service worker)
- `public-api.md` (+ `public-api.openapi.yaml`), `streamer-kit.html` – Public API / streamer kit
- `api.md` – Internal REST endpoints
- `database.md` – Schema
- `realtime.md` – Socket.io events
- `ui-tokens.md`, `oxygen-design-system.md` – Design tokens / system

## Pre-Commit Checklist

1. `npm run build` – typecheck all packages
2. `npm run lint` – ESLint on frontend
3. `npm test` – unit tests
4. For UI changes: `npm run test:e2e` (dev servers up + `npm run e2e:seed`)
5. Commit via Conventional Commits (husky enforces this)
