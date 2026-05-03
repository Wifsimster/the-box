# Référence API

Référence des endpoints REST exposés par le backend. Pour les développeurs côté client ou intégrateurs.

> **Note.** Ce document couvre les principaux endpoints `game`, `leaderboard`, `user`, `admin`. Pour les modules récents — `geo`, `billing`, `referral`, `daily-login`, `achievement`, `screenshot-report`, `og` — se référer directement aux fichiers `packages/backend/src/presentation/routes/*.routes.ts`.

URL de base : `http://localhost:3000/api` (dev) ou `https://the-box.battistella.ovh/api` (prod).

Toutes les réponses suivent le format `{ success: boolean, data?: ..., error?: ... }`.

## Authentification

Gérée par Better Auth — voir [authentication.md](./authentication.md).

| Endpoint | Méthode | Description |
|----------|---------|-------------|
| `/auth/sign-up/email` | POST | Inscription |
| `/auth/sign-in/email` | POST | Connexion |
| `/auth/sign-out` | POST | Déconnexion |
| `/auth/session` | GET | Récupère la session |

## Endpoints Game

### Récupérer le défi du jour

```http
GET /api/game/today
Authorization: Bearer <token> (optionnel)
```

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

### Démarrer un défi

```http
POST /api/game/start/:challengeId
Authorization: Bearer <token>
```

```json
{
  "success": true,
  "data": {
    "sessionId": "550e8400-e29b-41d4-a716-446655440000",
    "tierSessionId": "550e8400-e29b-41d4-a716-446655440001",
    "totalScreenshots": 10,
    "sessionStartedAt": "2025-01-10T14:30:00.000Z",
    "scoringConfig": { "initialScore": 1000, "decayRate": 2 }
  }
}
```

### Récupérer une capture

```http
GET /api/game/screenshot?sessionId=<uuid>&position=<number>
Authorization: Bearer <token>
```

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

### Soumettre une réponse

```http
POST /api/game/guess
Authorization: Bearer <token>
Content-Type: application/json
```

Requête :

```json
{
  "tierSessionId": "550e8400-e29b-41d4-a716-446655440001",
  "screenshotId": 1,
  "position": 1,
  "gameId": 42,
  "guessText": "The Witcher 3"
}
```

Réponse correcte :

```json
{
  "success": true,
  "data": {
    "isCorrect": true,
    "correctGame": {
      "id": 42,
      "name": "The Witcher 3: Wild Hunt",
      "slug": "the-witcher-3",
      "coverImageUrl": "/covers/witcher3.jpg"
    },
    "scoreEarned": 850,
    "totalScore": 850,
    "nextPosition": 2,
    "isCompleted": false
  }
}
```

Réponse incorrecte :

```json
{
  "success": true,
  "data": {
    "isCorrect": false,
    "correctGame": { "id": 42, "name": "The Witcher 3: Wild Hunt" },
    "scoreEarned": 0,
    "scorePenalty": 50,
    "totalScore": -50,
    "nextPosition": null,
    "isCompleted": false
  }
}
```

### Auto-complétion de jeux

```http
GET /api/game/games/search?q=<query>
```

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

## Endpoints Leaderboard

### Classement du jour

```http
GET /api/leaderboard/today
```

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

### Classement à une date donnée

```http
GET /api/leaderboard/:date
```

Format : `YYYY-MM-DD`.

### Centile du joueur courant

```http
GET /api/leaderboard/today/percentile
Authorization: Bearer <token>
```

```json
{
  "success": true,
  "data": { "percentile": 85, "rank": 15, "totalPlayers": 100 }
}
```

## Endpoints User

### Historique de parties

```http
GET /api/user/history
Authorization: Bearer <token>
```

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
          { "tierNumber": 1, "score": 1800, "correctAnswers": 15 }
        ]
      }
    ]
  }
}
```

## Endpoints Admin

> **Détail technique.** Toutes les routes admin requièrent une session authentifiée et le flag `is_admin`. Le journal d'audit (`admin-audit`) trace toutes les opérations.

### Jeux

```http
GET    /api/admin/games           # Lister
POST   /api/admin/games           # Créer
PUT    /api/admin/games/:id       # Mettre à jour
DELETE /api/admin/games/:id       # Supprimer
```

### Captures

```http
GET  /api/admin/screenshots
POST /api/admin/screenshots
```

### Défis

```http
GET  /api/admin/challenges
POST /api/admin/challenges
```

Création d'un défi :

```json
{
  "challengeDate": "2025-01-15",
  "tiers": [
    {
      "tierNumber": 1,
      "name": "Facile",
      "timeLimitSeconds": 30,
      "screenshotIds": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    }
  ]
}
```

### Tâches en arrière-plan

```http
GET    /api/admin/jobs                    # Lister
GET    /api/admin/jobs/stats              # Statistiques
GET    /api/admin/jobs/:id                # Détails
POST   /api/admin/jobs                    # Créer une tâche générique
POST   /api/admin/jobs/import-games       # Importer depuis RAWG
POST   /api/admin/jobs/import-screenshots # Importer des captures
POST   /api/admin/jobs/full-import        # Import complet (pause/resume)
POST   /api/admin/jobs/full-import/pause
POST   /api/admin/jobs/full-import/resume
POST   /api/admin/jobs/sync-all
DELETE /api/admin/jobs/:id                # Annuler
DELETE /api/admin/jobs/completed          # Purger les tâches terminées
```

Réponse type d'une tâche :

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

## Format des erreurs

```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Message lisible"
  }
}
```

| Code | HTTP | Description |
|------|------|-------------|
| `UNAUTHORIZED` | 401 | Jeton manquant ou invalide |
| `INVALID_TOKEN` | 401 | Jeton expiré |
| `NOT_FOUND` | 404 | Ressource introuvable |
| `VALIDATION_ERROR` | 400 | Données de requête invalides |
| `INTERNAL_ERROR` | 500 | Erreur serveur |
| `SESSION_NOT_FOUND` | 404 | Session de jeu introuvable |
| `TIER_NOT_FOUND` | 404 | Palier introuvable |
| `SCREENSHOT_NOT_FOUND` | 404 | Capture introuvable |
