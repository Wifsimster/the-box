# The Box - Project Instructions

## Project Overview
"The Box" is a gaming screenshot guessing application where players identify games from panoramic screenshots. Features include daily challenges, tiered difficulty, power-ups/hints, achievements, daily login rewards, and live leaderboards.

## Tech Stack
- **Frontend**: React 19 + Vite + TypeScript + TailwindCSS + Zustand + i18next
- **Backend**: Node.js + Express 5 + Knex.js + Socket.io (Clean Architecture)
- **Database**: PostgreSQL (via Docker)
- **Authentication**: Better Auth (session-based)
- **Job Queue**: BullMQ + Redis for background tasks
- **Email**: Resend for transactional emails
- **Viewer**: Pannellum for 360° panorama display
- **Testing**: Playwright for E2E tests
- **Monorepo**: npm workspaces

## Project Structure (Monorepo)
```
the-box/
├── package.json              # Root workspace config
├── packages/
│   ├── types/                # @the-box/types - Shared TypeScript types
│   │   └── src/index.ts
│   ├── backend/              # @the-box/backend - Express API (Clean Architecture)
│   │   ├── src/
│   │   │   ├── config/       # Environment configuration
│   │   │   ├── domain/       # Business logic layer
│   │   │   │   └── services/ # Game, auth, achievement, leaderboard, daily-login services
│   │   │   ├── infrastructure/
│   │   │   │   ├── auth/     # Better Auth setup
│   │   │   │   ├── database/ # Database connection
│   │   │   │   ├── logger/   # Pino logger
│   │   │   │   ├── queue/    # BullMQ workers (import, sync, daily-challenge, cleanup)
│   │   │   │   ├── repositories/ # Data access (game, user, achievement, leaderboard, inventory, daily-login)
│   │   │   │   └── socket/   # Socket.io setup
│   │   │   ├── presentation/ # HTTP layer
│   │   │   │   ├── routes/   # Route definitions (game, auth, user, admin, leaderboard, achievement, daily-login)
│   │   │   │   └── middleware/
│   │   │   └── tools/        # CLI tools (screenshot-fetcher)
│   │   ├── migrations/       # Knex database migrations
│   │   ├── scripts/          # Utility scripts
│   │   └── data/             # JSON seed data
│   └── frontend/             # @the-box/frontend - React SPA
│       ├── src/
│       │   ├── components/
│       │   │   ├── achievement/  # Achievement cards, grid, notifications
│       │   │   ├── admin/        # Admin panels (games, users, jobs, challenges)
│       │   │   ├── backgrounds/  # Visual backgrounds
│       │   │   ├── daily-login/  # Daily reward modal, calendar, badge
│       │   │   ├── game/         # Game UI (viewer, hints, input, results)
│       │   │   ├── layout/       # Header, Footer, PageHero
│       │   │   └── ui/           # Shadcn/Radix UI components
│       │   ├── hooks/        # Custom React hooks
│       │   ├── lib/          # Utilities, API client, i18n
│       │   ├── pages/        # Route pages
│       │   ├── services/     # Frontend services (scoring, validation, search)
│       │   └── stores/       # Zustand stores (auth, game, achievement, dailyLogin, admin)
│       ├── e2e/              # Playwright E2E tests
│       └── public/locales/   # i18n translations (en, fr)
├── docker compose.yml        # PostgreSQL + Redis containers
└── uploads/                  # Game screenshot storage
```

## Features

- **Daily Challenges**: New challenge each day with tiered difficulty (Easy → Hard)
- **Hint System**: Players can use power-ups to reveal hints (release year, genre, first letter)
- **Achievements**: Unlockable achievements for various accomplishments
- **Daily Login Rewards**: Streak-based rewards for returning players
- **Leaderboards**: Daily and monthly rankings with Socket.io live updates
- **User Profiles**: Stats, history, achievements display
- **Admin Panel**: Game management, user management, job queue monitoring

## Development Commands

```bash
# Install all dependencies (from root)
npm install

# Start PostgreSQL + Redis
docker compose up -d

# Development (from root)
npm run dev:backend   # Start backend server
npm run dev:frontend  # Start frontend dev server

# Or run both together
npm run dev

# Build all packages
npm run build

# Build specific package
npm run build:types
npm run build:backend
npm run build:frontend

# Linting
npm run lint
```

## Database Commands

```bash
npm run db:migrate              # Run migrations
npm run db:rollback             # Rollback migrations
npm run db:seed                 # Run seeds

# Backend-specific (from packages/backend)
npm run db:make-migration name  # Create new migration
```

## Testing Commands

```bash
# Run all tests
npm test

# E2E tests (from packages/frontend)
npx playwright test
npx playwright test --ui       # Interactive mode
```

## Docker/Release Commands

```bash
npm run docker:build   # Build Docker image
npm run docker:tag     # Tag with semver
npm run docker:push    # Push to registry
npm run release        # Build + Docker build + tag + push
```

## Screenshot Fetcher Tool

```bash
# From packages/backend
npm run fetch:games     # Fetch game metadata
npm run fetch:download  # Download screenshots
npm run fetch:all       # Fetch and download
```

## Clean Architecture (Backend)

The backend follows a 3-layer clean architecture:

1. **Domain Layer** (`src/domain/services/`)
   - Business logic: scoring, fuzzy matching, achievements, daily login
   - No external dependencies (pure functions)

2. **Infrastructure Layer** (`src/infrastructure/`)
   - Repositories: game, user, achievement, leaderboard, inventory, daily-login, session
   - External services: Socket.io, BullMQ workers, Better Auth, Pino logger

3. **Presentation Layer** (`src/presentation/`)
   - Express routes (thin controllers)
   - Middleware (auth, validation, request logging)
   - HTTP request/response handling

## Key Conventions

- **Language**: French is the primary language (UI defaults to French)
- **Styling**: Dark gaming theme with neon accents (purple/pink gradients)
- **State**: Zustand stores with persist middleware for client state
- **API**: RESTful endpoints under `/api/` prefix
- **Real-time**: Socket.io for live leaderboard updates
- **Types**: All shared types in `@the-box/types` package
- **Validation**: Zod for schema validation

## Code Style

- TypeScript strict mode
- Functional React components with hooks
- Path aliases: `@/` maps to `src/`
- Use `cn()` utility for conditional Tailwind classes
- Conventional commits (enforced via commitlint + husky)

## Testing

- Run `npm test` before committing
- Ensure TypeScript compiles: `npm run build`
- E2E tests cover: registration, daily game flow, admin user management


<claude-mem-context>
# Recent Activity

<!-- This section is auto-generated by claude-mem. Edit content outside the tags. -->

*No recent activity*
</claude-mem-context>
