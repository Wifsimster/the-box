# SOLID Principles Review - Frontend

**Date:** 2026-01-11
**Reviewer:** Claude
**Scope:** `/packages/frontend/src`

## Executive Summary

This review examines the frontend codebase for adherence to SOLID principles adapted for React/TypeScript development. While the codebase demonstrates good component organization and separation of concerns in many areas, several violations were identified that impact maintainability, testability, and extensibility.

### Key Findings:
- ✅ **Strengths:** Good component composition, clear directory structure, type safety
- ⚠️ **Medium Issues:** Mixed responsibilities, tight coupling to stores
- ❌ **Critical Issues:** Mock data hardcoded in components, business logic in UI layer

### Overall Grade: **C+**

---

## SOLID Principles Applied to React

1. **Single Responsibility Principle (SRP)**: Each component/module should have one reason to change
2. **Open/Closed Principle (OCP)**: Components should be open for extension, closed for modification
3. **Liskov Substitution Principle (LSP)**: Component interfaces should be substitutable
4. **Interface Segregation Principle (ISP)**: Keep component props focused and minimal
5. **Dependency Inversion Principle (DIP)**: Depend on abstractions (interfaces/types), not concrete implementations

---

## Critical Issues (High Priority)

### 1. GuessInput.tsx - Multiple SOLID Violations

**File:** `packages/frontend/src/components/game/GuessInput.tsx:11-18`

#### 🔴 Violation: Single Responsibility Principle
The component has **4 distinct responsibilities**:
1. UI rendering (input, suggestions dropdown)
2. Game business logic (scoring algorithm)
3. Mock data management
4. State management (search, keyboard navigation)

```typescript
// PROBLEM: Mock data hardcoded in component
const mockGames: Game[] = [
  { id: 1, name: 'The Witcher 3: Wild Hunt', slug: 'witcher-3', aliases: ['Witcher 3', 'TW3'], releaseYear: 2015 },
  { id: 2, name: 'The Sims 4', slug: 'sims-4', aliases: ['Sims 4', 'TS4'], releaseYear: 2014 },
  // ...
]

// PROBLEM: Business logic in UI component (line 75-76)
const isCorrect = selectedGame?.name === 'The Witcher 3: Wild Hunt'
const scoreEarned = isCorrect ? Math.max(200 - Math.floor(timeTakenMs / 1000) * 5, 50) : 0
```

#### 🔴 Violation: Dependency Inversion Principle
The component directly depends on:
- Concrete Zustand store implementation
- Hardcoded mock data
- Concrete scoring algorithm

**Lines:** `6, 28-38, 70-97`

#### 🔴 Violation: Open/Closed Principle
Cannot change data source or scoring logic without modifying the component.

#### ✅ Recommendation:

**Create abstraction layers:**

