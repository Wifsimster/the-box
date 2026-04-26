# The Box - AI Assistant Guide

## Project Overview

"The Box" is a gaming screenshot guessing application where players identify video games from screenshots. It features daily challenges with tiered difficulty, power-ups/hints, achievements, daily login rewards, tournaments, and live leaderboards with real-time updates.

## Tech Stack

- **Frontend**: React 19 + Vite 7 + TypeScript + TailwindCSS v4 + Zustand + i18next + react-router-dom 7
- **Backend**: Node.js 24 + Express 5 + Knex.js + Kysely + Socket.io 4 (Clean Architecture)
- **Database**: PostgreSQL 16 (via Docker)
- **Authentication**: Better Auth (session-based, email/password)
- **Job Queue**: BullMQ + Redis
- **Email**: Resend (password reset / transactional)
- **Screenshot Viewer**: Embla Carousel (`ScreenshotViewer` shows the current screenshot with prev/next pre-loaded)
- **Decorative 3D**: Three.js / React Three Fiber (used only by `CubeBackground` on the home page)
- **Animation / UI**: Framer Motion, Radix UI primitives, shadcn/ui, Lucide icons
- **Forms**: React Hook Form + Zod
- **Validation**: Zod (frontend and backend)
- **Logging**: Pino (pino-pretty in dev)
- **Testing**: Playwright (E2E)
- **Monorepo**: npm workspaces

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
├── .github/workflows/        # release.yml (manual release + multi-arch docker)
├── .claude/                  # Local Claude Code config
├── tasks/                    # Task PRDs (markdown)
├── docs/                     # architecture, api, authentication, game-flow,
│                             # database, realtime, better-auth-setup
├── scripts/                  # db-backup helpers
├── backups/                  # DB backup volume
├── uploads/                  # Screenshot storage volume
└── packages/
    ├── types/                # @the-box/types - shared TypeScript types
    │   └── src/index.ts      # All domain types exported here
    ├── backend/              # @the-box/backend - Express API (Clean Architecture)
    │   ├── src/
    │   │   ├── index.ts            # Entrypoint (HTTP + Socket + workers)
    │   │   ├── config/             # Environment / config loading
    │   │   ├── domain/services/    # Pure business logic (no infra deps)
    │   │   │   ├── achievement.service.ts
    │   │   │   ├── admin.service.ts
    │   │   │   ├── auth.service.ts
    │   │   │   ├── daily-login.service.ts
    │   │   │   ├── fuzzy-match.service.ts   # Game name matching
    │   │   │   ├── game.service.ts
    │   │   │   ├── job.service.ts
    │   │   │   ├── leaderboard.service.ts
    │   │   │   └── user.service.ts
    │   │   ├── infrastructure/
    │   │   │   ├── auth/           # Better Auth setup
    │   │   │   ├── database/       # Knex + Kysely connection
    │   │   │   ├── logger/         # Pino
    │   │   │   ├── queue/          # BullMQ connection, queues/, workers/
    │   │   │   ├── repositories/   # achievement, challenge, daily-login,
    │   │   │   │                   # game, import-state, inventory,
    │   │   │   │                   # leaderboard, screenshot, session, user
    │   │   │   └── socket/         # Socket.io setup
    │   │   ├── presentation/
    │   │   │   ├── routes/         # achievement, admin, auth, daily-login,
    │   │   │   │                   # game, leaderboard, user
    │   │   │   └── middleware/     # auth, validation, request logging
    │   │   └── tools/              # screenshot-fetcher (RAWG API CLI)
    │   ├── migrations/             # Knex TS migrations (YYYYMMDD_name.ts)
    │   ├── seeds/                  # DB seed files
    │   ├── scripts/                # e2e-seed.ts and utilities
    │   ├── data/                   # JSON seed data
    │   └── knexfile.ts
    └── frontend/                   # @the-box/frontend - React SPA
        ├── src/
        │   ├── main.tsx
        │   ├── App.tsx             # Router + providers
        │   ├── components/
        │   │   ├── achievement/    # Cards, grid, notifications
        │   │   ├── admin/          # Admin panels
        │   │   ├── backgrounds/
        │   │   ├── daily-login/    # Reward modal, calendar, badge
        │   │   ├── game/           # Viewer, hints, input, results
        │   │   ├── layout/         # Header, Footer, PageHero
        │   │   ├── profile/
        │   │   ├── ui/             # shadcn/Radix primitives
        │   │   └── ErrorBoundary.tsx
        │   ├── pages/              # 17 route pages (Home, Game, Leaderboard,
        │   │                       # Profile, Admin, History, Legal, Auth flows...)
        │   ├── hooks/              # useAuth, useGameGuess, useIsMobile,
        │   │                       # useKeyboardHeight, useLocalizedPath,
        │   │                       # useNextDailyCountdown, usePercentileRank,
        │   │                       # useWorldScore
        │   ├── lib/                # Utilities, API client, i18n setup
        │   ├── services/           # scoringService, gameValidationService,
        │   │                       # gameSearchService, guessSubmissionService,
        │   │                       # leaderboardService
        │   ├── stores/             # Zustand: auth, game, achievement,
        │   │                       # dailyLogin, admin
        │   ├── utils/
        │   └── types/              # Frontend-only types
        ├── e2e/                    # Playwright specs: achievements, admin-users,
        │                           # auth, daily-game, daily-login, history,
        │                           # leaderboard, profile, registration
        ├── public/locales/         # i18n translations (en, fr)
        ├── vite.config.ts
        ├── playwright.config.ts
        └── components.json         # shadcn config
