# Authentication

The Box uses [Better Auth](https://better-auth.com) for authentication, providing email/password login with session management.

## Setup

### Backend Configuration

Authentication is configured in `packages/backend/src/infrastructure/auth/auth.ts`:

```typescript
import { betterAuth } from 'better-auth'
import { Pool } from 'pg'

export const auth = betterAuth({
  database: new Pool({ connectionString: env.DATABASE_URL }),
  emailAndPassword: {
    enabled: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24,     // 1 day
  },
})
```

### Frontend Configuration

Client setup in `packages/frontend/src/lib/auth-client.ts`:

```typescript
import { createAuthClient } from 'better-auth/react'

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL,
})

export const { signIn, signUp, signOut, useSession } = authClient
```

## Environment Variables

```bash
# Required for Better Auth
BETTER_AUTH_SECRET=your-secret-key-min-32-chars
API_URL=http://localhost:3000

# Optional: Email verification with Resend
RESEND_API_KEY=re_xxxxxxxxxxxx
EMAIL_FROM=noreply@yourdomain.com
```

## API Endpoints

Better Auth automatically handles these endpoints at `/api/auth/*`:

| Endpoint | Method | Description |
| -------- | ------ | ----------- |
| `/api/auth/sign-up/email` | POST | Register with email/password |
| `/api/auth/sign-in/email` | POST | Login with email/password |
| `/api/auth/sign-out` | POST | Logout current session |
| `/api/auth/session` | GET | Get current session |
| `/api/auth/user` | GET | Get current user |

## Usage in Frontend

### Sign Up

```typescript
import { signUp } from '@/lib/auth-client'

const handleSignUp = async (email: string, password: string, name: string) => {
  const { data, error } = await signUp.email({
    email,
    password,
    name,
  })

  if (error) {
    console.error(error.message)
    return
  }

  // User is now signed in
  console.log('Welcome', data.user.name)
}
```

### Sign In

```typescript
import { signIn } from '@/lib/auth-client'

const handleSignIn = async (email: string, password: string) => {
  const { data, error } = await signIn.email({
    email,
    password,
  })

  if (error) {
    console.error(error.message)
    return
  }

  // Redirect to game
  navigate('/play')
}
```

### Session Hook

```typescript
import { useSession } from '@/lib/auth-client'

function Header() {
  const { data: session, isPending } = useSession()

  if (isPending) return <Spinner />

  if (!session) {
    return <LoginButton />
  }

  return <UserMenu user={session.user} />
}
```

### Sign Out

```typescript
import { signOut } from '@/lib/auth-client'

const handleSignOut = async () => {
  await signOut()
  navigate('/')
}
```

## Protected Routes

### Backend Middleware

```typescript
import { auth } from '../infrastructure/auth/auth.js'

export async function authMiddleware(req, res, next) {
  const session = await auth.api.getSession({ headers: req.headers })

  if (!session) {
    return res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Authentication required' }
    })
  }

  req.userId = session.user.id
  next()
}
```

### Frontend Route Protection

```typescript
import { useSession } from '@/lib/auth-client'
import { Navigate } from 'react-router-dom'

function ProtectedRoute({ children }) {
  const { data: session, isPending } = useSession()

  if (isPending) return <LoadingScreen />
  if (!session) return <Navigate to="/login" />

  return children
}
```

## Guest Mode

For users who want to play without creating an account:

```typescript
// Generate a temporary guest session
const playAsGuest = async () => {
  const guestId = `guest_${Date.now()}`
  // Store in localStorage, create temporary user
}
```

## Database Tables

Better Auth creates these tables automatically:

- `user` - User accounts
- `session` - Active sessions
- `account` - OAuth accounts (if enabled)
- `verification` - Email verification tokens
