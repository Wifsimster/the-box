import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import { env } from '../../config/env.js'
import type { LiveScore, JoinChallengeEvent, ScoreUpdateEvent, PlayerFinishedEvent } from '@the-box/types'
import { socketLogger } from '../logger/logger.js'

const log = socketLogger

// Store active rooms and their participants
const challengeRooms = new Map<string, Map<string, LiveScore>>()

export function initializeSocket(httpServer: HttpServer): Server {
  const io = new Server(httpServer, {
    cors: {
      origin: env.CORS_ORIGIN,
      methods: ['GET', 'POST'],
    },
  })

  io.on('connection', (socket: Socket) => {
    log.debug({ socketId: socket.id }, 'client connected')

    // Join a challenge room
    socket.on('join_challenge', (data: JoinChallengeEvent) => {
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

      log.info({ username: data.username, challengeId: data.challengeId, roomSize: room.size }, 'player joined challenge')
    })

    // Update score
    socket.on('score_update', (data: ScoreUpdateEvent) => {
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

    // Player finished challenge
    socket.on('player_finished', (data: PlayerFinishedEvent) => {
      const roomId = `challenge_${data.challengeId}`

      io.to(roomId).emit('player_finished', {
        username: challengeRooms.get(roomId)?.get(socket.id)?.username,
        score: data.score,
      })
    })

    // Handle disconnect
    socket.on('disconnect', () => {
      // Remove from all rooms
      for (const [roomId, room] of challengeRooms.entries()) {
        if (room.has(socket.id)) {
          const player = room.get(socket.id)
          room.delete(socket.id)

          log.info({ socketId: socket.id, username: player?.username, roomId }, 'player left')

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
            log.debug({ roomId }, 'room cleaned up')
          }
        }
      }

      log.debug({ socketId: socket.id }, 'client disconnected')
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