```

## Features

- **Daily Challenges** with tiered difficulty (Easy → Hard)
- **Catch-Up Mode** – play missed challenges from the last 7 days (doesn't count for leaderboard)
- **Hints / Power-ups** – reveal release year, developer, publisher; timer extensions
- **Achievements** (including beginner-tier)
- **Daily Login Rewards** with streaks and calendar display
- **Live Leaderboards** – daily and monthly, Socket.io real-time updates
- **Tournaments** (migration `20260115_add_tournaments.ts`)
- **User Profiles** – stats, game history, achievements
- **Admin Panel** – games, users, job queue, challenges
- **i18n** – French default, English supported

## Clean Architecture (Backend)

Three layers with strict dependency direction (presentation → domain → infrastructure; domain has no outward deps):

1. **Domain Layer** (`src/domain/services/`) – pure business logic: scoring, fuzzy matching, achievement evaluation, daily-login streak logic. No DB/HTTP/external imports.
2. **Infrastructure Layer** (`src/infrastructure/`) – repositories (Knex/Kysely), Better Auth, Socket.io server, BullMQ workers (import, sync, daily-challenge, cleanup), Pino logger.
3. **Presentation Layer** (`src/presentation/`) – thin Express controllers in `routes/*.routes.ts`, middleware (auth, Zod validation, request logging). All routes mounted under `/api/`.

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

# From packages/backend
npm run db:make-migration name    # New .ts migration
npm run e2e:seed                  # Seed DB for Playwright
```

Migrations are TypeScript, date-prefixed (`YYYYMMDD_name.ts`) under `packages/backend/migrations/`. They run automatically on container start via `docker-entrypoint.sh`.

## Testing Commands

```bash
npm test                          # Root – all workspaces

# Playwright (from packages/frontend)
npm run test:e2e
npm run test:e2e:ui               # Interactive
npm run test:e2e:headed
npm run test:e2e:debug
```

E2E specs: `achievements`, `admin-users`, `auth`, `daily-game`, `daily-login`, `history`, `leaderboard`, `profile`, `registration`.

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
| `REDIS_URL` | Redis connection string (BullMQ) |
| `BETTER_AUTH_SECRET` | Auth secret (min 32 chars; `openssl rand -base64 32`) |
| `API_URL` | Public backend URL (Better Auth callbacks) |
| `CORS_ORIGIN` | Allowed frontend origin |
| `PORT` | Backend port (default 3000) |
| `RESEND_API_KEY` | Optional – Resend email API key |
| `EMAIL_FROM` | Sender address |
| `RAWG_API_KEY` | Optional – screenshot-fetcher + admin imports |
| `VITE_API_URL` | Frontend API base URL |
| `VITE_USE_MOCK_API` | `true` → frontend uses mock services |

See `.env.example` for defaults. In production (single Docker image) Node serves the built frontend on port 80 and the API under `/api/`.

## Ports

- **3000** – backend dev server
- **5173** – frontend Vite dev server
- **5432** – PostgreSQL (dev, `compose.local.yml`)
- **6379** – Redis (dev, `compose.local.yml`)
- **80** – production container (UI + API)

## Feature Documentation

Detailed docs live in `docs/`:

- `architecture.md` – Clean architecture overview
- `authentication.md`, `better-auth-setup.md` – Auth flow
- `game-flow.md` – Scoring, tiers, challenge mechanics
- `api.md` – REST endpoints
- `database.md` – Schema
- `realtime.md` – Socket.io events

## Pre-Commit Checklist

1. `npm run build` – typecheck all packages
2. `npm run lint` – ESLint on frontend
3. `npm test` – unit tests
4. For UI changes: `npm run test:e2e` (dev servers up + `npm run e2e:seed`)
5. Commit via Conventional Commits (husky enforces this)
