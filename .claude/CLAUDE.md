# The Box - Project Instructions

## Project Overview

"The Box" is a gaming screenshot guessing application where players identify games from screenshots. The classic mode is a daily challenge with tiered difficulty, power-ups/hints, achievements, daily login rewards, tournaments, and live leaderboards with real-time updates. It also ships a second game mode (**Geo Mode** – pinpoint where a screenshot was taken on a game map), a **premium subscription** tier (Stripe), a **referral** program, **web push** notifications, two-factor auth/passkeys, and a key-authenticated **public API / streamer kit** with outbound webhooks.

## Tech Stack

- **Frontend**: React 19 + Vite 7 + TypeScript + TailwindCSS v4 + Zustand + i18next + react-router-dom 7 (PWA)
- **Backend**: Node.js 24 + Express 5 + Knex.js + Kysely + Socket.io 4 (Clean Architecture)
- **Database**: PostgreSQL 16 (via Docker)
- **Authentication**: Better Auth (session-based, email/password) + TOTP 2FA and passkeys
- **Job Queue**: BullMQ + Redis (imports, daily challenge, geo ingestion, push fan-out, emails, webhook delivery, leaderboard payouts)
- **Payments**: Stripe (premium subscription + lifetime supporter; Checkout + Billing Portal + webhooks)
- **Web Push**: W3C Web Push via VAPID, rendered by the PWA service worker
- **Email**: Resend (password reset, lifecycle / re-engagement)
- **Maps (Geo Mode)**: Leaflet tile rendering over ingested game maps
- **Screenshot Viewer**: Embla Carousel (`ScreenshotViewer` shows the current screenshot with prev/next pre-loaded)
- **Decorative 3D**: Three.js / React Three Fiber (used only by `CubeBackground` on the home page)
- **Animation**: Framer Motion
- **Forms**: React Hook Form + Zod validation
- **UI Primitives**: Radix UI + Shadcn components, Lucide icons
- **Analytics**: GoatCounter + Koe feedback widget (HMAC identity)
- **Marketing**: Remotion (`@the-box/marketing-video`) for rendered promo videos
- **Testing**: Node test runner (unit) + Playwright (E2E, incl. a11y & visual-regression)
- **Monorepo**: npm workspaces (`types`, `backend`, `frontend`, `marketing-video`)
- **Logging**: Pino (with pino-pretty in dev)
- **Validation**: Zod (both frontend and backend)

## Project Structure (Monorepo)

