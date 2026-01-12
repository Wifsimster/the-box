import { io, Socket } from 'socket.io-client'
import type {
  JobProgressEvent,
  JobCompletedEvent,
  JobFailedEvent,
  BatchImportProgressEvent,
  PartyCreatedEvent,
  PartyJoinedEvent,
  PartyUpdatedEvent,
  PartyGameStartedEvent,
  PartyGameResetEvent,
  PartyErrorEvent,
  PartyDisbandedEvent,
  LiveScore,
  PlayerJoinedEvent,
  PlayerLeftEvent,
} from '@/types'

// In development, use relative path (empty string) to leverage Vite proxy
// In production, use VITE_API_URL if set, otherwise relative path
// When empty, Socket.io connects to the same origin, which the Vite proxy will forward
const API_URL = import.meta.env.VITE_API_URL || ''

// Socket instance
export const socket: Socket = io(API_URL, {
  autoConnect: false,
  withCredentials: true,
})

// Connect when needed
export function connectSocket(): void {
  if (!socket.connected) {
    socket.connect()
  }
}

export function disconnectSocket(): void {
  if (socket.connected) {
    socket.disconnect()
  }
}

// Admin room helpers
export function joinAdminRoom(): void {
  connectSocket()
  socket.emit('join_admin')
}

export function leaveAdminRoom(): void {
  socket.emit('leave_admin')
}

// Type-safe event listeners for job events
export function onJobProgress(callback: (event: JobProgressEvent) => void): () => void {
  socket.on('job_progress', callback)
  return () => socket.off('job_progress', callback)
}

export function onJobCompleted(callback: (event: JobCompletedEvent) => void): () => void {
  socket.on('job_completed', callback)
  return () => socket.off('job_completed', callback)
}

export function onJobFailed(callback: (event: JobFailedEvent) => void): () => void {
  socket.on('job_failed', callback)
  return () => socket.off('job_failed', callback)
}

export function onBatchImportProgress(callback: (event: BatchImportProgressEvent) => void): () => void {
  socket.on('batch_import_progress', callback)
  return () => socket.off('batch_import_progress', callback)
}

// Remove all job event listeners
export function removeJobListeners(): void {
  socket.off('job_progress')
  socket.off('job_completed')
  socket.off('job_failed')
  socket.off('batch_import_progress')
}

// ============================================
// Party Socket Helpers
// ============================================

// Party actions (Client -> Server)
export function createParty(username: string): void {
  connectSocket()
  socket.emit('create_party', { username })
}

export function joinParty(partyCode: string, username: string): void {
  connectSocket()
  socket.emit('join_party', { partyCode, username })
}

export function leaveParty(partyCode: string): void {
  socket.emit('leave_party', { partyCode })
}

export function startPartyGame(partyCode: string, challengeId: number): void {
  socket.emit('start_party_game', { partyCode, challengeId })
}

export function resetPartyGame(partyCode: string): void {
  socket.emit('party_reset_game', { partyCode })
}

export function updatePartyScore(partyCode: string, score: number): void {
  socket.emit('party_score_update', { partyCode, score })
}

export function partyPlayerFinished(partyCode: string, score: number): void {
  socket.emit('party_player_finished', { partyCode, score })
}

// Party event listeners (Server -> Client)
export function onPartyCreated(callback: (event: PartyCreatedEvent) => void): () => void {
  socket.on('party_created', callback)
  return () => socket.off('party_created', callback)
}

export function onPartyJoined(callback: (event: PartyJoinedEvent) => void): () => void {
  socket.on('party_joined', callback)
  return () => socket.off('party_joined', callback)
}

export function onPartyUpdated(callback: (event: PartyUpdatedEvent) => void): () => void {
  socket.on('party_updated', callback)
  return () => socket.off('party_updated', callback)
}

export function onPartyGameStarted(callback: (event: PartyGameStartedEvent) => void): () => void {
  socket.on('party_game_started', callback)
  return () => socket.off('party_game_started', callback)
}

export function onPartyGameReset(callback: (event: PartyGameResetEvent) => void): () => void {
  socket.on('party_game_reset', callback)
  return () => socket.off('party_game_reset', callback)
}

export function onPartyError(callback: (event: PartyErrorEvent) => void): () => void {
  socket.on('party_error', callback)
  return () => socket.off('party_error', callback)
}

export function onPartyDisbanded(callback: (event: PartyDisbandedEvent) => void): () => void {
  socket.on('party_disbanded', callback)
  return () => socket.off('party_disbanded', callback)
}

export function onLeaderboardUpdate(callback: (entries: LiveScore[]) => void): () => void {
  socket.on('leaderboard_update', callback)
  return () => socket.off('leaderboard_update', callback)
}

export function onPlayerJoined(callback: (event: PlayerJoinedEvent) => void): () => void {
  socket.on('player_joined', callback)
  return () => socket.off('player_joined', callback)
}

export function onPlayerLeft(callback: (event: PlayerLeftEvent) => void): () => void {
  socket.on('player_left', callback)
  return () => socket.off('player_left', callback)
}

// Remove all party event listeners
export function removePartyListeners(): void {
  socket.off('party_created')
  socket.off('party_joined')
  socket.off('party_updated')
  socket.off('party_game_started')
  socket.off('party_game_reset')
  socket.off('party_error')
  socket.off('party_disbanded')
  socket.off('leaderboard_update')
  socket.off('player_joined')
  socket.off('player_left')
}
