# Better Auth Setup Guide

This guide covers the remaining steps to complete the better-auth migration.

## Prerequisites

- PostgreSQL running (via Docker: `docker-compose up -d`)
- Node.js 18+
- npm workspaces installed (`npm install` from root)

## Step 1: Generate Database Schema

Better-auth requires specific database tables. Run the CLI to generate and apply migrations:

```bash
cd packages/backend

# Generate the migration file
npx @better-auth/cli generate

# Apply migrations to the database
npx @better-auth/cli migrate
```

This creates the following tables:
- `user` - User accounts
- `session` - Active sessions
- `account` - OAuth/credential accounts
- `verification` - Email verification tokens

## Step 2: Configure Environment Variables

Copy the example environment file and configure your values:

```bash
cp .env.example .env
```

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://thebox:thebox_secret@localhost:5432/thebox` |
| `BETTER_AUTH_SECRET` | Secret key for signing (min 32 chars) | Generate with `openssl rand -base64 32` |
| `API_URL` | Backend URL | `http://localhost:3000` |
| `CORS_ORIGIN` | Frontend URL | `http://localhost:5173` |

### Email Configuration (Optional for Development)

For password reset and email verification to work in production:

| Variable | Description | Example |
|----------|-------------|---------|
| `RESEND_API_KEY` | Resend API key | `re_xxxxxxxxxxxx` |
| `EMAIL_FROM` | Sender email address | `noreply@yourdomain.com` |

> **Note**: In development mode without `RESEND_API_KEY`, password reset links are logged to the console.

## Step 3: Get Resend API Key (Production)

1. Create an account at [resend.com](https://resend.com)
2. Verify your domain or use the sandbox domain for testing
3. Generate an API key from the dashboard
4. Add it to your `.env` file

## Step 4: Start the Application

```bash
# From the root directory
npm run dev
```

Or start backend and frontend separately:

```bash
# Terminal 1 - Backend
cd packages/backend
npm run dev

# Terminal 2 - Frontend
cd packages/frontend
npm run dev
```

## Step 5: Test Authentication Flows

### Registration
1. Navigate to `http://localhost:5173/register`
2. Fill in username, email, and password
3. Submit the form
4. You should be redirected to the home page

### Login
1. Navigate to `http://localhost:5173/login`
2. Enter email or username and password
3. Submit the form
4. You should see your username in the header

### Guest Login
1. On the login page, click "Continue as Guest"
2. You should be logged in with an anonymous account

### Password Reset
1. Navigate to `http://localhost:5173/forgot-password`
2. Enter your email
3. Check your email (or console in development) for the reset link
4. Click the link and set a new password

### Logout
1. Click on your username in the header
2. Click "Logout"
3. You should be redirected to the home page

## API Endpoints

Better-auth handles these endpoints automatically:

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/sign-up/email` | Register with email/password |
| POST | `/api/auth/sign-in/email` | Login with email |
| POST | `/api/auth/sign-in/username` | Login with username |
| POST | `/api/auth/sign-in/anonymous` | Guest login |
| POST | `/api/auth/sign-out` | Logout |
| GET | `/api/auth/session` | Get current session |
| POST | `/api/auth/forget-password` | Request password reset |
| POST | `/api/auth/reset-password` | Complete password reset |

## Troubleshooting

### "Browser is not installed" error
If using Playwright for testing:
```bash
npx playwright install chromium
```

### Session not persisting
- Check that `CORS_ORIGIN` matches your frontend URL exactly
- Ensure cookies are being sent with `credentials: 'include'`

### Password reset email not sending
- Verify `RESEND_API_KEY` is set correctly
- Check the console for logged reset links in development mode
- Ensure your domain is verified in Resend dashboard

### Database connection errors
- Ensure PostgreSQL is running: `docker-compose up -d`
- Check `DATABASE_URL` matches your Docker configuration

## Migration from Existing Users

If you have existing users in the old `users` table, you'll need to migrate them:

1. Export existing user data
2. Create users via better-auth API or direct database insertion
3. Link game-specific data via `auth_user_id` foreign key

A migration script can be created based on your specific requirements.