```typescript
// 1. Create a game search service
// packages/frontend/src/services/gameSearchService.ts
export interface GameSearchService {
  search(query: string): Promise<Game[]>
}

export class MockGameSearchService implements GameSearchService {
  private games: Game[] = [/* mock data */]

  async search(query: string): Promise<Game[]> {
    return this.games.filter(game =>
      game.name.toLowerCase().includes(query.toLowerCase()) ||
      game.aliases.some(alias => alias.toLowerCase().includes(query.toLowerCase()))
    )
  }
}

export class ApiGameSearchService implements GameSearchService {
  async search(query: string): Promise<Game[]> {
    const response = await fetch(`/api/games/search?q=${encodeURIComponent(query)}`)
    return response.json()
  }
}

// 2. Create a scoring service
// packages/frontend/src/services/scoringService.ts
export interface ScoringService {
  calculateScore(timeTakenMs: number, isCorrect: boolean): number
}

export class TimerBasedScoringService implements ScoringService {
  calculateScore(timeTakenMs: number, isCorrect: boolean): number {
    if (!isCorrect) return 0
    return Math.max(200 - Math.floor(timeTakenMs / 1000) * 5, 50)
  }
}

// 3. Create a custom hook to encapsulate guess logic
// packages/frontend/src/hooks/useGameGuess.ts
export function useGameGuess(
  searchService: GameSearchService,
  scoringService: ScoringService
) {
  const store = useGameStore()

  const submitGuess = useCallback(async (game: Game | null, userInput: string) => {
    const timeTakenMs = Date.now() - (store.timerStartedAt || Date.now())

    // Validation would be done via API
    const isCorrect = await validateGuess(game, store.currentScreenshot)
    const scoreEarned = scoringService.calculateScore(timeTakenMs, isCorrect)

    store.pauseTimer()
    store.addGuessResult({
      position: store.currentPosition,
      isCorrect,
      correctGame: store.currentScreenshot?.game,
      userGuess: game?.name || userInput,
      timeTakenMs,
      scoreEarned,
    })

    if (isCorrect) {
      store.incrementCorrectAnswers()
    }

    store.updateScore(store.totalScore + scoreEarned)
    store.setGamePhase('result')
  }, [searchService, scoringService, store])

  return { submitGuess }
}

// 4. Refactor GuessInput to be a pure UI component
export function GuessInput({
  searchService,
  onSubmit
}: {
  searchService: GameSearchService
  onSubmit: (game: Game | null, query: string) => void
}) {
  // Only UI logic here - no business logic
  const [query, setQuery] = useState('')
  const [suggestions, setSuggestions] = useState<Game[]>([])

  useEffect(() => {
    if (query.length >= 2) {
      searchService.search(query).then(setSuggestions)
    }
  }, [query, searchService])

  // Just render UI and call onSubmit
}
```

**Impact:**
- ✅ Easy to test (can inject mock services)
- ✅ Easy to swap implementation (mock → API)
- ✅ Single responsibility (UI only)
- ✅ Follows dependency inversion

---

### 2. GamePage.tsx - Single Responsibility Violation

**File:** `packages/frontend/src/pages/GamePage.tsx:32-49`

#### 🔴 Violation: Single Responsibility Principle
The page component has **3 responsibilities**:
1. UI layout and rendering
2. Data fetching (world leaderboard)
3. Game phase orchestration

```typescript
// PROBLEM: API call directly in component
useEffect(() => {
  if (gamePhase === 'challenge_complete') {
    fetch('/api/leaderboard/today')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.entries) {
          const worldTotal = data.data.entries.reduce(
            (sum: number, entry: { totalScore: number }) => sum + entry.totalScore,
            0
          )
          setWorldTotalScore(worldTotal)
        }
      })
      .catch(() => {
        // Silently fail - world score is optional
      })
  }
}, [gamePhase])
```

#### ✅ Recommendation:

**Extract data fetching to a custom hook:**

```typescript
// packages/frontend/src/hooks/useWorldScore.ts
export function useWorldScore(enabled: boolean) {
  const [worldScore, setWorldScore] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!enabled) return

    setIsLoading(true)
    fetch('/api/leaderboard/today')
      .then(res => res.json())
      .then(data => {
        if (data.success && data.data?.entries) {
          const total = data.data.entries.reduce(
            (sum: number, entry: { totalScore: number }) => sum + entry.totalScore,
            0
          )
          setWorldScore(total)
        }
      })
      .catch(error => {
        console.warn('Failed to fetch world score:', error)
      })
      .finally(() => setIsLoading(false))
  }, [enabled])

  return { worldScore, isLoading }
}

// Usage in GamePage.tsx
const { worldScore } = useWorldScore(gamePhase === 'challenge_complete')
```

**Create a service layer for leaderboard operations:**

```typescript
// packages/frontend/src/services/leaderboardService.ts
export interface LeaderboardEntry {
  username: string
  totalScore: number
}

export interface LeaderboardService {
  getTodayLeaderboard(): Promise<LeaderboardEntry[]>
  getWorldTotalScore(): Promise<number>
}

export class ApiLeaderboardService implements LeaderboardService {
  async getTodayLeaderboard(): Promise<LeaderboardEntry[]> {
    const response = await fetch('/api/leaderboard/today')
    const data = await response.json()

    if (!data.success) {
      throw new Error('Failed to fetch leaderboard')
    }

    return data.data.entries
  }

  async getWorldTotalScore(): Promise<number> {
    const entries = await this.getTodayLeaderboard()
    return entries.reduce((sum, entry) => sum + entry.totalScore, 0)
  }
}
```

