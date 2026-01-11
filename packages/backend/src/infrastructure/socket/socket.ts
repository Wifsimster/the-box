import { Server as HttpServer } from 'http'
import { Server, Socket } from 'socket.io'
import { env } from '../../config/env.js'
import type {
  LiveScore,
  JoinChallengeEvent,
  ScoreUpdateEvent,
  PlayerFinishedEvent,
  Party,
  PartyMember,
  CreatePartyEvent,
  JoinPartyEvent,
  LeavePartyEvent,
  StartPartyGameEvent,
  PartyResetGameEvent,
  PartyScoreUpdateEvent,
  PartyPlayerFinishedEvent,
} from '@the-box/types'
import { socketLogger } from '../logger/logger.js'

const log = socketLogger

// Store active rooms and their participants
const challengeRooms = new Map<string, Map<string, LiveScore>>()

// Store active parties
const parties = new Map<string, Party>()

// Map socket ID to party code for cleanup on disconnect
const socketToParty = new Map<string, string>()

// Generate unique party code (6 alphanumeric characters)
function generatePartyCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789' // Avoiding confusing chars like I, O, 0, 1
  let code = ''
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)]
  }
  // Ensure unique
  if (parties.has(code)) {
    return generatePartyCode()
  }
  return code
}

// Get party leaderboard
function getPartyLeaderboard(party: Party): LiveScore[] {
  return party.members
    .map(m => ({ username: m.username, score: m.score }))
    .sort((a, b) => b.score - a.score)
}