```
the-box/
├── package.json              # Root workspace config
├── compose.yml               # Production: Full stack with Traefik + db-backup
├── compose.local.yml         # Development: PostgreSQL + Redis only
├── Dockerfile                # Multi-stage Alpine build (port 80)
├── docker-entrypoint.sh      # Runs migrations then starts app
├── tsconfig.json             # Root TS config
├── commitlint.config.js      # Conventional commits rules
├── .husky/                   # Git hooks (commit-msg validation)
├── .github/workflows/        # release, security review, GitHub Pages (docs/*.html)
├── .claude/                  # Project-specific Claude Code config + this file
├── AGENT.md                  # French autonomous-agent brief (read before automated edits)
├── tasks/                    # Task PRDs (markdown + HTML)
├── docs/                     # Architecture / API / feature docs (md + some html)
├── scripts/                  # db-backup helpers
├── secrets/                  # Docker secret mounts (gitkeep only)
├── backups/                  # DB backup storage (gitignored volume)
├── uploads/                  # Game screenshot storage (gitignored volume)
└── packages/
    ├── types/                # @the-box/types - Shared TypeScript types
    │   └── src/index.ts      # All domain types exported here
    ├── marketing-video/      # @the-box/marketing-video - Remotion promo compositions
    ├── backend/              # @the-box/backend - Express API (Clean Architecture)
    │   ├── src/
    │   │   ├── index.ts            # Entrypoint (boots HTTP + Socket + workers)
    │   │   ├── config/             # env.ts, billing.ts (Stripe prices), themes.ts
    │   │   ├── domain/services/    # Business logic (no infra deps)
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
    │   │   │   ├── auth/          # Better Auth (+ 2FA / passkey)
    │   │   │   ├── crypto/        # secret encryption at rest
    │   │   │   ├── database/      # Knex + Kysely connection
    │   │   │   ├── email/         # Resend client + templates
    │   │   │   ├── logger/        # Pino logger
    │   │   │   ├── push/          # Web Push (VAPID) sender
    │   │   │   ├── queue/         # BullMQ connection + queues.ts + workers/
    │   │   │   ├── redis/         # Redis client
    │   │   │   ├── repositories/  # ~30 repos (game, challenge, geo-*, subscription,
    │   │   │   │                  # reward, webhook, api-key, push-subscription, …)
    │   │   │   ├── stripe/        # Stripe client
    │   │   │   └── socket/        # Socket.io setup
    │   │   ├── presentation/
    │   │   │   ├── routes/        # achievement, admin, auth, daily-login, game,
    │   │   │   │                  # leaderboard, user, geo, geo-fetch, billing,
    │   │   │   │                  # billing-webhook, push, referral, rewards,
    │   │   │   │                  # public (+ public-sse), streamer-keys, koe,
    │   │   │   │                  # og, screenshot-report
    │   │   │   └── middleware/    # auth, validation, request logging, rate limit
    │   │   └── tools/             # screenshot-fetcher (RAWG) + steam-screenshot-fetcher
    │   ├── migrations/            # Knex TS migrations (date-prefixed)
    │   ├── seeds/                 # DB seed files (incl. geo seed)
    │   ├── scripts/               # e2e-seed, stripe-check, generate-vapid, utilities
    │   ├── data/                  # JSON seed data
    │   └── knexfile.ts            # Knex config
    └── frontend/                  # @the-box/frontend - React SPA (+ PWA)
        ├── src/
        │   ├── main.tsx           # App bootstrap
        │   ├── App.tsx            # Router + providers
        │   ├── sw.ts              # PWA / push service worker
        │   ├── components/        # achievement, admin, backgrounds, daily-login,
        │   │                      # game, geo, history, home, layout, onboarding,
        │   │                      # pricing, profile, pwa, rewards, security, ui
        │   ├── pages/             # ~23 route pages (Home, Game, Leaderboard, Profile,
        │   │                      # PublicProfile, Admin, History, GeoPlay,
        │   │                      # GeoContribute, Pricing, SecuritySettings,
        │   │                      # TwoFactorChallenge, FAQ, Contact, Legal, Auth...)
        │   ├── hooks/             # useAuth, useGameGuess, useWebPush, useGeoHealth,
        │   │                      # useGeoRunPolling, useFullscreen, useReferralCapture…
        │   ├── lib/               # Utilities, API client (incl. koe), i18n, analytics
        │   ├── services/          # guessSubmission, leaderboard (client-side logic)
        │   ├── stores/            # Zustand: auth, game, achievement, dailyLogin,
        │   │                      # admin, billing, geo, geoFetch, geoFreePlay, rewards
        │   ├── utils/             # Helpers
        │   └── types/             # Frontend-only types
        ├── e2e/                   # Playwright specs (auth, daily-game, leaderboard,
        │                          # geo-*, billing, referral, rewards, streamer-kit,
        │                          # a11y-smoke, visual-regression, …)
        ├── public/locales/        # i18n translations (en, fr)
        ├── vite.config.ts
        ├── playwright.config.ts
        └── components.json        # shadcn config
```

## Features

