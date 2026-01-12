# API Reference

Base URL: `http://localhost:3000/api`

## Authentication

Authentication is handled by Better Auth. See [authentication.md](./authentication.md).

| Endpoint | Method | Description |
| -------- | ------ | ----------- |
| `/auth/sign-up/email` | POST | Register |
| `/auth/sign-in/email` | POST | Login |
| `/auth/sign-out` | POST | Logout |
| `/auth/session` | GET | Get session |

## Game Endpoints

### Get Today's Challenge

```http
GET /api/game/today
Authorization: Bearer <token> (optional)
```

**Response:**
```json
{
  "success": true,
  "data": {
    "challengeId": 1,
    "date": "2025-01-10",
    "totalScreenshots": 10,
    "hasPlayed": false,
    "userSession": null
  }
}
```

### Start Challenge

```http
POST /api/game/start/:challengeId
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "tierSessionId": "550e8400-e29b-41d4-a716-446655440001",
    "totalScreenshots": 10,
    "sessionStartedAt": "2025-01-10T14:30:00.000Z",
    "scoringConfig": {
      "initialScore": 1000,
      "decayRate": 2
    }
  }
}
```

### Get Screenshot

```http
GET /api/game/screenshot?sessionId=<uuid>&position=<number>
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "position": 1,
    "imageUrl": "/uploads/screenshots/screenshot1.jpg",
    "haov": 180,
    "vaov": 90,
    "timeLimit": 30,
    "bonusMultiplier": 1.0
  }
}
```

### Submit Guess

```http
POST /api/game/guess
Authorization: Bearer <token>
Content-Type: application/json
```

**Request:**
```json
{
  "tierSessionId": "550e8400-e29b-41d4-a716-446655440001",
  "screenshotId": 1,
  "position": 1,
  "gameId": 42,
  "guessText": "The Witcher 3"
}
```

**Response (correct):**
```json
{
  "success": true,
  "data": {
    "isCorrect": true,
    "correctGame": {
      "id": 42,
      "name": "The Witcher 3: Wild Hunt",
      "slug": "the-witcher-3",
      "aliases": [],
      "coverImageUrl": "/covers/witcher3.jpg"
    },
    "scoreEarned": 850,
    "totalScore": 850,
    "nextPosition": 2,
    "isCompleted": false
  }
}
```

**Response (wrong):**
```json
{
  "success": true,
  "data": {
    "isCorrect": false,
    "correctGame": {
      "id": 42,
      "name": "The Witcher 3: Wild Hunt",
      "slug": "the-witcher-3",
      "aliases": [],
      "coverImageUrl": "/covers/witcher3.jpg"
    },
    "scoreEarned": 0,
    "scorePenalty": 50,
    "totalScore": -50,
    "nextPosition": null,
    "isCompleted": false
  }
}
```

### Search Games (Autocomplete)

```http
GET /api/game/games/search?q=<query>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "games": [
      { "id": 42, "name": "The Witcher 3: Wild Hunt", "releaseYear": 2015 },
      { "id": 43, "name": "The Witcher 2", "releaseYear": 2011 }
    ]
  }
}
```

## Leaderboard Endpoints

### Get Today's Leaderboard

```http
GET /api/leaderboard/today
```

**Response:**
```json
{
  "success": true,
  "data": {
    "date": "2025-01-10",
    "challengeId": 1,
    "entries": [
      {
        "rank": 1,
        "userId": "uuid",
        "username": "player1",
        "displayName": "Player One",
        "totalScore": 5400,
        "completedAt": "2025-01-10T14:30:00Z"
      }
    ]
  }
}
```

### Get Leaderboard by Date

```http
GET /api/leaderboard/:date
```

Date format: `YYYY-MM-DD`

### Get Today's Percentile

```http
GET /api/leaderboard/today/percentile
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "percentile": 85,
    "rank": 15,
    "totalPlayers": 100
  }
}
```

## User Endpoints

### Get Game History

```http
GET /api/user/history
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "games": [
      {
        "sessionId": "uuid",
        "challengeDate": "2025-01-10",
        "totalScore": 5400,
        "completedAt": "2025-01-10T14:30:00Z",
        "tierResults": [
          { "tierNumber": 1, "score": 1800, "correctAnswers": 15 },
          { "tierNumber": 2, "score": 1800, "correctAnswers": 14 },
          { "tierNumber": 3, "score": 1800, "correctAnswers": 12 }
        ]
      }
    ]
  }
}
```

## Admin Endpoints

All admin endpoints require authentication and admin privileges.

### Games

```http
GET    /api/admin/games           # List all games
POST   /api/admin/games           # Create game
PUT    /api/admin/games/:id       # Update game
DELETE /api/admin/games/:id       # Delete game
```

### Screenshots

```http
GET  /api/admin/screenshots       # List all screenshots
POST /api/admin/screenshots       # Create screenshot
```

### Challenges

```http
GET  /api/admin/challenges        # List all challenges
POST /api/admin/challenges        # Create challenge
```

**Create Challenge Request:**
```json
{
  "challengeDate": "2025-01-15",
  "tiers": [
    {
      "tierNumber": 1,
      "name": "Facile",
      "timeLimitSeconds": 30,
      "screenshotIds": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18]
    }
  ]
}
```

### Jobs (Background Tasks)

Manage background import jobs for games and screenshots.

```http
GET    /api/admin/jobs                    # List all jobs
GET    /api/admin/jobs/stats              # Get job statistics
GET    /api/admin/jobs/:id                # Get job details
POST   /api/admin/jobs                    # Create generic job
POST   /api/admin/jobs/import-games       # Import games from RAWG API
POST   /api/admin/jobs/import-screenshots # Import screenshots for games
POST   /api/admin/jobs/full-import        # Full import with pause/resume
POST   /api/admin/jobs/full-import/pause  # Pause full import
POST   /api/admin/jobs/full-import/resume # Resume full import
POST   /api/admin/jobs/sync-all           # Sync all games from RAWG
DELETE /api/admin/jobs/:id                # Cancel a job
DELETE /api/admin/jobs/completed          # Clear completed jobs
```

**Import Games Request:**
```json
{
  "query": "action rpg",
  "page": 1,
  "pageSize": 20
}
```

**Job Response:**
```json
{
  "success": true,
  "data": {
    "jobId": "abc123",
    "type": "import-games",
    "status": "active",
    "progress": 45,
    "createdAt": "2025-01-10T14:30:00.000Z"
  }
}
```

## Error Responses

All errors follow this format:

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

### Common Error Codes

| Code | HTTP Status | Description |
| ---- | ----------- | ----------- |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `INVALID_TOKEN` | 401 | Token expired or invalid |
| `NOT_FOUND` | 404 | Resource not found |
| `VALIDATION_ERROR` | 400 | Invalid request data |
| `INTERNAL_ERROR` | 500 | Server error |
| `SESSION_NOT_FOUND` | 404 | Game session not found |
| `TIER_NOT_FOUND` | 404 | Tier not found |
| `SCREENSHOT_NOT_FOUND` | 404 | Screenshot not found |
