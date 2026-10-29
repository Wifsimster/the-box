import { Server as HTTPServer } from 'http'
import type { Socket } from 'socket.io'
import { Server as SocketIOServer } from 'socket.io'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'
import { auth } from '../auth/auth.js'
import { importQueueEvents } from '../queue/queues.js'
import { ensureGeoGamersPartyNamespace } from './geogamers-party.socket.js'
import type {
    AchievementUnlockedEvent,
    GeoRewardedEvent,
    GeoGamersSeasonUpdatedEvent,
    GeoTierUpEvent,
    NewlyEarnedAchievement,
    RewardGrantedEvent,
    UserPremiumGrantedEvent,
} from '@the-box/types'

let io: SocketIOServer | null = null

export async function getSocketSession(socket: Socket) {
    try {
        return await auth.api.getSession({
            headers: socket.handshake.headers as Record<string, string>,
        })
    } catch (err) {
        logger.warn({ err: String(err), socketId: socket.id }, 'socket session lookup failed')
        return null
    }
}

declare module 'socket.io' {
    interface Socket {
        userId?: string
        userRole?: string
    }
}

export function initializeSocketIO(httpServer: HTTPServer): SocketIOServer {
    io = new SocketIOServer(httpServer, {
        cors: {
            origin: env.CORS_ORIGIN,
            credentials: true,
        },
        path: '/socket.io',
    })

    const adminNamespace = io.of('/admin')
    adminNamespace.use(async (socket, next) => {
        const session = await getSocketSession(socket)
        if (!session?.user) {
            return next(new Error('unauthorized'))
        }
        if (session.user.role !== 'admin') {
            logger.warn({ socketId: socket.id, userId: session.user.id }, 'admin socket access denied')
            return next(new Error('forbidden'))
        }
        socket.userId = session.user.id
        socket.userRole = session.user.role
        next()
    })

    adminNamespace.on('connection', (socket) => {
        logger.info({ socketId: socket.id, userId: socket.userId }, 'admin client connected')

        socket.on('join_admin', () => {
            socket.join('admin-room')
            logger.info({ socketId: socket.id }, 'client joined admin room')
        })

        socket.on('leave_admin', () => {
            socket.leave('admin-room')
            logger.info({ socketId: socket.id }, 'client left admin room')
        })

        socket.on('disconnect', () => {
            logger.info({ socketId: socket.id }, 'admin client disconnected')
        })
    })

    setupQueueEventListeners(adminNamespace)

    ensureGeoNamespace()
    ensureUserNotificationsNamespace()
    ensureGeoGamersPartyNamespace(io)

    logger.info('Socket.IO server initialized')
    return io
}

function setupQueueEventListeners(adminNamespace: any) {
    importQueueEvents.on('progress', ({ jobId, data }: any) => {
        const progressData = typeof data === 'number' ? { progress: data } : data

        logger.debug({ jobId, progress: progressData }, 'job progress update')

        adminNamespace.to('admin-room').emit('job_progress', {
            jobId,
            ...progressData,
        })
    })

    importQueueEvents.on('completed', ({ jobId, returnvalue }: { jobId: string; returnvalue: any }) => {
        logger.info({ jobId, result: returnvalue }, 'job completed')

        adminNamespace.to('admin-room').emit('job_completed', {
            jobId,
            result: returnvalue,
        })
    })

    importQueueEvents.on('failed', ({ jobId, failedReason }: { jobId: string; failedReason: string }) => {
        logger.error({ jobId, error: failedReason }, 'job failed')

        adminNamespace.to('admin-room').emit('job_failed', {
            jobId,
            error: failedReason,
        })
    })

    importQueueEvents.on('added', ({ jobId }: { jobId: string }) => {
        logger.debug({ jobId }, 'job added to queue')

        adminNamespace.to('admin-room').emit('job_added', {
            jobId,
        })
    })

    importQueueEvents.on('active', ({ jobId }: { jobId: string }) => {
        logger.debug({ jobId }, 'job started processing')

        adminNamespace.to('admin-room').emit('job_active', {
            jobId,
        })
    })

    importQueueEvents.on('delayed', ({ jobId, delay }: { jobId: string; delay: number }) => {
        logger.debug({ jobId, delay }, 'job delayed')

        adminNamespace.to('admin-room').emit('job_delayed', {
            jobId,
            delay,
        })
    })

    importQueueEvents.on('waiting', ({ jobId }: { jobId: string }) => {
        logger.debug({ jobId }, 'job moved to waiting')

        adminNamespace.to('admin-room').emit('job_waiting', {
            jobId,
        })
    })

    importQueueEvents.on('removed', ({ jobId }: { jobId: string }) => {
        logger.debug({ jobId }, 'job removed from queue')

        adminNamespace.to('admin-room').emit('job_removed', {
            jobId,
        })
    })

    importQueueEvents.on('stalled', ({ jobId }: { jobId: string }) => {
        logger.warn({ jobId }, 'job stalled')

        adminNamespace.to('admin-room').emit('job_stalled', {
            jobId,
        })
    })

    logger.info('BullMQ event listeners configured')
}

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

export function broadcastRecalculateScoresProgress(data: {
    recalculateStateId: number
    progress: number
    status: string
    message?: string
    sessionsProcessed: number
    sessionsUpdated: number
    sessionsSkipped: number
    totalScoreChanges: number
    currentBatch: number
    totalBatches: number | null
    dryRun: boolean
}) {
    if (!io) {
        logger.warn('Socket.IO not initialized, cannot broadcast recalculate scores progress')
        return
    }

    io.of('/admin').to('admin-room').emit('recalculate_scores_progress', data)
    logger.debug({ recalculateStateId: data.recalculateStateId, progress: data.progress }, 'recalculate scores progress broadcast')
}