**Classic mode**
- **Daily Challenges**: New challenge each day with tiered difficulty (Easy → Hard)
- **Per-Screenshot Countdown Timer**: 45s per screenshot (`tiers.time_limit_seconds` → `ScreenshotResponse.timeLimitSeconds`); running out is a permanent miss (`timed_out`). Time is a per-position active-time budget (`PositionState.timeSpentMs`) that pauses on navigation and resumes on return, so skipping away and back can't reset it
- **Catch-Up Mode**: Play missed challenges from the last 7 days (scores don't count for leaderboard)
- **Hint System**: Power-ups reveal hints (release year, developer, publisher) and timer extensions
- **Achievements**: Unlockable achievements (beginner-tier + mastery / account-age milestones)
- **Daily Login Rewards**: Streak-based rewards (UTC boundaries, streak-freeze) with calendar display
- **Reward grants / chests**: Day-7 chest and other reward grants (`rewards` store + routes)
- **Leaderboards**: Daily and monthly rankings with Socket.io live updates + periodic payouts
- **Tournaments**: Weekly + monthly, created/closed by scheduled jobs

**Geo Mode**
- **Geo Play**: Pinpoint where a screenshot was taken on the game map (Leaflet); distance-based scoring
- **Geo Contribute**: Eligible players place/confirm pins; consensus service resolves ground truth
- **Ingestion pipeline**: BullMQ workers import maps & screenshots from many sources (RAWG, Steam, Fandom, Fextralife, StrategyWiki, MapGenie/Wand, Wikidata, registry); admin Geo-Fetch panel drives it (`docs/geo-mode.md`)

**GeoGamers Mode** (behind `GEOGAMERS_ENABLED`)
- **Daily two-phase run**: identify the hidden game (fuzzy match, 3 attempts, 100/66/33/0, hint-free) then pin its location (0–100), 200/day; once-per-season joker; guests play unranked with claim-on-signup (`docs/geogamers.md`)
- **Monthly season**: separate ranking, season = sum minus 3 worst days (≥10 days played); month-close payout worker grants a season frame

**Account & monetization**
- **Premium / Lifetime Supporter**: Stripe Checkout + Billing Portal, premium-only features (`docs/billing-stripe.md`)
- **Referrals**: Invite codes, capture on signup, reward announcements
- **Two-Factor Auth & Passkeys**: TOTP + WebAuthn via Better Auth (`SecuritySettingsPage`, `TwoFactorChallengePage`)
- **Web Push**: Daily-challenge / streak-risk notifications via VAPID + service worker (`docs/push.md`)
- **Public API / Streamer Kit**: Read-only, key-authenticated HTTP API + SSE + outbound webhooks; `boxbot` sandbox streamer (`docs/public-api.md`)

**Platform**
- **User Profiles**: Stats, game history, achievement display; public shareable profiles + OG images
- **Admin Panel**: Games, users, job queue, challenges, geo ingestion, screenshot reports, audit log
- **i18n**: French (default) + English, translations under `public/locales/`

## Development Commands

```bash
# Install all dependencies (from root)
npm install

# Start PostgreSQL + Redis (local dev only)
docker compose -f compose.local.yml up -d

# Run both servers (backend :3000, frontend :5173)
npm run dev

# Individual services
npm run dev:backend
npm run dev:frontend

# Build
npm run build           # All packages
npm run build:types     # @the-box/types (build first if changed)
npm run build:backend
npm run build:frontend

# Quality
npm run lint            # Frontend ESLint
npm test                # All package tests
```

## Database Commands

```bash
# From root
npm run db:migrate              # Run all pending migrations
npm run db:rollback             # Rollback last migration
npm run db:seed                 # Run seeds
npm run db:seed:geo             # Seed the Geo-mode demo (Elden Ring)

# From packages/backend
npm run db:make-migration name  # Create new .ts migration
npm run e2e:seed                # Seed DB for Playwright runs
npm run stripe:check            # Validate Stripe price/config wiring
npm run vapid:generate          # Generate VAPID keypair for web push
```

## Testing Commands

```bash
# Root
npm test                        # Run tests in all workspaces (Node test runner, unit)

# Playwright (from packages/frontend)
npm run test:e2e                # Headless
npm run test:e2e:ui             # Interactive UI mode
npm run test:e2e:headed         # Headed browser
npm run test:e2e:debug          # Debug mode
npm run test:e2e:a11y           # a11y-smoke spec
npm run test:e2e:visual         # visual-regression spec (--visual:update to refresh)
```

E2E specs cover: `auth` (+ rate-limit), `registration`, `daily-game`, `daily-login`, `countdown`, `history`, `leaderboard`, `achievements`, `profile`, `public-profile-share`, `admin-users`, `geo-play/contribute/admin`, `billing-webhook`, `referral`, `rewards`, `streamer-kit`, `i18n-switch`, `theme-switcher`, `a11y-smoke`, `visual-regression`.

## Docker / Release Commands

```bash
npm run docker:build   # Build tagged image (uses package version)
npm run docker:tag     # Tag semver variants (latest, 1.6, 1)
npm run docker:push    # Push all tags
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
npm run fetch:games     # Fetch game metadata from RAWG
npm run fetch:download  # Download screenshots
npm run fetch:all       # Fetch + download in one pass

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

## Clean Architecture (Backend)

The backend follows a 3-layer architecture with strict dependency direction (presentation → domain → infrastructure, domain has no outward deps):

1. **Domain Layer** (`src/domain/services/`)
   - Pure business logic: scoring, fuzzy matching, achievement evaluation, daily-login streak logic, geo consensus/scoring, billing rules, reward grants, webhook signing
   - No DB, HTTP, or external-service imports

2. **Infrastructure Layer** (`src/infrastructure/`)
   - Repositories (Knex/Kysely) for all data access
   - Better Auth (+ 2FA/passkey), Socket.io server, Stripe, Web Push, Resend, BullMQ workers, Pino logger
   - Queues under `queue/queues.ts`; workers under `queue/workers/` (import, sync, daily-challenge, geo ingestion, push fan-out, lifecycle emails, webhook delivery, leaderboard payouts, cleanup)

3. **Presentation Layer** (`src/presentation/`)
   - Thin Express controllers in `routes/*.routes.ts`
   - Middleware: auth (session check), validation (Zod), request logging, rate limiting
   - App routes mounted under `/api/`; the public API under `/api/public/` (key-authenticated)

## Key Conventions

- **Primary Language**: French (UI defaults to `fr`; `en` also supported)
- **Styling**: Dark gaming theme with neon accents (purple/pink gradients)
- **Client State**: Zustand stores with `persist` middleware where needed
- **Shared Types**: All cross-package types live in `@the-box/types/src/index.ts` — rebuild the types package after edits so other packages see them
- **API**: REST under `/api/`, JSON responses
- **Real-time**: Socket.io for live leaderboard updates; events documented in `docs/realtime.md`
- **Validation**: Zod schemas both server-side (middleware) and client-side (forms)
- **Migrations**: Date-prefixed TS files (`YYYYMMDD_name.ts`) under `packages/backend/migrations/`. Migrations run automatically in Docker via `docker-entrypoint.sh`.
- **Auth Bootstrap**: First registered user becomes admin automatically

## Code Style

- TypeScript strict mode throughout
- Functional React components with hooks
- Path alias `@/` maps to `src/` (both packages)
- Use `cn()` utility for conditional Tailwind classes
- Conventional Commits enforced by commitlint + husky `commit-msg` hook
- ESLint (flat config) on frontend

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
| `API_URL` | Public backend URL (used by Better Auth callbacks) |
| `FRONTEND_URL` | Public frontend URL (email links, redirects) |
| `CORS_ORIGIN` | Allowed frontend origin |
| `PORT` | Backend port (default 3000) |
| `LOG_LEVEL` | Pino log level |
| `RESEND_API_KEY` | Resend email API key (optional, for password reset) |
| `EMAIL_FROM` | Sender address |
| `RELANCE_EMAIL_ENABLED` / `_CRON` | Re-engagement email job toggle + schedule |
| `INACTIVE_USER_REMINDER_ENABLED` / `_CRON` / `_DAYS` | Inactive win-back email job config |
| `STRIPE_SECRET_KEY` | Stripe API key (billing) |
| `STRIPE_WEBHOOK_SECRET` | Verifies Stripe webhook signatures |
| `STRIPE_CHECKOUT_SUCCESS_URL` / `_CANCEL_URL` | Checkout redirect URLs |
| `STRIPE_PORTAL_RETURN_URL` / `STRIPE_PORTAL_CONFIG_ID` | Billing Portal config |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push (VAPID) keys |
| `KOE_IDENTITY_SECRET` | Optional — HMAC secret for the Koe feedback widget |
| `RAWG_API_KEY` | Optional, for screenshot-fetcher + admin game imports |
| `VITE_API_URL` | Frontend API base URL |
| `VITE_USE_MOCK_API` | If `true`, frontend uses mock services |
| `VITE_KOE_PROJECT_KEY` / `VITE_KOE_API_URL` | Koe feedback widget config |
| `VITE_GOATCOUNTER_URL` | GoatCounter analytics endpoint |

See `.env.example` for defaults. In production (single Docker image) the Node server serves the built frontend on port 80 and exposes the API under `/api/`.

## Ports

- **3000** — backend dev server
- **5173** — frontend Vite dev server
- **5432** — PostgreSQL (dev, from `compose.local.yml`)
- **6379** — Redis (dev, from `compose.local.yml`)
- **80** — production container (serves both UI and API)

## Feature Documentation

Detailed docs live in `docs/`:

- `architecture.md` (+ `architecture.html`) — Clean architecture overview
- `authentication.md`, `better-auth-setup.md` — Auth flow (incl. 2FA / passkeys)
- `game-flow.md` — Scoring, tiers, challenge mechanics
- `geo-mode.md` — Geo mode mechanics + ingestion pipeline
- `billing-stripe.md` — Premium subscription + lifetime supporter
- `push.md` — Web Push lifecycle (VAPID, fan-out, service worker)
- `public-api.md` (+ `public-api.openapi.yaml`), `streamer-kit.html` — Public API / streamer kit
- `api.md` — Internal REST endpoint reference
- `database.md` — Schema
- `realtime.md` — Socket.io events
- `ui-tokens.md`, `oxygen-design-system.md` — Design tokens / system

## HTML-First Artifacts

Prefer single-file HTML (inline CSS, optional vanilla JS, SVG diagrams) for any artifact a human will read and react to: PRDs in `tasks/`, subagent meeting notes, design proposals, release notes, post-incident reports, PR review packets. Plain Markdown is still correct for code-adjacent reference docs that tooling reads or that benefit from grep: `README.md`, `docs/api.md`, `docs/database.md`, `docs/ui-tokens.md`, ADRs, migration notes.

**Do not create a `/html` slash command or skill** — prompt for HTML output explicitly per task ("write this as a self-contained HTML file under `tasks/`"). This is a prompting practice, not tooling. Rationale: [Thariq's "Unreasonable Effectiveness of HTML"](https://x.com/trq212/status/2052809885763747935).

Conventions for HTML artifacts in this repo:

- **Location**: mirror, don't fork. `docs/<name>.html` sits next to `docs/<name>.md`. No parallel `docs/html/` tree.
- **PRDs**: markdown by default; HTML when the spec has 2+ of {user flow, screen mock, state diagram, formula/curve}. Migrate existing PRDs only on meaningful edit, not in bulk.
- **Single file**: inline CSS, inline SVG, optional inline `<script>`. No external assets, no build step. Portability over DRY.
- **SUMMARY header**: every HTML doc opens with a `<!-- SUMMARY: ... -->` block (≤5 lines, plain text). PR reviewers read that instead of the diff. Structural changes regenerate the file from a prompt rather than hand-edit.
- **Visual style**: dark gaming theme — `#0a0a0f` background, `#a855f7` neon-purple primary, Inter + JetBrains Mono, content max-width 72ch, one neon glow per page max, no glassmorphism. Match the canonical examples below.
- **Accessibility floor**: body contrast ≥ 4.5:1, `focus-visible` outline preserved, `@media (prefers-reduced-motion: reduce)` zeroes transitions.
- **Security policy**: HTML docs are local-open / GitHub-rendered / GitHub-Pages-hosted only. **Never serve `docs/*.html` or `tasks/*.html` from the Express app** — inline scripts on the same origin as Better Auth cookies is an XSS-shaped foot-gun. GitHub Pages serves from `wifsimster.github.io`, a separate origin, which keeps the same-origin-with-auth-cookies risk out.
- **Audience**: senior developers only. The Pages site has `<meta name="robots" content="noindex">` and the index is badged "internal". Don't draft HTML artifacts for non-engineer or French-speaking stakeholders unless explicitly asked — they get the existing markdown PRDs and the in-app UI.
- **Publishing**: every push to `main` that touches `docs/*.html` or `tasks/*.html` triggers `.github/workflows/pages.yml`, which copies those files into `_site/`, generates `_site/index.html` from each file's `<!-- SUMMARY -->`, and deploys to GitHub Pages at <https://wifsimster.github.io/the-box/>. One-time repo setup: Settings → Pages → Source = "GitHub Actions". The workflow doesn't add a build step — files are served as-is.

Canonical examples to mirror: [`tasks/html-first-subagents-meeting.html`](../tasks/html-first-subagents-meeting.html), [`docs/architecture.html`](../docs/architecture.html).

## Testing & Quality Before Committing

1. `npm run build` — ensures all packages typecheck
2. `npm run lint` — ESLint on frontend
3. `npm test` — unit tests
4. For UI changes, run `npm run test:e2e` (requires dev servers + seeded DB via `npm run e2e:seed`)
5. Commits go through commitlint via husky — use Conventional Commits

<claude-mem-context>
# Recent Activity

*No recent activity*
</claude-mem-context>
