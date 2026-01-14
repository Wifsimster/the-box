# Game Flow

This document explains the game mechanics, scoring system, and player progression.

## Overview

Players identify video games from 360° panoramic screenshots. Each daily challenge consists of 10 screenshots to identify.

## Game Structure

```text
Daily Challenge
    │
    └── 10 Screenshots - Speed-based scoring with penalty system
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

### Speed-Based Scoring

The game uses a speed-based scoring system where points are awarded based on how quickly you identify each screenshot:

- **Base score**: 100 points per screenshot
- **Speed multiplier**: Applied based on time taken to find the screenshot
- **Maximum score per screenshot**: 200 points (capped)

#### Speed Multiplier Tiers

| Time Taken | Multiplier | Points Earned |
| ---------- | ---------- | ------------ |
| < 3 seconds | 2.0x | 200 points |
| < 5 seconds | 1.75x | 175 points |
| < 10 seconds | 1.5x | 150 points |
| < 20 seconds | 1.25x | 125 points |
| 20+ seconds | 1.0x | 100 points |

```typescript
function calculateSpeedMultiplier(timeTakenMs: number): number {
  const timeTakenSeconds = timeTakenMs / 1000
  
  if (timeTakenSeconds < 3) return 2.0    // 200 points
  if (timeTakenSeconds < 5) return 1.75  // 175 points
  if (timeTakenSeconds < 10) return 1.5  // 150 points
  if (timeTakenSeconds < 20) return 1.25 // 125 points
  return 1.0                              // 100 points
}

scoreEarned = Math.min(200, Math.round(100 * calculateSpeedMultiplier(timeTakenMs)))
```

### Penalty System

Players can guess unlimited times, but penalties apply:

- **Wrong guess penalty**: -30 points per incorrect attempt (deducted from session score)
- **Hint penalty**: -20% of earned score (percentage-based, applied after speed multiplier)
- **Unfound penalty**: -100 points per unfound screenshot (applied when ending game early)

The penalty system encourages careful guessing while allowing multiple attempts.

### Maximum Score

- Per screenshot: 200 points (with perfect speed and no penalties)
- Per challenge (10 screenshots): 2,000 points maximum theoretical score

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
2. Timer starts (speed-based scoring begins)
         │
         ▼
3. Player types game name
         │
         ├──► Autocomplete suggestions appear (fuzzy matching)
         │
         ▼
4. Player submits guess
         │
         ├──► Correct? Calculate speed multiplier, apply hint penalty if used, next screenshot
         │
         └──► Wrong? -30 penalty, try again (timer continues)
         │
         ▼
5. Show result (correct game, score earned, penalties applied)
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
  "sessionStartedAt": "2025-01-10T14:30:00.000Z"
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
  "scoreEarned": 175,
  "totalScore": 175,
  "nextPosition": 2,
  "isCompleted": false,
  "hintPenalty": 35
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
  "totalScore": -30,
  "wrongGuessPenalty": 30,
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

  // Scoring
  totalScore: number
  screenshotsFound: number    // Correct answers count
  correctPositions: number[]  // Positions correctly guessed
  guessResults: GuessResult[]

  // Power-ups
  availablePowerUps: PowerUp[]
}
```
