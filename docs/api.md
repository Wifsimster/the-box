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
    "screenshotId": 1,
    "position": 1,
    "imageUrl": "/api/game/image/1",
    "bonusMultiplier": 1.0,
    "timeLimitSeconds": 45
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

### « Décris le jeu » (mode ombre, sans route dédiée)

Aucune route ni interface joueur. Quand `POST /api/game/guess` répond une réponse fausse, et seulement **après** la réponse, le texte est transmis en arrière-plan (file BullMQ `describe-guess`) s'il ressemble à une description : au moins 15 caractères et 2 mots, au plus 200 (la limite de `guessText`), et pas un titre ou alias du catalogue selon le même rapprochement flou que les réponses. Conditions : paramètres `describeGuess.enabled` activé **et** `describeGuess.anthropicApiKey` enregistrée ; au plus 20 captures par heure et par compte ; au plus une par capture d'écran et par partie. La réponse de `/guess`, le score et le minuteur ne changent pas.

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

### Centile d'un score

```http
GET /api/leaderboard/today/percentile?score=<n>
```

Public. Place un score quelconque sur le défi du jour. Un score inférieur à toutes les parties classées ne peut pas en faire partie : il est placé hypothétiquement et compté une fois dans `totalPlayers`. `rank <= totalPlayers` est toujours vrai.

```json
{
  "success": true,
  "data": { "percentile": 85, "rank": 15, "totalPlayers": 100 }
}
```

### Classement d'une partie du joueur

```http
GET /api/leaderboard/session/:sessionId/standing
```

Session requise, propriétaire de la partie uniquement (`404` sinon). Utilisé par la page de résultats. Le score, le rang et le total sont lus en une seule requête SQL à partir du score stocké de la partie, sur le défi de cette partie. Un score mis en cache sur un autre appareil n'intervient donc jamais. Une partie non classée (non terminée, rattrapage, invité) est placée hypothétiquement et comptée une fois dans `totalPlayers` (`ranked: false`).

```json
{
  "success": true,
  "data": {
    "sessionId": "3309fd63-…",
    "totalScore": 1925,
    "ranked": true,
    "percentile": 100,
    "rank": 1,
    "totalPlayers": 1
  }
}
```

### Classement mensuel par pays

```http
GET /api/leaderboard/monthly/:year/:month/countries
```

Public, session facultative. Le pays est déclaré par le joueur sur son profil (`user.country`, ISO 3166-1 alpha-2) ; il n'est jamais déduit de l'IP ni de la locale.

- Score d'un pays : moyenne, sur ses joueurs, du score moyen par partie de chacun dans le mois (parties terminées, hors rattrapage, comptes non anonymes). Chaque joueur pèse autant, quel que soit son nombre de parties.
- Un pays n'apparaît qu'à partir de `minPlayers` joueurs distincts dans le mois (`MIN_PLAYERS_PER_COUNTRY = 5`, `domain/services/country-leaderboard.ts`).
- Rang dense : deux pays au même score arrondi partagent le rang.
- `viewer` n'est présent que pour un joueur connecté (pas un invité) : son pays (`null` s'il n'en a pas) et le nombre de joueurs de ce pays dans le mois, même sous le seuil.

```json
{
  "success": true,
  "data": {
    "year": 2026,
    "month": 10,
    "minPlayers": 5,
    "entries": [{ "rank": 1, "countryCode": "FR", "averageScore": 1420, "playerCount": 12 }],
    "viewer": { "countryCode": "BE", "playerCount": 3 }
  }
}
```

Erreurs : `400 INVALID_YEAR`, `400 INVALID_MONTH`, `400 FUTURE_MONTH`.

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
      "timeLimitSeconds": 45,
      "screenshotIds": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    }
  ]
}
```

### Paramètres de l'application

Session admin. Les mêmes routes existent pour les agents sous `/api/agent/v1/settings` (clé agent avec la portée `admin:settings`, dont le propriétaire est toujours admin) ; ce sont elles qu'appellent les outils MCP `list_settings`, `get_setting` et `set_setting`.

```http
GET /api/admin/settings
GET /api/admin/settings/:key
PUT /api/admin/settings/:key        (POST accepté aussi)
Content-Type: application/json

{ "value": true }
```

`value` vaut un booléen, un nombre ou une chaîne selon le type ; `null` remet la valeur par défaut (ou efface un secret). Un secret n'est jamais renvoyé :

```json
{
  "key": "describeGuess.anthropicApiKey",
  "type": "secret",
  "group": "describeGuess",
  "value": null,
  "defaultValue": null,
  "isSet": true,
  "secret": { "set": true, "mask": "sk-ant-…abcd" },
  "updatedAt": "2026-10-12T10:00:00.000Z",
  "updatedBy": "user-id"
}
```

Erreurs : `400 INVALID_VALUE`, `400 VALIDATION_ERROR`, `404 UNKNOWN_SETTING`. Chaque écriture est journalisée dans `admin_audit_log` (`app_setting.update` : auteur, date, ancienne et nouvelle valeur, ou seulement `set: true|false` pour un secret).

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
POST   /api/admin/jobs/refresh-game-aliases # Alias RAWG des jeux existants (n'importe rien)
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