// Handle player leaving a party
function handleLeaveParty(socket: Socket, io: Server, partyCode: string) {
  const party = parties.get(partyCode)
  if (!party) return

  const roomId = `party_${partyCode}`
  const memberIndex = party.members.findIndex(m => m.socketId === socket.id)

  if (memberIndex === -1) return

  const leavingMember = party.members[memberIndex]
  if (!leavingMember) return

  const wasHost = leavingMember.isHost
  const leavingUsername = leavingMember.username

  // Remove member
  party.members.splice(memberIndex, 1)
  socketToParty.delete(socket.id)
  socket.leave(roomId)

  // If no members left, delete party
  if (party.members.length === 0) {
    parties.delete(partyCode)
    socketLogger.info({ partyCode }, 'party disbanded - no members')
    return
  }

  // If host left, transfer to next member
  if (wasHost && party.members.length > 0) {
    const newHost = party.members[0]
    if (newHost) {
      newHost.isHost = true
      party.hostSocketId = newHost.socketId
      io.to(roomId).emit('party_updated', { party })
      socketLogger.info({ partyCode, newHost: newHost.username }, 'host transferred')
    }
  } else {
    io.to(roomId).emit('party_updated', { party })
  }

  io.to(roomId).emit('player_left', {
    username: leavingUsername,
    totalPlayers: party.members.length,
  })

  socketLogger.info({ partyCode, username: leavingUsername }, 'player left party')
}

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

    // Admin room for job updates
    socket.on('join_admin', () => {
      socket.join('admin')
      log.debug({ socketId: socket.id }, 'joined admin room')
    })

    socket.on('leave_admin', () => {
      socket.leave('admin')
      log.debug({ socketId: socket.id }, 'left admin room')
    })

    // ============================================
    // Party Events
    // ============================================

    // Create a new party (creator becomes host)
    socket.on('create_party', (data: CreatePartyEvent) => {
      const partyCode = generatePartyCode()
      const roomId = `party_${partyCode}`

      const member: PartyMember = {
        socketId: socket.id,
        username: data.username,
        score: 0,
        isHost: true,
        isReady: false,
      }

      const party: Party = {
        code: partyCode,
        hostSocketId: socket.id,
        challengeId: null,
        members: [member],
        isGameStarted: false,
        createdAt: new Date().toISOString(),
      }

      parties.set(partyCode, party)
      socketToParty.set(socket.id, partyCode)
      socket.join(roomId)

      socket.emit('party_created', { partyCode, party })
      log.info({ partyCode, username: data.username }, 'party created')
    })

    // Join an existing party
    socket.on('join_party', (data: JoinPartyEvent) => {
      const party = parties.get(data.partyCode)
      if (!party) {
        socket.emit('party_error', { message: 'Party not found' })
        return
      }

      if (party.isGameStarted) {
        socket.emit('party_error', { message: 'Game already in progress' })
        return
      }

      const roomId = `party_${data.partyCode}`
      const member: PartyMember = {
        socketId: socket.id,
        username: data.username,
        score: 0,
        isHost: false,
        isReady: false,
      }

      party.members.push(member)
      socketToParty.set(socket.id, data.partyCode)
      socket.join(roomId)

      socket.emit('party_joined', { party })
      socket.to(roomId).emit('party_updated', { party })
      log.info({ partyCode: data.partyCode, username: data.username }, 'player joined party')
    })

    // Leave party
    socket.on('leave_party', (data: LeavePartyEvent) => {
      handleLeaveParty(socket, io, data.partyCode)
    })

    // Start game (host only)
    socket.on('start_party_game', (data: StartPartyGameEvent) => {
      const party = parties.get(data.partyCode)
      if (!party) {
        socket.emit('party_error', { message: 'Party not found' })
        return
      }

      if (party.hostSocketId !== socket.id) {
        socket.emit('party_error', { message: 'Only the host can start the game' })
        return
      }

      party.challengeId = data.challengeId
      party.isGameStarted = true
      // Reset all scores
      for (const member of party.members) {
        member.score = 0
      }

      const roomId = `party_${data.partyCode}`
      io.to(roomId).emit('party_game_started', { challengeId: data.challengeId })
      io.to(roomId).emit('party_updated', { party })
      io.to(roomId).emit('leaderboard_update', getPartyLeaderboard(party))
      log.info({ partyCode: data.partyCode, challengeId: data.challengeId }, 'party game started')
    })

    // Reset game (host only) - the main feature being added
    socket.on('party_reset_game', (data: PartyResetGameEvent) => {
      const party = parties.get(data.partyCode)
      if (!party) {
        socket.emit('party_error', { message: 'Party not found' })
        return
      }

      if (party.hostSocketId !== socket.id) {
        socket.emit('party_error', { message: 'Only the host can reset the game' })
        return
      }

      // Reset game state
      party.isGameStarted = false
      party.challengeId = null
      for (const member of party.members) {
        member.score = 0
        member.isReady = false
      }

      const roomId = `party_${data.partyCode}`
      io.to(roomId).emit('party_game_reset', { message: 'Game has been reset by the host' })
      io.to(roomId).emit('party_updated', { party })
      io.to(roomId).emit('leaderboard_update', getPartyLeaderboard(party))
      log.info({ partyCode: data.partyCode }, 'party game reset by host')
    })

    // Update score in party
    socket.on('party_score_update', (data: PartyScoreUpdateEvent) => {
      const party = parties.get(data.partyCode)
      if (!party) return

      const member = party.members.find(m => m.socketId === socket.id)
      if (member) {
        member.score = data.score
        const roomId = `party_${data.partyCode}`
        io.to(roomId).emit('leaderboard_update', getPartyLeaderboard(party))
      }
    })

    // Player finished in party
    socket.on('party_player_finished', (data: PartyPlayerFinishedEvent) => {
      const party = parties.get(data.partyCode)
      if (!party) return

      const member = party.members.find(m => m.socketId === socket.id)
      if (member) {
        member.score = data.score
        const roomId = `party_${data.partyCode}`
        io.to(roomId).emit('player_finished', {
          username: member.username,
          score: data.score,
        })
        io.to(roomId).emit('leaderboard_update', getPartyLeaderboard(party))
      }
    })

    // Handle disconnect
    socket.on('disconnect', () => {
      // Remove from challenge rooms
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

      // Handle party cleanup on disconnect
      const partyCode = socketToParty.get(socket.id)
      if (partyCode) {
        handleLeaveParty(socket, io, partyCode)
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