**Impact:**
- ✅ Reusable across components
- ✅ Easier to test
- ✅ Centralized error handling
- ✅ Type-safe

---

### 3. gameStore.ts - Single Responsibility Violation

**File:** `packages/frontend/src/stores/gameStore.ts`

#### 🔴 Violation: Single Responsibility Principle
The store manages **6 different domains**:
1. Session management
2. Round/screenshot state
3. Timer logic
4. Score tracking
5. Power-ups
6. Live leaderboard

**213 lines** doing too much.

#### ✅ Recommendation:

**Split into focused stores:**

```typescript
// packages/frontend/src/stores/gameSessionStore.ts
interface GameSessionState {
  sessionId: string | null
  tierSessionId: string | null
  challengeId: number | null
  challengeDate: string | null
  currentPosition: number
  totalScreenshots: number
  currentScreenshot: TierScreenshot | null
  gamePhase: GamePhase
  isLoading: boolean

  setSessionId: (id: string, tierSessionId: string) => void
  setChallengeId: (id: number, date: string) => void
  setScreenshot: (screenshot: TierScreenshot, position: number, total: number) => void
  setGamePhase: (phase: GamePhase) => void
  nextRound: () => void
  resetGame: () => void
}

// packages/frontend/src/stores/timerStore.ts
interface TimerState {
  timeRemaining: number
  defaultTimeLimit: number
  timerRunning: boolean
  timerStartedAt: number | null

  setTimeLimit: (seconds: number) => void
  startTimer: () => void
  pauseTimer: () => void
  decrementTimer: () => void
  resetTimer: () => void
}

// packages/frontend/src/stores/scoreStore.ts
interface ScoreState {
  totalScore: number
  correctAnswers: number
  guessResults: GuessResult[]
  lastResult: GuessResult | null

  addGuessResult: (result: GuessResult) => void
  updateScore: (points: number) => void
  incrementCorrectAnswers: () => void
  resetScore: () => void
}

// packages/frontend/src/stores/powerUpStore.ts
interface PowerUpState {
  availablePowerUps: PowerUp[]
  activePowerUp: PowerUpType | null

  addPowerUp: (powerUp: PowerUp) => void
  activatePowerUp: (type: PowerUpType) => void
  usePowerUp: (type: PowerUpType) => void
  clearActivePowerUp: () => void
}

// Compose stores in components
function useGameState() {
  const session = useGameSessionStore()
  const timer = useTimerStore()
  const score = useScoreStore()
  const powerUps = usePowerUpStore()

  return { session, timer, score, powerUps }
}
```

**Impact:**
- ✅ Each store has single responsibility
- ✅ Easier to test in isolation
- ✅ Better code organization
- ✅ Reduces coupling

---

## Medium Priority Issues

### 4. LiveLeaderboard.tsx - Dependency Inversion Violation

**File:** `packages/frontend/src/components/game/LiveLeaderboard.tsx:2-3, 7-8`

#### ⚠️ Violation: Dependency Inversion Principle
Component tightly coupled to two stores:

```typescript
import { useGameStore } from '@/stores/gameStore'
import { useAuthStore } from '@/stores/authStore'

export function LiveLeaderboard() {
  const { liveLeaderboard } = useGameStore()
  const { user } = useAuthStore()
  // ...
}
```

#### ✅ Recommendation:

**Use composition and prop injection:**