export function getSocketIO(): SocketIOServer | null {
    return io
}

function geoNamespace(): ReturnType<SocketIOServer['of']> | null {
    return io ? io.of('/geo') : null
}

export function ensureGeoNamespace(): void {
    const ns = geoNamespace()
    if (!ns) return
    if ((ns as unknown as { _the_box_geo_wired?: boolean })._the_box_geo_wired) return
    ns.use(async (socket, next) => {
        const session = await getSocketSession(socket)
        if (!session?.user) {
            return next(new Error('unauthorized'))
        }
        socket.userId = session.user.id
        next()
    })
    ns.on('connection', (socket) => {
        logger.debug({ socketId: socket.id, userId: socket.userId }, 'geo client connected')
        socket.on('join_user', (userId: unknown) => {
            if (typeof userId !== 'string' || userId.length === 0) return
            if (userId !== socket.userId) {
                logger.warn(
                    { socketId: socket.id, sessionUser: socket.userId, requestedUser: userId },
                    'geo join_user mismatch rejected'
                )
                return
            }
            socket.join(`user:${userId}`)
        })
    })
    ;(ns as unknown as { _the_box_geo_wired?: boolean })._the_box_geo_wired = true
}

export function emitGeoRewarded(event: GeoRewardedEvent): void {
    const ns = geoNamespace()
    if (!ns) return
    ns.to(`user:${event.userId}`).emit('geo:contribution:rewarded', event)
}

export function emitGeoTierUp(event: GeoTierUpEvent): void {
    const ns = geoNamespace()
    if (!ns) return
    ns.to(`user:${event.userId}`).emit('geo:contributor:tier_up', event)
}

export function emitGeoGamersSeasonUpdated(event: GeoGamersSeasonUpdatedEvent): void {
    const ns = geoNamespace()
    if (!ns) return
    ns.emit('geogamers:season:updated', event)
}

function userNotificationsNamespace(): ReturnType<SocketIOServer['of']> | null {
    return io ? io.of('/notifications') : null
}

export function ensureUserNotificationsNamespace(): void {
    const ns = userNotificationsNamespace()
    if (!ns) return
    if ((ns as unknown as { _the_box_user_wired?: boolean })._the_box_user_wired) return
    ns.use(async (socket, next) => {
        const session = await getSocketSession(socket)
        if (!session?.user) {
            return next(new Error('unauthorized'))
        }
        socket.userId = session.user.id
        next()
    })
    ns.on('connection', (socket) => {
        logger.debug({ socketId: socket.id, userId: socket.userId }, 'user-notifications client connected')
        socket.on('join_user', (userId: unknown) => {
            if (typeof userId !== 'string' || userId.length === 0) return
            if (userId !== socket.userId) {
                logger.warn(
                    { socketId: socket.id, sessionUser: socket.userId, requestedUser: userId },
                    'notifications join_user mismatch rejected'
                )
                return
            }
            socket.join(`user:${userId}`)
        })
    })
    ;(ns as unknown as { _the_box_user_wired?: boolean })._the_box_user_wired = true
}

export function emitUserPremiumGranted(event: UserPremiumGrantedEvent): void {
    const ns = userNotificationsNamespace()
    if (!ns) return
    ns.to(`user:${event.userId}`).emit('user:premium-granted', event)
}

export function emitRewardGranted(userId: string, event: RewardGrantedEvent): void {
    const ns = userNotificationsNamespace()
    if (!ns) return
    ns.to(`user:${userId}`).emit('reward:granted', event)
}

export function emitAchievementUnlocked(
    userId: string,
    achievements: NewlyEarnedAchievement[]
): void {
    if (achievements.length === 0) return
    const ns = userNotificationsNamespace()
    if (!ns) return
    const event: AchievementUnlockedEvent = {
        userId,
        achievements,
        unlockedAt: new Date().toISOString(),
    }
    ns.to(`user:${userId}`).emit('achievement:unlocked', event)
}

function adminRoomEmit(event: string, payload: unknown): void {
    if (!io) return
    io.of('/admin').to('admin-room').emit(event, payload)
}

export function emitGeoFetchStarted(payload: { totalGames: number }): void {
    adminRoomEmit('geo:fetch:started', payload)
}

export function emitGeoFetchProgress(payload: {
    gameId: number
    source: string
    stage: string
    outcome?: string
}): void {
    adminRoomEmit('geo:fetch:progress', payload)
}

export function emitGeoFetchGameDone(payload: {
    gameId: number
    mapsFound: number
    zonesTotal: number
    finalStage: string
}): void {
    adminRoomEmit('geo:fetch:gameDone', payload)
}

export function emitGeoFetchDone(payload: {
    succeeded: number
    partial: number
    failed: number
}): void {
    adminRoomEmit('geo:fetch:done', payload)
}

export function emitGeoFetchZoneCandidate(payload: {
    gameId: number
    zoneSlug: string | null
    provider: string
    mapId: number
}): void {
    adminRoomEmit('geo:fetch:zoneCandidate', payload)
}

export function emitGeoFetchMapSelected(payload: {
    gameId: number
    zoneSlug: string | null
    mapId: number
    by: string | null
}): void {
    adminRoomEmit('geo:fetch:mapSelected', payload)
}
