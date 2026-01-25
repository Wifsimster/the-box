# The Box

A gaming screenshot guessing game where players identify video games from 360° panoramic screenshots. Features daily challenges, power-ups, and live leaderboards.

## Features

- **360° Panoramic Screenshots** - Immersive game identification using Pannellum viewer
- **Tiered Difficulty** - 3 tiers with increasing challenge levels
- **Daily Challenges** - New challenges every day
- **Power-ups & Hints** - Timer extension (x2) and reveal hints (year, publisher, developer)
- **Live Leaderboard** - Real-time daily and monthly rankings via Socket.io
- **Achievements** - Unlockable achievements for various accomplishments
- **Daily Login Rewards** - Streak-based rewards with calendar display
- **User Profiles** - Stats, game history, and achievements display
- **Admin Panel** - Game management, user management, job queue monitoring
- **Authentication** - Email/password auth with Better Auth
- **Internationalization** - French (default) and English support

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | React 19, Vite, TypeScript, TailwindCSS, Zustand |
| Backend | Node.js, Express, Better Auth, Socket.io, BullMQ |
| Database | PostgreSQL, Knex.js |
| Cache/Queue | Redis |
| Monorepo | npm workspaces |

## Project Structure

```
the-box/
├── packages/
│   ├── types/          # @the-box/types - Shared TypeScript types
│   ├── backend/        # @the-box/backend - Express API (Clean Architecture)
│   │   ├── src/
│   │   │   ├── config/
│   │   │   ├── domain/services/
│   │   │   ├── infrastructure/
│   │   │   │   ├── auth/
│   │   │   │   ├── database/
│   │   │   │   ├── repositories/
│   │   │   │   └── socket/
│   │   │   └── presentation/
│   │   │       ├── routes/
│   │   │       └── middleware/
│   │   └── migrations/
│   └── frontend/       # @the-box/frontend - React SPA
│       └── src/
│           ├── components/
│           ├── pages/
│           ├── stores/
│           └── lib/
├── docs/               # Feature documentation
├── uploads/            # Screenshot storage
├── docker-compose.yml            # Dev: PostgreSQL + Redis
└── docker-compose.production.yml # Full stack example
```

## Quick Start

### Option 1: Docker (Recommended)

Pull and run the pre-built image from Docker Hub:

```bash
# Pull specific version (recommended for production)
docker pull wifsimster/the-box:1.1

# Or pull latest
docker pull wifsimster/the-box:latest

docker run -d \
  --name the-box \
  -p 80:80 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/thebox \
  -e REDIS_URL=redis://host:6379 \
  -e BETTER_AUTH_SECRET=your-secret-min-32-chars \
  -e RESEND_API_KEY=your-resend-key \
  -e EMAIL_FROM=noreply@yourdomain.com \
  -v thebox-uploads:/app/uploads \
  wifsimster/the-box:1.1

# Run database migrations and seed admin user
docker exec the-box npm run --workspace=@the-box/backend db:migrate
docker exec the-box npm run --workspace=@the-box/backend db:seed
```

Or use Docker Compose for a complete stack (see `docker compose.production.yml` for a ready-to-use example):

```yaml
services:
  app:
    image: wifsimster/the-box:latest
    ports:
      - "80:80"
    environment:
      DATABASE_URL: postgresql://thebox:thebox_secret@postgres:5432/thebox
      REDIS_URL: redis://redis:6379
      BETTER_AUTH_SECRET: your-secret-min-32-chars-here
      RESEND_API_KEY: your-resend-api-key
      EMAIL_FROM: noreply@yourdomain.com
    volumes:
      - uploads:/app/uploads
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped

  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_USER: thebox
      POSTGRES_PASSWORD: thebox_secret
      POSTGRES_DB: thebox
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U thebox -d thebox"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

  redis:
    image: redis:7-alpine
    volumes:
      - redis-data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5
    restart: unless-stopped

volumes:
  uploads:
  postgres-data:
  redis-data:
```

### Option 2: Local Development

#### Prerequisites

- Node.js >= 24
- Docker (for PostgreSQL and Redis)

#### Installation

```bash
# Clone the repository
git clone <repository-url>
cd the-box

# Install dependencies
npm install

# Copy environment variables
cp .env.example .env

# Start PostgreSQL and Redis (uses docker compose.yml)
docker compose up -d

# Run database migrations
npm run db:migrate

# Seed database with admin user
npm run db:seed

# Start development servers
npm run dev
```

### Development Commands