```typescript
// Make component accept data as props
export function LiveLeaderboard({
  players,
  currentUsername
}: {
  players: Array<{ username: string; score: number }>
  currentUsername: string | null
}) {
  if (players.length === 0) return null

  const sortedPlayers = [...players]
    .map(p => ({
      ...p,
      isCurrentUser: p.username === currentUsername
    }))
    .sort((a, b) => b.score - a.score)

  // Render UI
}

// Use a container component for data fetching
export function LiveLeaderboardContainer() {
  const { liveLeaderboard } = useGameStore()
  const { user } = useAuthStore()

  return (
    <LiveLeaderboard
      players={liveLeaderboard}
      currentUsername={user?.username || null}
    />
  )
}
```

**Benefits:**
- ✅ Easier to test (pass mock data)
- ✅ Reusable (can use in different contexts)
- ✅ Follows container/presentational pattern
- ✅ No direct store dependency

---

### 5. Header.tsx - Single Responsibility Violation

**File:** `packages/frontend/src/components/layout/Header.tsx:15-23`

#### ⚠️ Violation: Single Responsibility Principle
Mixing navigation UI with authentication logic:

```typescript
const handleSignOut = async () => {
  await signOut({
    fetchOptions: {
      onSuccess: () => {
        navigate(`/${currentLang}`)
      },
    },
  })
}
```

#### ✅ Recommendation:

**Extract auth logic to a custom hook:**

```typescript
// packages/frontend/src/hooks/useAuth.ts
export function useAuth() {
  const navigate = useNavigate()
  const { lang } = useParams<{ lang: string }>()
  const { data: session, isPending } = useSession()

  const handleSignOut = useCallback(async () => {
    await signOut({
      fetchOptions: {
        onSuccess: () => {
          navigate(`/${lang || 'fr'}`)
        },
      },
    })
  }, [navigate, lang])

  const handleSignIn = useCallback((redirectTo?: string) => {
    navigate(`/${lang || 'fr'}/login`, { state: { redirectTo } })
  }, [navigate, lang])

  return {
    session,
    isPending,
    isAuthenticated: !!session,
    signOut: handleSignOut,
    signIn: handleSignIn,
  }
}

// Simplified Header.tsx
export function Header() {
  const { t } = useTranslation()
  const { currentLang, localizedPath } = useLocalizedPath()
  const { session, isPending, signOut } = useAuth()

  return (
    <header className="sticky top-0 z-50 w-full">
      {/* Simple UI rendering */}
    </header>
  )
}
```

---

## Low Priority Issues

### 6. PanoramaViewer.tsx - Interface Segregation

**File:** `packages/frontend/src/components/game/PanoramaViewer.tsx`

#### ⚠️ Minor Issue: Props interface could be simplified

The component accepts technical panorama parameters (haov, vaov) that most consumers don't need.

#### ✅ Recommendation:

```typescript
// Split into basic and advanced props
interface PanoramaViewerBasicProps {
  imageUrl: string
  className?: string
}

interface PanoramaViewerAdvancedProps extends PanoramaViewerBasicProps {
  haov?: number
  vaov?: number
  autoRotate?: boolean
  autoRotateSpeed?: number
}

// Provide a simple default export
export function PanoramaViewer({ imageUrl, className }: PanoramaViewerBasicProps) {
  return <PanoramaViewerAdvanced imageUrl={imageUrl} className={className} />
}

// Advanced version for power users
export function PanoramaViewerAdvanced({
  imageUrl,
  className,
  haov = 360,
  vaov = 180,
  autoRotate = false,
  autoRotateSpeed = 2
}: PanoramaViewerAdvancedProps) {
  // Full implementation
}
```

---

## Well-Designed Components (Examples to Follow)

### ✅ Timer.tsx - Excellent Single Responsibility
- **Single purpose:** Display countdown timer
- **No business logic:** Just renders time
- **Well composed:** Uses Zustand for state but only for display
- **File:** `packages/frontend/src/components/game/Timer.tsx`

### ✅ ResultCard.tsx - Good Separation
- **Clear responsibility:** Show guess result
- **Proper composition:** Accepts data via store
- **Good animations:** Uses Framer Motion properly

