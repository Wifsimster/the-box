# The Box - Project Instructions

## Project Overview

"The Box" is a gaming screenshot guessing application where players identify games from screenshots. Features include daily challenges with tiered difficulty, power-ups/hints, achievements, daily login rewards, and live leaderboards with real-time updates.

## Tech Stack

- **Frontend**: React 19 + Vite 7 + TypeScript + TailwindCSS v4 + Zustand + i18next + react-router-dom 7
- **Backend**: Node.js 24 + Express 5 + Knex.js + Kysely + Socket.io 4 (Clean Architecture)
- **Database**: PostgreSQL 16 (via Docker)
- **Authentication**: Better Auth (session-based, email/password)
- **Job Queue**: BullMQ + Redis for background tasks
- **Email**: Resend for transactional emails (password reset)
- **Screenshot Viewer**: Embla Carousel (`ScreenshotViewer` shows the current screenshot with prev/next pre-loaded)
- **Decorative 3D**: Three.js / React Three Fiber (used only by `CubeBackground` on the home page)
- **Animation**: Framer Motion
- **Forms**: React Hook Form + Zod validation
- **UI Primitives**: Radix UI + Shadcn components, Lucide icons
- **Testing**: Playwright for E2E tests
- **Monorepo**: npm workspaces
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
├── .github/workflows/        # release.yml (manual release + multi-arch docker)
├── .claude/                  # Project-specific Claude Code config + this file
├── tasks/                    # Task PRDs (markdown)
├── docs/                     # Architecture / API / feature docs
├── scripts/                  # db-backup helpers
├── backups/                  # DB backup storage (gitignored volume)
├── uploads/                  # Game screenshot storage (gitignored volume)
└── packages/
    ├── types/                # @the-box/types - Shared TypeScript types
    │   └── src/index.ts      # All domain types exported here
    ├── backend/              # @the-box/backend - Express API (Clean Architecture)
    │   ├── src/
    │   │   ├── index.ts            # Entrypoint (boots HTTP + Socket + workers)
    │   │   ├── config/             # Environment/config loading
    │   │   ├── domain/services/    # Business logic (no infra deps)
    │   │   │   ├── achievement.service.ts
    │   │   │   ├── admin.service.ts
    │   │   │   ├── auth.service.ts
    │   │   │   ├── daily-login.service.ts
    │   │   │   ├── fuzzy-match.service.ts  # Game name matching
    │   │   │   ├── game.service.ts
    │   │   │   ├── job.service.ts
    │   │   │   ├── leaderboard.service.ts
    │   │   │   └── user.service.ts
    │   │   ├── infrastructure/
    │   │   │   ├── auth/          # Better Auth setup
    │   │   │   ├── database/      # Knex + Kysely connection
    │   │   │   ├── logger/        # Pino logger
    │   │   │   ├── queue/         # BullMQ connection + queues + workers/
    │   │   │   ├── repositories/  # achievement, challenge, daily-login,
    │   │   │   │                  # game, import-state, inventory,
    │   │   │   │                  # leaderboard, screenshot, session, user
    │   │   │   └── socket/        # Socket.io setup
    │   │   ├── presentation/
    │   │   │   ├── routes/        # achievement, admin, auth, daily-login,
    │   │   │   │                  # game, leaderboard, user
    │   │   │   └── middleware/    # auth, validation, request logging
    │   │   └── tools/             # CLI (screenshot-fetcher via RAWG API)
    │   ├── migrations/            # Knex TS migrations (date-prefixed)
    │   ├── seeds/                 # DB seed files
    │   ├── scripts/               # e2e-seed.ts and utilities
    │   ├── data/                  # JSON seed data
    │   └── knexfile.ts            # Knex config
    └── frontend/                  # @the-box/frontend - React SPA
        ├── src/
        │   ├── main.tsx           # App bootstrap
        │   ├── App.tsx            # Router + providers
        │   ├── components/
        │   │   ├── achievement/   # Cards, grid, notifications
        │   │   ├── admin/         # Admin panels (games, users, jobs, challenges)
        │   │   ├── backgrounds/   # Visual backgrounds
        │   │   ├── daily-login/   # Reward modal, calendar, badge
        │   │   ├── game/          # Viewer, hints, input, results
        │   │   ├── layout/        # Header, Footer, PageHero
        │   │   ├── profile/       # Profile UI
        │   │   ├── ui/            # Shadcn/Radix primitives
        │   │   └── ErrorBoundary.tsx
        │   ├── pages/             # 17 route pages (Home, Game, Leaderboard,
        │   │                      # Profile, Admin, History, Legal, Auth...)
        │   ├── hooks/             # useAuth, useGameGuess, useIsMobile,
        │   │                      # useKeyboardHeight, useLocalizedPath,
        │   │                      # useNextDailyCountdown, usePercentileRank,
        │   │                      # useWorldScore
        │   ├── lib/               # Utilities, API client, i18n setup
        │   ├── services/          # scoring, validation, search, submission,
        │   │                      # leaderboard (client-side logic)
        │   ├── stores/            # Zustand: auth, game, achievement,
        │   │                      # dailyLogin, admin
        │   ├── utils/             # Helpers
        │   └── types/             # Frontend-only types
        ├── e2e/                   # Playwright specs (achievements, admin-users,
        │                          # auth, daily-game, daily-login, history,
        │                          # leaderboard, profile, registration)
        ├── public/locales/        # i18n translations (en, fr)
        ├── vite.config.ts
        ├── playwright.config.ts
        └── components.json        # shadcn config
