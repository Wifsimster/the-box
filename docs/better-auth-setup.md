# Mise en place Better Auth

Guide pas-à-pas pour terminer la configuration de Better Auth dans un environnement neuf.

## Prérequis

- PostgreSQL en marche (Docker : `docker compose -f compose.local.yml up -d`)
- Node.js ≥ 24
- Dépendances installées (`npm install` à la racine)

## Étape 1 — Générer le schéma de base de données

Better Auth requiert ses propres tables. Lancez la CLI pour les créer :

```bash
cd packages/backend
npx @better-auth/cli generate   # Génère le fichier de migration
npx @better-auth/cli migrate    # Applique les migrations
```

Tables créées :

| Table | Rôle |
|-------|------|
| `user` | Comptes utilisateurs |
| `session` | Sessions actives |
| `account` | Comptes OAuth ou e-mail/mot de passe |
| `verification` | Jetons de vérification d'e-mail |

## Étape 2 — Configurer les variables d'environnement

```bash
cp .env.example .env
```

### Variables obligatoires

| Variable | Description | Exemple |
|----------|-------------|---------|
| `DATABASE_URL` | Chaîne de connexion PostgreSQL | `postgresql://thebox:thebox_secret@localhost:5432/thebox` |
| `BETTER_AUTH_SECRET` | Clé de signature (≥ 32 caractères) | `openssl rand -base64 32` |
| `API_URL` | URL publique du backend | `http://localhost:3000` |
| `CORS_ORIGIN` | URL du frontend | `http://localhost:5173` |

### Configuration e-mail (optionnelle en dev)

| Variable | Description |
|----------|-------------|
| `RESEND_API_KEY` | Clé Resend pour envoyer les e-mails |
| `EMAIL_FROM` | Adresse d'expéditeur |

> **À noter.** Sans `RESEND_API_KEY`, les liens de réinitialisation s'affichent dans la console (mode dev).

## Étape 3 — Récupérer une clé Resend (production)

1. Créez un compte sur [resend.com](https://resend.com)
2. Vérifiez votre domaine ou utilisez le domaine sandbox pour les tests
3. Générez une clé API depuis le tableau de bord
4. Renseignez-la dans `.env`

## Étape 4 — Lancer l'application

```bash
# Depuis la racine
npm run dev
```

Backend disponible sur `http://localhost:3000`, frontend sur `http://localhost:5173`.

## Étape 5 — Tester les flux

### Inscription

1. Rendez-vous sur `http://localhost:5173/register`
2. Renseignez nom d'utilisateur, e-mail, mot de passe
3. Validez — vous êtes redirigé vers l'accueil

### Connexion

1. `http://localhost:5173/login`
2. Saisissez vos identifiants
3. Votre nom d'utilisateur apparaît dans le header

### Mode invité

Cliquez sur « Continuer en tant qu'invité » sur la page de connexion.

### Réinitialisation de mot de passe

1. `http://localhost:5173/forgot-password`
2. Saisissez votre e-mail
3. Consultez votre boîte de réception (ou la console en dev) pour le lien
4. Cliquez et choisissez un nouveau mot de passe

### Déconnexion

Cliquez sur votre nom d'utilisateur dans le header puis sur « Déconnexion ».

## Endpoints exposés

> **Détail technique.** Better Auth route automatiquement ces endpoints sous `/api/auth/*`.

| Méthode | Endpoint | Description |
|---------|----------|-------------|
| POST | `/api/auth/sign-up/email` | Inscription par e-mail/mot de passe |
| POST | `/api/auth/sign-in/email` | Connexion par e-mail |
| POST | `/api/auth/sign-in/username` | Connexion par nom d'utilisateur |
| POST | `/api/auth/sign-in/anonymous` | Connexion invité |
| POST | `/api/auth/sign-out` | Déconnexion |
| GET | `/api/auth/session` | Session courante |
| POST | `/api/auth/forget-password` | Demande de réinitialisation |
| POST | `/api/auth/reset-password` | Validation de la réinitialisation |

## Dépannage

### Erreur « Browser is not installed » (Playwright)

```bash
npx playwright install chromium
```

### La session ne persiste pas

- Vérifiez que `CORS_ORIGIN` correspond exactement à l'URL du frontend
- Côté frontend, utilisez `credentials: 'include'` sur les requêtes

### L'e-mail de réinitialisation n'arrive pas

- Vérifiez que `RESEND_API_KEY` est bien renseigné
- En dev, le lien s'affiche dans la console
- Vérifiez que votre domaine est validé dans Resend

### Erreur de connexion à la base de données

- PostgreSQL doit tourner : `docker compose -f compose.local.yml up -d`
- `DATABASE_URL` doit correspondre à votre configuration Docker

## Migration depuis un système existant

Si vous avez déjà une table `users` à migrer vers Better Auth :

1. Exporter les données existantes
2. Recréer les utilisateurs via l'API Better Auth ou en SQL direct
3. Lier les données métier (sessions, scores) via `auth_user_id`

Un script de migration peut être écrit en fonction de votre cas.