```bash
# Start all services
npm run dev

# Start individual services
npm run dev:backend     # Backend on port 3000
npm run dev:frontend    # Frontend on port 5173

# Build
npm run build           # Build all packages
npm run build:types     # Build types package
npm run build:backend   # Build backend
npm run build:frontend  # Build frontend

# Database
npm run db:migrate      # Run migrations
npm run db:rollback     # Rollback last migration
npm run db:seed         # Seed database

# Version management
npm run version:patch   # Bump patch version (1.1.0 -> 1.1.1)
npm run version:minor   # Bump minor version (1.1.0 -> 1.2.0)
npm run version:major   # Bump major version (1.1.0 -> 2.0.0)

# Docker
npm run docker:build    # Build Docker image with version
npm run docker:tag      # Tag image with semantic versions
npm run docker:push     # Push all tags to Docker Hub
npm run release         # Complete release (build + docker + push)
```

## Contributing

### Commit Message Convention

This project uses [Conventional Commits](https://www.conventionalcommits.org/) for automated changelog generation. All commits must follow this format:

```text
<type>(<scope>): <subject>

<body>
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, semicolons, etc.)
- `refactor`: Code refactoring
- `perf`: Performance improvements
- `test`: Adding or updating tests
- `build`: Build system or dependencies
- `ci`: CI/CD changes
- `chore`: Other changes (maintenance, etc.)

**Examples:**

```bash
feat(game): add power-up system for hints
fix(auth): resolve session expiration issue
docs(readme): update installation instructions
```

Commits are validated automatically via husky git hooks. Non-compliant commits will be rejected.

## CI/CD Pipeline

### GitHub Actions Workflows

**Continuous Integration (`.github/workflows/ci.yml`)**

- Runs on all pushes and pull requests
- Linting, type checking, and building all packages
- E2E tests with Playwright (optional, non-blocking)
- Docker build validation

**Release (`.github/workflows/release.yml`)**

- Manual trigger via GitHub Actions UI
- Select version bump: patch, minor, or major
- Generates changelog from conventional commits
- Builds and publishes multi-arch Docker images (amd64, arm64)
- Creates GitHub release with notes
- Tags: `latest`, `v1.1.0`, `1.1`, `1`

### Docker Hub Setup

To enable automated Docker publishing, add these secrets to your GitHub repository:

1. Go to **Settings → Secrets and variables → Actions**
2. Add the following repository secrets:
   - `DOCKERHUB_USERNAME` - Your Docker Hub username
   - `DOCKERHUB_TOKEN` - Docker Hub access token ([create one here](https://hub.docker.com/settings/security))

### Creating a Release

1. Ensure all changes are committed and pushed to `main`
2. Go to **Actions** tab in GitHub
3. Select **Release** workflow
4. Click **Run workflow**
5. Choose version bump type (patch/minor/major)
6. The workflow will:
   - Bump versions in all `package.json` files
   - Generate changelog from commits
   - Build and push Docker images with all tags
   - Create GitHub release

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://thebox:thebox_secret@localhost:5432/thebox` |
| `REDIS_URL` | Redis connection string | `redis://localhost:6379` |
| `BETTER_AUTH_SECRET` | Auth secret (min 32 chars) | - |
| `API_URL` | Backend API URL | `http://localhost:3000` |
| `RESEND_API_KEY` | Resend API key for emails | - |
| `EMAIL_FROM` | Email sender address | - |
| `RAWG_API_KEY` | RAWG API key for game imports | - |
| `PORT` | Backend port | `3000` |
| `CORS_ORIGIN` | Frontend URL | `http://localhost:5173` |

## Docker

### Pre-built Image

The application is available as a single Docker image on Docker Hub:

```bash
docker pull wifsimster/the-box:latest
```

### Build Locally

```bash
# Build the image
docker build -t the-box:latest .

# Run the container
docker run -p 80:80 -e DATABASE_URL=... the-box:latest
```

### Architecture

The Docker image uses a multi-stage build and includes:

- **Node.js 24 Alpine** - Runs the full-stack application (frontend + backend)
- **Single port 80** - Node.js serves both static frontend and API routes
- **Automated migrations** - Database setup via docker-entrypoint.sh

**Docker Image Tags:**

- `latest` - Most recent stable release
- `v1.1.0` - Specific version (immutable)
- `1.1` - Minor version (receives patches)
- `1` - Major version (receives minors and patches)

Exposed port: **80**

## Documentation

See the [docs/](./docs/) folder for detailed documentation:

- [Architecture](./docs/architecture.md) - Clean architecture overview
- [Authentication](./docs/authentication.md) - Better Auth setup
- [Game Flow](./docs/game-flow.md) - Game mechanics and scoring
- [API Reference](./docs/api.md) - REST API endpoints
- [Database Schema](./docs/database.md) - Database structure
- [Real-time Events](./docs/realtime.md) - Socket.io events

## License

MIT