```

## Features

- **Daily Challenges**: New challenge each day with tiered difficulty (Easy → Hard)
- **Per-Screenshot Countdown Timer**: 45s per screenshot (`tiers.time_limit_seconds` → `ScreenshotResponse.timeLimitSeconds`); running out is a permanent miss (`timed_out`). Time is a per-position active-time budget (`PositionState.timeSpentMs`) that pauses on navigation and resumes on return, so skipping away and back can't reset it
- **Catch-Up Mode**: Play missed challenges from the last 7 days (scores don't count for leaderboard)
- **Hint System**: Power-ups reveal hints (release year, developer, publisher) and timer extensions
- **Achievements**: Unlockable achievements including beginner-tier entries
- **Daily Login Rewards**: Streak-based rewards with calendar display
- **Leaderboards**: Daily and monthly rankings with Socket.io live updates
- **User Profiles**: Stats, game history, achievement display
- **Admin Panel**: Game management, user management, job queue monitoring, challenge management
- **i18n**: French (default) + English, translations under `public/locales/`
- **Tournaments**: Tournament-style competition (migration `20260115_add_tournaments.ts`)

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

# From packages/backend
npm run db:make-migration name  # Create new .ts migration
npm run e2e:seed                # Seed DB for Playwright runs
```

## Testing Commands

```bash
# Root
npm test                        # Run tests in all workspaces

# Playwright (from packages/frontend)
npm run test:e2e                # Headless
npm run test:e2e:ui             # Interactive UI mode
npm run test:e2e:headed         # Headed browser
npm run test:e2e:debug          # Debug mode
```

E2E specs cover: `achievements`, `admin-users`, `auth`, `daily-game`, `daily-login`, `history`, `leaderboard`, `profile`, `registration`.

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
```

## Clean Architecture (Backend)

The backend follows a 3-layer architecture with strict dependency direction (presentation → domain → infrastructure, domain has no outward deps):

1. **Domain Layer** (`src/domain/services/`)
   - Pure business logic: scoring, fuzzy matching, achievement evaluation, daily login streak logic
   - No DB, HTTP, or external-service imports

2. **Infrastructure Layer** (`src/infrastructure/`)
   - Repositories (Knex/Kysely) for all data access
   - Better Auth, Socket.io server, BullMQ workers, Pino logger
   - Queues under `queue/queues.ts`; workers under `queue/workers/` (import, sync, daily-challenge, cleanup)

3. **Presentation Layer** (`src/presentation/`)
   - Thin Express controllers in `routes/*.routes.ts`
   - Middleware: auth (session check), validation (Zod), request logging
   - All routes mounted under `/api/` prefix

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
| `REDIS_URL` | Redis connection string (BullMQ) |
| `BETTER_AUTH_SECRET` | Auth secret (min 32 chars; `openssl rand -base64 32`) |
| `API_URL` | Public backend URL (used by Better Auth callbacks) |
| `CORS_ORIGIN` | Allowed frontend origin |
| `PORT` | Backend port (default 3000) |
| `RESEND_API_KEY` | Resend email API key (optional, for password reset) |
| `EMAIL_FROM` | Sender address |
| `RAWG_API_KEY` | Optional, for screenshot-fetcher + admin game imports |
| `VITE_API_URL` | Frontend API base URL |
| `VITE_USE_MOCK_API` | If `true`, frontend uses mock services |

See `.env.example` for defaults. In production (single Docker image) the Node server serves the built frontend on port 80 and exposes the API under `/api/`.

## Ports

- **3000** — backend dev server
- **5173** — frontend Vite dev server
- **5432** — PostgreSQL (dev, from `compose.local.yml`)
- **6379** — Redis (dev, from `compose.local.yml`)
- **80** — production container (serves both UI and API)

## Feature Documentation

Detailed docs live in `docs/`:

- `architecture.md` — Clean architecture overview
- `authentication.md`, `better-auth-setup.md` — Auth flow
- `game-flow.md` — Scoring, tiers, challenge mechanics
- `api.md` — REST endpoint reference
- `database.md` — Schema
- `realtime.md` — Socket.io events

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
