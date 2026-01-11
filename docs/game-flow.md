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

### Countdown Scoring

The game uses a countdown scoring system where points decrease over time:

- **Initial score**: 1000 points per screenshot
- **Decay rate**: 2 points per second
- **Minimum score**: 0 points

```typescript
calculateCurrentScore(sessionStartedAt: Date, initialScore: number, decayRate: number): number {
  const elapsedMs = Date.now() - sessionStartedAt.getTime()
  const elapsedSeconds = Math.floor(elapsedMs / 1000)
  return Math.max(0, initialScore - (elapsedSeconds * decayRate))
}
```

| Time Elapsed | Score |
| ------------ | ----- |
| 0 seconds | 1000 |
| 100 seconds | 800 |
| 250 seconds | 500 |
| 500+ seconds | 0 |

When a player submits a **correct** guess, they "lock in" the current countdown value as their score for that screenshot.

### Tries System

Players get multiple attempts per screenshot:

- **Maximum tries**: 3 per screenshot
- **Wrong guess**: Does not end the round (until 3rd try)
- **Score**: Only awarded on correct guess

After 3 incorrect guesses, the round ends with 0 points for that screenshot.

### Maximum Score

- Per screenshot: 1,000 points
- Per tier (18 screenshots): 18,000 points
- Per challenge (3 tiers): 54,000 points

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
2. Score countdown begins (1000 → 0)
         │
         ▼
3. Player types game name
         │
         ├──► Autocomplete suggestions appear
         │
         ▼
4. Player submits guess
         │
         ├──► Correct? Lock in current score, next screenshot
         │
         ├──► Wrong (tries < 3)? Try again, score keeps decaying
         │
         └──► Wrong (tries = 3)? 0 points, next screenshot
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

### Starting a Challenge Session

```http
POST /api/game/start/:challengeId
```

Response:
```json
{
  "sessionId": "uuid",
  "tierSessionId": "uuid",
  "tierNumber": 1,
  "tierName": "Facile",
  "totalScreenshots": 18,
  "sessionStartedAt": "2025-01-10T14:30:00.000Z",
  "scoringConfig": {
    "initialScore": 1000,
    "decayRate": 2,
    "maxTriesPerScreenshot": 3
  }
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
  "guessText": "The Witcher 3"
}
```

Response (correct guess):
```json
{
  "isCorrect": true,
  "tryNumber": 1,
  "triesRemaining": 0,
  "correctGame": {
    "id": 42,
    "name": "The Witcher 3: Wild Hunt",
    "coverImageUrl": "/covers/witcher3.jpg"
  },
  "scoreEarned": 850,
  "totalScore": 850,
  "nextPosition": 2,
  "isTierCompleted": false,
  "isCompleted": false
}
```

Response (wrong guess, tries remaining):
```json
{
  "isCorrect": false,
  "tryNumber": 1,
  "triesRemaining": 2,
  "correctGame": null,
  "scoreEarned": 0,
  "totalScore": 0,
  "nextPosition": null,
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
  sessionStartedAt: string | null

  // Countdown Scoring
  scoringConfig: {
    initialScore: number      // Default: 1000
    decayRate: number         // Default: 2 points/second
    maxTriesPerScreenshot: number  // Default: 3
  } | null
  currentScore: number        // Calculated from elapsed time
  triesRemaining: number      // Tries left for current screenshot

  // Scoring
  totalScore: number
  tierScores: number[]
  guessResults: GuessResult[]

  // Power-ups
  availablePowerUps: PowerUp[]
}
```
