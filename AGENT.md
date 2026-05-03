# AGENT.md — The Box

Instructions destinées aux agents IA autonomes opérant sur ce dépôt. À lire avant toute modification automatisée.

## Résumé du projet

The Box est une application gaming où les joueurs identifient des jeux vidéo à partir de captures d'écran. Le produit propose des défis quotidiens, des classements en direct, un mode géo (localisation sur carte), des abonnements Stripe et un espace administration. C'est un monorepo npm workspaces composé de trois packages : `types` (types partagés), `backend` (API Express en architecture en couches) et `frontend` (SPA React).

## Structure du monorepo

```
packages/
├── types/      # @the-box/types — types TypeScript partagés (build avant les autres si modifiés)
├── backend/    # @the-box/backend — API Express, BullMQ, Socket.io, Better Auth
└── frontend/   # @the-box/frontend — React 19 + Vite + Tailwind 4 + Zustand
```

Dépendances :
- `frontend` → `types`
- `backend` → `types`

Toujours rebuilder `@the-box/types` (`npm run build:types`) après toute modification dans `packages/types/` afin que les autres packages voient les changements.

## Commandes essentielles

```bash
# Installation (depuis la racine)
npm install

# Démarrer Postgres + Redis pour le dev local
docker compose -f compose.local.yml up -d

# Dev (lance backend :3000 et frontend :5173)
npm run dev

# Build complet
npm run build

# Qualité
npm run lint
npm test

# Base de données
npm run db:migrate
npm run db:rollback
npm run db:seed
npm run db:seed:geo

# E2E (depuis packages/frontend)
npm run test:e2e

# Migration
npm run db:make-migration <nom>   # depuis packages/backend
```

## Conventions de code à respecter

- **TypeScript strict** partout. Pas de `any` implicite.
- **Architecture en couches du backend** : `presentation` → `domain` → `infrastructure`. La couche `domain/services/` ne doit jamais importer de Knex, HTTP ou code d'infrastructure.
- **Repositories** : tout accès base de données passe par `infrastructure/repositories/*`. Ne jamais utiliser Knex directement depuis un service ou une route.
- **Validation Zod** : entrées HTTP validées par middleware côté backend, formulaires validés par `@hookform/resolvers/zod` côté frontend.
- **Types partagés** : tout type utilisé des deux côtés vit dans `packages/types/src/index.ts`.
- **Alias de chemin** : `@/` pointe vers `src/` dans les deux packages.
- **Tailwind** : utilitaire `cn()` pour combiner les classes. Tokens de design centralisés dans `packages/frontend/src/index.css`. **Interdit** d'utiliser des classes brutes de la palette Tailwind (`text-emerald-*`, `bg-purple-*`, etc.) — utiliser les tokens sémantiques (`text-success`, `text-neon-*`). Une règle ESLint personnalisée bloque les violations.
- **i18n** : tout texte UI passe par `useTranslation()`. Les traductions vivent dans `packages/frontend/public/locales/{en,fr}/`.
- **Migrations** : fichiers TypeScript préfixés par la date (`YYYYMMDD_nom.ts`) sous `packages/backend/migrations/`. Jamais éditer une migration déjà jouée en production — créer une nouvelle migration.

## Workflow de développement

### Branches et commits

- Branche par défaut : `main`
- Format de commit imposé par commitlint (Conventional Commits) :
  ```
  <type>(<scope>): <subject>
  ```
