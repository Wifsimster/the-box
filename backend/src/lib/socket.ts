import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import { env } from '../config/env.js'

interface LiveScore {
  username: string
  score: number
}

// Store active rooms and their participants
const challengeRooms = new Map<string, Map<string, LiveScore>>()

export function initializeSocket(httpServer: HttpServer) {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket: Socket) => {
    console.log(`Client connected: ${socket.id}`)

    // Join a challenge room
    socket.on('join_challenge', (data: { challengeId: number; username: string }) => {
      const roomId = `challenge_${data.challengeId}`
      socket.join(roomId)

      // Initialize room if not exists
      if (!challengeRooms.has(roomId)) {
        challengeRooms.set(roomId, new Map())
      }

      // Add player to room
      const room = challengeRooms.get(roomId)!
      room.set(socket.id, { username: data.username, score: 0 })

      // Notify others
      socket.to(roomId).emit('player_joined', {
        username: data.username,
        totalPlayers: room.size,
      })

      // Send current leaderboard
      socket.emit('leaderboard_update', getLeaderboard(roomId))

      console.log(`${data.username} joined challenge ${data.challengeId}`)
    })

    // Update score
    socket.on('score_update', (data: { challengeId: number; score: number }) => {
      const roomId = `challenge_${data.challengeId}`
      const room = challengeRooms.get(roomId)

      if (room && room.has(socket.id)) {
        const player = room.get(socket.id)!
        player.score = data.score
        room.set(socket.id, player)

        // Broadcast updated leaderboard to all in room
        io.to(roomId).emit('leaderboard_update', getLeaderboard(roomId))
      }
    })

    // Player finished tier/challenge
    socket.on('player_finished', (data: { challengeId: number; score: number; tier: number }) => {
      const roomId = `challenge_${data.challengeId}`

      io.to(roomId).emit('player_finished', {
        username: challengeRooms.get(roomId)?.get(socket.id)?.username,
        score: data.score,
        tier: data.tier,
      })
    })

    // Handle disconnect
    socket.on('disconnect', () => {
      // Remove from all rooms
      for (const [roomId, room] of challengeRooms.entries()) {
        if (room.has(socket.id)) {
          const player = room.get(socket.id)
          room.delete(socket.id)

          // Notify room
          io.to(roomId).emit('player_left', {
            username: player?.username,
            totalPlayers: room.size,
          })

          // Update leaderboard
          io.to(roomId).emit('leaderboard_update', getLeaderboard(roomId))

          // Clean up empty rooms
          if (room.size === 0) {
            challengeRooms.delete(roomId)
          }
        }
      }

      console.log(`Client disconnected: ${socket.id}`)
    })
  })

  return io
}

function getLeaderboard(roomId: string): LiveScore[] {
  const room = challengeRooms.get(roomId)
  if (!room) return []

  return Array.from(room.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 10)
}