### ✅ useLocalizedPath.ts - Great Custom Hook
- **Single responsibility:** Manage localized routing
- **Reusable:** Can be used across components
- **Type-safe:** Proper TypeScript usage

---

## Recommended Architecture Changes

### 1. Introduce a Service Layer

```
packages/frontend/src/services/
├── gameSearchService.ts       # Game search/autocomplete
├── scoringService.ts          # Score calculation
├── leaderboardService.ts      # Leaderboard operations
├── powerUpService.ts          # Power-up logic
└── types.ts                   # Service interfaces
```

### 2. Extract Business Logic to Hooks

```
packages/frontend/src/hooks/
├── useGameGuess.ts            # Guess submission logic
├── useGameRound.ts            # Round progression
├── useWorldScore.ts           # World score fetching
├── useAuth.ts                 # Authentication
└── usePowerUp.ts              # Power-up activation
```

### 3. Separate Presentational and Container Components

```typescript
// Presentational (pure, testable)
export function LiveLeaderboard({ players, currentUser }) { }

// Container (data fetching)
export function LiveLeaderboardContainer() {
  const data = useGameStore()
  return <LiveLeaderboard {...data} />
}
```

### 4. Split Large Stores

```
packages/frontend/src/stores/
├── gameSessionStore.ts        # Session & round state
├── timerStore.ts              # Timer logic
├── scoreStore.ts              # Score tracking
├── powerUpStore.ts            # Power-ups
└── leaderboardStore.ts        # Live leaderboard
```

---

## Priority Action Items

### Immediate (Week 1)
1. ✅ Extract mock data from `GuessInput.tsx` to a service
2. ✅ Create `useGameGuess` hook for guess logic
3. ✅ Extract world score fetching to custom hook

### Short-term (Week 2-3)
4. ✅ Split `gameStore.ts` into focused stores
5. ✅ Refactor `LiveLeaderboard` to use composition
6. ✅ Create service interfaces for API calls

### Medium-term (Month 1)
7. ✅ Implement API-based game search service
8. ✅ Add comprehensive unit tests for services
9. ✅ Document service layer architecture

---

## Testing Benefits

After refactoring, testing becomes much easier:

```typescript
// BEFORE: Hard to test
describe('GuessInput', () => {
  it('should calculate score correctly', () => {
    // Can't test without rendering entire component
  })
})

// AFTER: Easy to test
describe('TimerBasedScoringService', () => {
  it('should calculate score correctly', () => {
    const service = new TimerBasedScoringService()
    expect(service.calculateScore(5000, true)).toBe(175)
    expect(service.calculateScore(5000, false)).toBe(0)
  })
})

describe('GuessInput', () => {
  it('should render suggestions', () => {
    const mockService = new MockGameSearchService()
    render(<GuessInput searchService={mockService} onSubmit={jest.fn()} />)
    // Test only UI behavior
  })
})
```

---

## Conclusion

The frontend codebase has a solid foundation but would significantly benefit from:

1. **Service Layer:** Separating business logic from UI components
2. **Custom Hooks:** Encapsulating reusable logic
3. **Store Splitting:** Breaking monolithic stores into focused modules
4. **Composition:** Using container/presentational pattern
5. **Dependency Injection:** Making components more testable

These changes will improve:
- ✅ Testability (easier to unit test)
- ✅ Maintainability (smaller, focused files)
- ✅ Reusability (components can be reused)
- ✅ Extensibility (easy to add features)
- ✅ Type safety (clearer interfaces)

**Estimated Effort:** 2-3 weeks for full refactoring
**Risk:** Low (can be done incrementally)
**Impact:** High (significant improvement in code quality)

---

## References

- [SOLID Principles in React](https://konstantinlebedev.com/solid-in-react/)
- [React Component Patterns](https://www.patterns.dev/posts/presentational-container-pattern)
- [Zustand Best Practices](https://docs.pmnd.rs/zustand/guides/practice-with-no-store-actions)
- [Clean Architecture in Frontend](https://dev.to/bespoyasov/clean-architecture-on-frontend-4311)
