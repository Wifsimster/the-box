# Real-time Events

The Box uses Socket.io for real-time features like live leaderboards during gameplay.

## Setup

### Backend

Socket.io is initialized in `packages/backend/src/infrastructure/socket/socket.ts`:

```typescript
import { Server } from 'socket.io'

export function initializeSocket(httpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket) => {
    // Handle events
  })

  return io
}
```

### Frontend

```typescript
import { io } from 'socket.io-client'

const socket = io(import.meta.env.VITE_API_URL, {
  autoConnect: false,
})

// Connect when starting a challenge
socket.connect()

// Disconnect when leaving
socket.disconnect()
```

## Events

### Client to Server

#### `join_challenge`

Join a challenge room to receive live updates.

```typescript
socket.emit('join_challenge', {
  challengeId: 1,
  username: 'Player1'
})
```

#### `score_update`

Broadcast score update to other players.

```typescript
socket.emit('score_update', {
  challengeId: 1,
  score: 500
})
```

#### `player_finished`

Notify when completing a tier or challenge.

```typescript
socket.emit('player_finished', {
  challengeId: 1,
  score: 3600,
  tier: 1
})
```

### Server to Client

#### `player_joined`

Received when another player joins the challenge.

```typescript
socket.on('player_joined', (data) => {
  console.log(`${data.username} joined! ${data.totalPlayers} players`)
})
```

**Payload:**
```typescript
{
  username: string
  totalPlayers: number
}
```

#### `player_left`

Received when a player disconnects.

```typescript
socket.on('player_left', (data) => {
  console.log(`${data.username} left. ${data.totalPlayers} remaining`)
})
```

#### `leaderboard_update`

Received when the live leaderboard changes.

```typescript
socket.on('leaderboard_update', (entries) => {
  setLiveLeaderboard(entries)
})
```

**Payload:**
```typescript
Array<{
  username: string
  score: number
}>
```

#### `player_finished`

Received when another player finishes a tier.

```typescript
socket.on('player_finished', (data) => {
  showNotification(`${data.username} finished tier ${data.tier} with ${data.score} points!`)
})
```

**Payload:**
```typescript
{
  username: string
  score: number
  tier: number
}
```

## Admin Events

Admin users can subscribe to job progress updates in real-time.

### Client to Server

#### `join_admin`

Join the admin room to receive job updates.

```typescript
socket.emit('join_admin')
```

#### `leave_admin`

Leave the admin room.

```typescript
socket.emit('leave_admin')
```

### Server to Client (Admin)

#### `job_progress`

Received when a background job makes progress.

```typescript
socket.on('job_progress', (data) => {
  console.log(`Job ${data.jobId}: ${data.progress}% - ${data.message}`)
})
```

**Payload:**
```typescript
{
  jobId: string
  progress: number  // 0-100
  message: string
}
```

#### `job_completed`

Received when a job finishes successfully.

```typescript
socket.on('job_completed', (data) => {
  console.log(`Job ${data.jobId} completed!`, data.result)
})
```

**Payload:**
```typescript
{
  jobId: string
  result: any
}
```

#### `job_failed`

Received when a job fails.

```typescript
socket.on('job_failed', (data) => {
  console.error(`Job ${data.jobId} failed:`, data.error)
})
```

**Payload:**
```typescript
{
  jobId: string
  error: string
}
```

## Room Management

Players are automatically placed in rooms based on challenge ID:

```text
Room: challenge_1          # Game challenge rooms
├── Player A (socket.id: abc123)
├── Player B (socket.id: def456)
└── Player C (socket.id: ghi789)

Room: admin                # Admin room for job updates
└── Admin User (socket.id: xyz789)
```

### Server-side Room Logic

```typescript
// Join room
socket.join(`challenge_${challengeId}`)

// Broadcast to room
io.to(`challenge_${challengeId}`).emit('leaderboard_update', entries)

// Broadcast to others in room (not sender)
socket.to(`challenge_${challengeId}`).emit('player_joined', data)
```

## Live Leaderboard Component

```typescript
import { useEffect, useState } from 'react'
import { socket } from '@/lib/socket'

function LiveLeaderboard({ challengeId }) {
  const [entries, setEntries] = useState([])

  useEffect(() => {
    socket.emit('join_challenge', {
      challengeId,
      username: currentUser.displayName
    })

    socket.on('leaderboard_update', setEntries)

    return () => {
      socket.off('leaderboard_update')
    }
  }, [challengeId])

  return (
    <ul>
      {entries.map((entry, index) => (
        <li key={index}>
          #{index + 1} {entry.username}: {entry.score}
        </li>
      ))}
    </ul>
  )
}
```

## Score Broadcasting

The game store automatically broadcasts score updates:

```typescript
// In gameStore.ts
submitGuess: async (guess) => {
  const result = await api.submitGuess(guess)

  if (result.isCorrect) {
    // Update local state
    set({ totalScore: result.totalScore })

    // Broadcast to other players
    socket.emit('score_update', {
      challengeId: get().challengeId,
      score: result.totalScore
    })
  }
}
```

## Connection States

```typescript
socket.on('connect', () => {
  console.log('Connected to game server')
})

socket.on('disconnect', () => {
  console.log('Disconnected from game server')
})

socket.on('connect_error', (error) => {
  console.error('Connection error:', error)
})
```

## Reconnection

Socket.io handles reconnection automatically. On reconnect, rejoin the challenge room:

```typescript
socket.on('connect', () => {
  if (currentChallengeId) {
    socket.emit('join_challenge', {
      challengeId: currentChallengeId,
      username: currentUser.displayName
    })
  }
})
```
