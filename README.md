# The Box

A gaming screenshot guessing game where players identify video games from 360° panoramic screenshots. Features tiered difficulty, power-ups, live leaderboards, and multiplayer modes.

## Features

- **360° Panoramic Screenshots** - Immersive game identification using Pannellum viewer
- **Tiered Difficulty** - 3 tiers with increasing challenge levels
- **Daily Challenges** - New challenges every day
- **Power-ups** - Timer extensions and hints to help players
- **Live Leaderboard** - Real-time score updates via Socket.io
- **Authentication** - Email/password auth with Better Auth
- **Internationalization** - French (default) and English support

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TypeScript, TailwindCSS, Zustand |
| Backend | Node.js, Express, Better Auth, Socket.io, BullMQ |
| Database | PostgreSQL, Knex.js |
| Cache/Queue | Redis |
| Monorepo | npm workspaces |

## Project Structure

```
the-box/
├── packages/
│   ├── types/          # @the-box/types - Shared TypeScript types
│   ├── backend/        # @the-box/backend - Express API (Clean Architecture)
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── domain/services/
│   │   │   ├── infrastructure/
│   │   │   │   ├── auth/
│   │   │   │   ├── database/
│   │   │   │   ├── repositories/
│   │   │   │   └── socket/
│   │   │   └── presentation/
│   │   │       ├── routes/
│   │   │       └── middleware/
│   │   └── migrations/
│   └── frontend/       # @the-box/frontend - React SPA
│       └── src/
│           ├── components/
│           ├── pages/
│           ├── stores/
│           └── lib/
├── docs/               # Feature documentation
├── uploads/            # Screenshot storage
└── docker-compose.yml
```

## Quick Start

### Prerequisites

- Node.js >= 18
- Docker (for PostgreSQL)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd the-box

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start PostgreSQL
docker-compose up -d

# Run database migrations
npm run db:migrate

# Start development servers
npm run dev
```

### Development Commands

```bash
# Start all services
npm run dev

# Start individual services
npm run dev:backend     # Backend on port 3000
npm run dev:frontend    # Frontend on port 5173

# Build
npm run build           # Build all packages
npm run build:types     # Build types package
npm run build:backend   # Build backend
npm run build:frontend  # Build frontend

# Database
npm run db:migrate      # Run migrations
npm run db:rollback     # Rollback last migration
npm run db:seed         # Seed database
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://thebox:thebox_secret@localhost:5432/thebox` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `BETTER_AUTH_SECRET` | Auth secret (min 32 chars) | - |
| `API_URL` | Backend API URL | `http://localhost:3000` |
| `RESEND_API_KEY` | Resend API key for emails | - |
| `EMAIL_FROM` | Email sender address | - |
| `RAWG_API_KEY` | RAWG API key for game imports | - |
| `PORT` | Backend port | `3000` |
| `CORS_ORIGIN` | Frontend URL | `http://localhost:5173` |

## Documentation

See the [docs/](./docs/) folder for detailed documentation:

- [Architecture](./docs/architecture.md) - Clean architecture overview
- [Authentication](./docs/authentication.md) - Better Auth setup
- [Game Flow](./docs/game-flow.md) - Game mechanics and scoring
- [API Reference](./docs/api.md) - REST API endpoints
- [Database Schema](./docs/database.md) - Database structure
- [Real-time Events](./docs/realtime.md) - Socket.io events

## License

MIT
