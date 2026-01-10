# Game Flow

This document explains the game mechanics, scoring system, and player progression.

## Overview

Players identify video games from 360° panoramic screenshots. Each daily challenge consists of 3 tiers with 18 screenshots each.

## Game Structure

```text
Daily Challenge
    │
    ├── Tier 1 (Easy)      - 18 screenshots, 30s timer
    ├── Tier 2 (Medium)    - 18 screenshots, 25s timer
    └── Tier 3 (Hard)      - 18 screenshots, 20s timer
```

## Game Phases

```text
idle ──► tier_intro ──► playing ──► result ──► tier_complete ──► challenge_complete
                            │           │
                            └───────────┘
                           (next screenshot)
```

| Phase | Description |
| ----- | ----------- |
| `idle` | Waiting to start |
| `tier_intro` | Showing tier name and rules |
| `playing` | Active gameplay, timer running |
| `result` | Showing correct answer |
| `tier_complete` | Tier summary |
| `challenge_complete` | Final results |

## Scoring System

### Base Score

- **Correct answer**: 100 points
- **Incorrect answer**: 0 points

### Time Bonus

Fast answers earn bonus points:

```typescript
calculateScore(isCorrect, timeTakenMs, timeLimitSeconds) {
  if (!isCorrect) return 0

  const baseScore = 100
  const timeRatio = timeTakenMs / (timeLimitSeconds * 1000)

  let timeBonus = 0
  if (timeRatio < 0.25) {
    // Very fast: full bonus
    timeBonus = 100
  } else if (timeRatio < 0.75) {
    // Moderate: scaled bonus
    timeBonus = Math.round(100 * (1 - (timeRatio - 0.25) / 0.5))
  }
  // Slow (>75% time): no bonus

  return baseScore + timeBonus  // Max: 200 points
}
```

| Time Used | Bonus | Total |
| --------- | ----- | ----- |
| < 25% | +100 | 200 |
| 25-50% | +50-100 | 150-200 |
| 50-75% | +0-50 | 100-150 |
| > 75% | +0 | 100 |

### Maximum Score

- Per screenshot: 200 points
- Per tier (18 screenshots): 3,600 points
- Per challenge (3 tiers): 10,800 points

## Power-ups

| Power-up | Effect | Earned |
| -------- | ------ | ------ |
| `x2_timer` | Doubles remaining time | Every 6 correct answers |
| `hint` | Reveals first letter | Random bonus rounds |

### Bonus Rounds

After positions 6, 12, and 18, a bonus round may appear offering power-ups.

## Gameplay Loop

```text
1. Show screenshot (360° panorama)
         │
         ▼
2. Start timer (30/25/20 seconds)
         │
         ▼
3. Player types game name
         │
         ├──► Autocomplete suggestions appear
         │
         ▼
4. Player submits guess (or timer expires)
         │
         ▼
5. Show result (correct game, score earned)
         │
         ▼
6. Check for bonus round (positions 6, 12, 18)
         │
         ▼
7. Next screenshot OR tier complete
```

## API Flow

### Starting a Challenge

```http
GET /api/game/today
```

Response:
```json
{
  "challengeId": 1,
  "date": "2025-01-10",
  "tiers": [
    { "tierNumber": 1, "name": "Facile", "screenshotCount": 18 },
    { "tierNumber": 2, "name": "Moyen", "screenshotCount": 18 },
    { "tierNumber": 3, "name": "Difficile", "screenshotCount": 18 }
  ],
  "hasPlayed": false,
  "userSession": null
}
```

### Starting a Tier

```http
POST /api/game/start/:tierId
```

Response:
```json
{
  "sessionId": "uuid",
  "tierSessionId": "uuid",
  "tierNumber": 1,
  "tierName": "Facile",
  "timeLimit": 30,
  "totalScreenshots": 18
}
```

### Getting a Screenshot

```http
GET /api/game/screenshot?sessionId=xxx&position=1
```

Response:
```json
{
  "position": 1,
  "imageUrl": "/uploads/screenshots/game1.jpg",
  "haov": 180,
  "vaov": 90,
  "timeLimit": 30,
  "bonusMultiplier": 1.0
}
```

### Submitting a Guess

```http
POST /api/game/guess
```

Request:
```json
{
  "tierSessionId": "uuid",
  "screenshotId": 1,
  "position": 1,
  "gameId": 42,
  "guessText": "The Witcher 3",
  "timeTakenMs": 5000
}
```

Response:
```json
{
  "isCorrect": true,
  "correctGame": {
    "id": 42,
    "name": "The Witcher 3: Wild Hunt",
    "coverImageUrl": "/covers/witcher3.jpg"
  },
  "scoreEarned": 180,
  "totalScore": 180,
  "nextPosition": 2,
  "isTierCompleted": false,
  "isCompleted": false
}
```

## State Management

The frontend uses Zustand to track game state:

```typescript
interface GameState {
  // Session
  sessionId: string | null
  challengeId: number | null
  currentTier: number
  currentPosition: number

  // Timer
  timeRemaining: number
  isTimerRunning: boolean

  // Scoring
  totalScore: number
  tierScores: number[]
  guessResults: GuessResult[]

  // Power-ups
  availablePowerUps: PowerUp[]
}
```
