# Game Flow

This document explains the game mechanics, scoring system, and player progression.

## Overview

Players identify video games from 360° panoramic screenshots. Each daily challenge consists of 10 screenshots to identify.

## Game Structure

```text
Daily Challenge
    │
    └── 10 Screenshots - Countdown scoring with penalty system
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

- **Initial score**: 1000 points (countdown starts here)
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

### Penalty System

Players can guess unlimited times, but wrong guesses incur penalties:

- **Wrong guess penalty**: -50 points from session score
- **Unfound penalty**: -100 points if screenshot not identified
- **Correct guess**: Locks in current countdown score

The penalty system encourages careful guessing while allowing multiple attempts.

### Maximum Score

- Per screenshot: 1,000 points
- Per challenge (10 screenshots): 10,000 points

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
         ├──► Autocomplete suggestions appear (fuzzy matching)
         │
         ▼
4. Player submits guess
         │
         ├──► Correct? Lock in current score, next screenshot
         │
         └──► Wrong? -50 penalty, try again (score keeps decaying)
         │
         ▼
5. Show result (correct game, score earned)
         │
         ▼
6. Next screenshot OR challenge complete (after 10)
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
  "totalScreenshots": 10,
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
  "totalScreenshots": 10,
  "sessionStartedAt": "2025-01-10T14:30:00.000Z",
  "scoringConfig": {
    "initialScore": 1000,
    "decayRate": 2
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
  "correctGame": {
    "id": 42,
    "name": "The Witcher 3: Wild Hunt",
    "coverImageUrl": "/covers/witcher3.jpg"
  },
  "scoreEarned": 850,
  "totalScore": 850,
  "nextPosition": 2,
  "isCompleted": false
}
```

Response (wrong guess):
```json
{
  "isCorrect": false,
  "correctGame": {
    "id": 42,
    "name": "The Witcher 3: Wild Hunt",
    "coverImageUrl": "/covers/witcher3.jpg"
  },
  "scoreEarned": 0,
  "scorePenalty": 50,
  "totalScore": -50,
  "nextPosition": null,
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
  currentPosition: number
  sessionStartedAt: string | null

  // Countdown Scoring
  scoringConfig: {
    initialScore: number      // Default: 1000
    decayRate: number         // Default: 2 points/second
  } | null
  currentScore: number        // Calculated from elapsed time

  // Scoring
  totalScore: number
  screenshotsFound: number    // Correct answers count
  correctPositions: number[]  // Positions correctly guessed
  guessResults: GuessResult[]

  // Power-ups
  availablePowerUps: PowerUp[]
}
```