- Types autorisés : `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `chore`
- Le hook husky `commit-msg` rejette tout commit non conforme. Ne jamais bypasser avec `--no-verify`.

### Pipeline CI/CD

- **CI (`.github/workflows/ci.yml`)** — déclenché à chaque push et PR : lint, build, tests
- **Release (`.github/workflows/release.yml`)** — déclenché manuellement : bump de version, changelog, build et push d'une image Docker multi-arch sur Docker Hub
- **Deploy (`.github/workflows/deploy.yml`)** — déclenché après une Release réussie : tire l'image et reconcilie la pile docker-compose sur le serveur

## Avant de commiter (checklist obligatoire)

1. `npm run build` — vérifie que tous les packages compilent
2. `npm run lint` — ESLint sur le frontend
3. `npm test` — tests unitaires
4. Pour les changements UI : `npm run test:e2e` (avec serveurs dev démarrés et `npm run e2e:seed`)
5. Commit au format Conventional Commits (validé par husky)

## À éviter absolument

- **Ne jamais** committer de fichier `.env` ou de secret. `.env.example` est la seule source autorisée.
- **Ne jamais** modifier une migration déjà mergée — créer une nouvelle migration à la place.
- **Ne jamais** importer du code d'infrastructure depuis `domain/services/` (cela casse l'architecture en couches).
- **Ne jamais** utiliser `git push --force` sur `main`. Si un rebase est nécessaire, ouvrir une PR.
- **Ne jamais** bypasser les hooks git (`--no-verify`, `--no-gpg-sign`).
- **Ne jamais** introduire de classes Tailwind brutes pour les couleurs — passer par les tokens sémantiques.
- **Ne jamais** rebuilder le projet sans avoir d'abord rebuilé `@the-box/types` si ce package a été modifié.

## Fichiers et dossiers critiques

| Chemin | Rôle |
|--------|------|
| `packages/types/src/index.ts` | Source unique des types partagés |
| `packages/backend/src/index.ts` | Point d'entrée HTTP + Socket.io + workers BullMQ |
| `packages/backend/src/domain/services/` | Logique métier pure (sans dépendances infra) |
| `packages/backend/src/infrastructure/auth/` | Configuration Better Auth |
| `packages/backend/src/infrastructure/queue/workers/` | Workers BullMQ (import, géo, défi quotidien, e-mails) |
| `packages/backend/migrations/` | Migrations Knex datées |
| `packages/frontend/src/index.css` | Tokens de design (couleurs, ombres, rayons) — source de vérité |
| `packages/frontend/public/locales/` | Traductions i18n (fr, en) |
| `compose.local.yml` | Postgres + Redis pour dev local |
| `compose.yml` | Pile complète de production avec Traefik |
| `Dockerfile` | Build multi-stage, port 80, lance migrations puis Node |
| `docker-entrypoint.sh` | Joue les migrations au démarrage du conteneur |
| `commitlint.config.js` | Règles Conventional Commits |
| `.husky/commit-msg` | Hook qui valide le message de commit |

## Variables d'environnement requises

Les variables minimales pour faire tourner l'application (voir `.env.example`) :
- `DATABASE_URL`, `REDIS_URL`
- `BETTER_AUTH_SECRET` (au moins 32 caractères)
- `API_URL`, `CORS_ORIGIN`, `PORT`
- `RESEND_API_KEY`, `EMAIL_FROM` (e-mails)
- `RAWG_API_KEY` (imports de jeux, optionnel)
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` (paiements)
- `VITE_API_URL`, `VITE_USE_MOCK_API` (frontend)

## Points d'attention spécifiques

- **Bootstrap admin** : le premier utilisateur enregistré devient automatiquement admin.
- **Géo et imports** : les workers `geo-*-import-logic.ts` parsent des sources externes (Wikidata, Fandom, Steam, RAWG, StrategyWiki, Wand, Fextralife). Toujours respecter les limites de taux et les conditions d'utilisation des sources.
- **Stripe** : les webhooks Stripe sont signés. Tester via `npm run stripe:check` (depuis `packages/backend`).
- **Architecture en couches stricte** : si une nouvelle dépendance externe est nécessaire, l'ajouter dans `infrastructure/`, jamais dans `domain/`.
- **Image Docker unique** : en production, Node sert le frontend buildé sur le port 80 et expose l'API sous `/api/`. Pas de serveur Vite en production.
