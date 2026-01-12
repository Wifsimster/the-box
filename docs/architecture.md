# Architecture

The Box follows a **monorepo structure** with **clean architecture** principles in the backend.

## Monorepo Structure

The project uses npm workspaces to manage three packages:

```text
packages/
├── types/      # @the-box/types - Shared TypeScript definitions
├── backend/    # @the-box/backend - Express API server
└── frontend/   # @the-box/frontend - React SPA
```

### Package Dependencies

```text
@the-box/frontend ──► @the-box/types
@the-box/backend  ──► @the-box/types
```

## Backend Clean Architecture (3-Layer)

The backend follows a pragmatic 3-layer clean architecture:

```text
┌─────────────────────────────────────────────────────────┐
│                   PRESENTATION LAYER                     │
│  Routes, Controllers, Middleware, HTTP Request/Response  │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                     DOMAIN LAYER                         │
│    Services, Business Logic, Scoring, Validation         │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────┐
│                 INFRASTRUCTURE LAYER                     │
│ Repositories, Database, Auth, Socket.io, Queue, Redis   │
└─────────────────────────────────────────────────────────┘
```

### Layer Responsibilities

#### Presentation Layer (`src/presentation/`)

- **Routes**: Define HTTP endpoints, parse request params
- **Middleware**: Authentication, validation, error handling
- **Controllers**: Thin handlers that delegate to services

```typescript
// Example: Thin route handler
router.get('/today', optionalAuthMiddleware, async (req, res, next) => {
  try {
    const data = await gameService.getTodayChallenge(req.userId)
    res.json({ success: true, data })
  } catch (error) {
    next(error)
  }
})
```

#### Domain Layer (`src/domain/services/`)

- **Business Logic**: Scoring algorithms, game rules
- **Validation**: Domain-level data validation
- **Orchestration**: Coordinate between repositories
- **Services**:
  - `game.service.ts` - Challenge and screenshot management
  - `user.service.ts` - User profiles and game history
  - `leaderboard.service.ts` - Rankings and percentile calculations
  - `job.service.ts` - Background job management
  - `admin.service.ts` - Admin operations
  - `auth.service.ts` - Authentication logic
  - `fuzzy-match.service.ts` - Game name matching for guesses

```typescript
// Example: Countdown score calculation in game.service.ts
calculateCurrentScore(sessionStartedAt: Date, initialScore: number, decayRate: number): number {
  const elapsedMs = Date.now() - sessionStartedAt.getTime()
  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  return Math.max(0, initialScore - (elapsedSeconds * decayRate))
}
```

#### Infrastructure Layer (`src/infrastructure/`)

- **Repositories**: Database access, query building
- **Database**: Connection management
- **Auth**: Better Auth integration
- **Socket**: Real-time communication
- **Queue**: BullMQ job queue with Redis for background imports

```text
infrastructure/
├── auth/           # Better Auth setup
├── database/       # PostgreSQL connection
├── logger/         # Pino structured logging
├── queue/          # BullMQ job queue with Redis
│   ├── connection.ts    # Redis connection pool
│   ├── queues.ts        # Queue definitions (import, daily-challenge, sync)
│   └── workers/         # Job processors
│       ├── import.worker.ts
│       ├── import-logic.ts
│       ├── batch-import-logic.ts
│       ├── daily-challenge-logic.ts
│       └── sync-all-logic.ts
├── repositories/   # Data access layer
└── socket/         # Socket.io setup
```

```typescript
// Example: Repository pattern
export const userRepository = {
  async findById(id: string): Promise<User | null> {
    const row = await db('users').where('id', id).first()
    return row ? mapRowToUser(row) : null
  },

  async create(data: CreateUserData): Promise<User> {
    const [row] = await db('users').insert({...}).returning('*')
    return mapRowToUser(row)
  }
}
```

## Frontend Architecture

The frontend follows a feature-based organization:

```text
src/
├── components/
│   ├── ui/          # Reusable UI components (Button, Card, etc.)
│   ├── game/        # Game-specific components
│   └── layout/      # Layout components (Header, etc.)
├── pages/           # Route pages
├── stores/          # Zustand state management
├── lib/             # Utilities (i18n, cn())
└── types/           # Re-exports from @the-box/types
```

### State Management

Zustand stores with persistence:

- **authStore**: User authentication state
- **gameStore**: Game session, timer, scores

## Data Flow

```text
User Action
    │
    ▼
React Component ──► Zustand Store ──► API Call
                                          │
                                          ▼
                                    Express Route
                                          │
                                          ▼
                                    Domain Service
                                          │
                                          ▼
                                    Repository ──► PostgreSQL
```

## Background Job System

The application uses BullMQ with Redis for background processing:

### Job Types

| Job Type | Description | Schedule |
| -------- | ----------- | -------- |
| `import-games` | Import games from RAWG API | On demand |
| `import-screenshots` | Fetch screenshots for games | On demand |
| `create-daily-challenge` | Generate daily challenge | Daily at midnight UTC |
| `sync-all-games` | Sync game data from RAWG | Weekly (Sundays 2 AM UTC) |

### Job Flow

```text
Admin triggers import ──► Job added to queue ──► Worker processes
                                                      │
                                                      ▼
                              Socket.io broadcasts progress to admin UI
                                                      │
                                                      ▼
                                              Job completed/failed
```

## External Integrations

### RAWG API

Games and screenshots are imported from [RAWG](https://rawg.io/apidocs):

- `rawg_id`: Unique RAWG game identifier stored in `games` table
- `last_synced_at`: Tracks when game data was last synchronized
- Automatic sync via scheduled background jobs

## Key Design Decisions

1. **Shared Types Package**: Single source of truth for TypeScript interfaces
2. **Repository Pattern**: Abstracts database access from business logic
3. **Service Layer**: Centralizes business rules, testable in isolation
4. **Thin Controllers**: Routes only handle HTTP concerns
5. **Zustand over Redux**: Simpler API, less boilerplate
6. **BullMQ + Redis**: Reliable background job processing with retry support
7. **Fuzzy Matching**: Forgiving game name validation for better UX
