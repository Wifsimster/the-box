import { Server as HTTPServer } from 'http'
import { Server as SocketIOServer } from 'socket.io'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'
import { importQueueEvents } from '../queue/queues.js'

let io: SocketIOServer | null = null

/**
 * Initialize Socket.IO server and set up event listeners
 */
export function initializeSocketIO(httpServer: HTTPServer): SocketIOServer {
    io = new SocketIOServer(httpServer, {
        cors: {
            origin: env.CORS_ORIGIN,
            credentials: true,
        },
        path: '/socket.io',
    })

    // Admin namespace for job updates
    const adminNamespace = io.of('/admin')

    adminNamespace.on('connection', (socket) => {
        logger.info({ socketId: socket.id }, 'admin client connected')

        // Join admin room for job updates
        socket.on('join_admin', () => {
            socket.join('admin-room')
            logger.info({ socketId: socket.id }, 'client joined admin room')
        })

        // Leave admin room
        socket.on('leave_admin', () => {
            socket.leave('admin-room')
            logger.info({ socketId: socket.id }, 'client left admin room')
        })

        socket.on('disconnect', () => {
            logger.info({ socketId: socket.id }, 'admin client disconnected')
        })
    })

    // Subscribe to BullMQ events and broadcast to admin clients
    setupQueueEventListeners(adminNamespace)

    logger.info('Socket.IO server initialized')
    return io
}

/**
 * Set up listeners for BullMQ queue events and broadcast to admin clients
 */
function setupQueueEventListeners(adminNamespace: any) {
    // Job progress updates
    importQueueEvents.on('progress', ({ jobId, data }: any) => {
        const progressData = typeof data === 'number' ? { progress: data } : data

        logger.debug({ jobId, progress: progressData }, 'job progress update')

        adminNamespace.to('admin-room').emit('job_progress', {
            jobId,
            ...progressData,
        })
    })

    // Job completed
    importQueueEvents.on('completed', ({ jobId, returnvalue }: { jobId: string; returnvalue: any }) => {
        logger.info({ jobId, result: returnvalue }, 'job completed')

        adminNamespace.to('admin-room').emit('job_completed', {
            jobId,
            result: returnvalue,
        })
    })

    // Job failed
    importQueueEvents.on('failed', ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
        logger.error({ jobId, error: failedReason }, 'job failed')

        adminNamespace.to('admin-room').emit('job_failed', {
            jobId,
            error: failedReason,
        })
    })

    // Job added (waiting)
    importQueueEvents.on('added', ({ jobId }: { jobId: string }) => {
        logger.debug({ jobId }, 'job added to queue')

        adminNamespace.to('admin-room').emit('job_added', {
            jobId,
        })
    })

    // Job active (started processing)
    importQueueEvents.on('active', ({ jobId }: { jobId: string }) => {
        logger.debug({ jobId }, 'job started processing')

        adminNamespace.to('admin-room').emit('job_active', {
            jobId,
        })
    })

    // Job delayed
    importQueueEvents.on('delayed', ({ jobId, delay }: { jobId: string; delay: number }) => {
        logger.debug({ jobId, delay }, 'job delayed')

        adminNamespace.to('admin-room').emit('job_delayed', {
            jobId,
            delay,
        })
    })

    // Job waiting (moved to waiting state)
    importQueueEvents.on('waiting', ({ jobId }: { jobId: string }) => {
        logger.debug({ jobId }, 'job moved to waiting')

        adminNamespace.to('admin-room').emit('job_waiting', {
            jobId,
        })
    })

    // Job removed
    importQueueEvents.on('removed', ({ jobId }: { jobId: string }) => {
        logger.debug({ jobId }, 'job removed from queue')

        adminNamespace.to('admin-room').emit('job_removed', {
            jobId,
        })
    })

    // Job stalled (potentially stuck)
    importQueueEvents.on('stalled', ({ jobId }: { jobId: string }) => {
        logger.warn({ jobId }, 'job stalled')

        adminNamespace.to('admin-room').emit('job_stalled', {
            jobId,
        })
    })

    logger.info('BullMQ event listeners configured')
}

/**
 * Broadcast batch import progress to admin clients
 */
export function broadcastBatchImportProgress(data: {
    importStateId: number
    progress: number
    status: string
    message?: string
    current: number
    gamesImported: number
    gamesSkipped: number
    screenshotsDownloaded: number
    currentBatch: number
    totalGamesAvailable: number
    totalBatches: number
}) {
    if (!io) {
        logger.warn('Socket.IO not initialized, cannot broadcast batch import progress')
        return
    }

    io.of('/admin').to('admin-room').emit('batch_import_progress', data)
    logger.debug({ importStateId: data.importStateId, progress: data.progress }, 'batch import progress broadcast')
}

/**
 * Get Socket.IO instance
 */
export function getSocketIO(): SocketIOServer | null {
    return io
}
