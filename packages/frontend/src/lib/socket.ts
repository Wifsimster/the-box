import { io, Socket } from 'socket.io-client'
import type { JobProgressEvent, JobCompletedEvent, JobFailedEvent, BatchImportProgressEvent } from '@/types'

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
