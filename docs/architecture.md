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
│   Repositories, Database, Auth, Socket.io, External APIs │
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

```typescript
// Example: Score calculation in game.service.ts
calculateScore(isCorrect: boolean, timeTakenMs: number, timeLimitSeconds: number): number {
  if (!isCorrect) return 0

  const baseScore = 100
  const timeRatio = timeTakenMs / (timeLimitSeconds * 1000)

  let timeBonus = 0
  if (timeRatio < 0.25) timeBonus = 100
  else if (timeRatio < 0.75) timeBonus = Math.round(100 * (1 - (timeRatio - 0.25) / 0.5))

  return baseScore + timeBonus
}
```

#### Infrastructure Layer (`src/infrastructure/`)

- **Repositories**: Database access, query building
- **Database**: Connection management
- **Auth**: Better Auth integration
- **Socket**: Real-time communication

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

## Key Design Decisions

1. **Shared Types Package**: Single source of truth for TypeScript interfaces
2. **Repository Pattern**: Abstracts database access from business logic
3. **Service Layer**: Centralizes business rules, testable in isolation
4. **Thin Controllers**: Routes only handle HTTP concerns
5. **Zustand over Redux**: Simpler API, less boilerplate
