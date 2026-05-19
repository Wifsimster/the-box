import { Server as HTTPServer } from 'http'
import type { Socket } from 'socket.io'
import { Server as SocketIOServer } from 'socket.io'
import { env } from '../../config/env.js'
import { logger } from '../logger/logger.js'
import { auth } from '../auth/auth.js'
import { importQueueEvents } from '../queue/queues.js'
import type {
    AchievementUnlockedEvent,
    GeoRewardedEvent,
    GeoTierUpEvent,
    NewlyEarnedAchievement,
    RewardGrantedEvent,
    UserPremiumGrantedEvent,
} from '@the-box/types'

let io: SocketIOServer | null = null

// Resolve the Better Auth session from a socket handshake. Returns null on
// missing / invalid session; the caller decides how to react.
async function getSocketSession(socket: Socket) {
    try {
        return await auth.api.getSession({
            headers: socket.handshake.headers as Record<string, string>,
        })
    } catch (err) {
        logger.warn({ err: String(err), socketId: socket.id }, 'socket session lookup failed')
        return null
    }
}

// Attach the authenticated user id on the socket so per-namespace `join_user`
// handlers can authorize without re-reading the session.
declare module 'socket.io' {
    interface Socket {
        userId?: string
        userRole?: string
    }
}

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

    // Admin namespace for job updates. Connection is gated by Better Auth:
    // only admins reach the `connection` handler, so `join_admin` doesn't
    // need a second role check.
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

    ensureGeoNamespace()
    ensureUserNotificationsNamespace()

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
 * Broadcast recalculate scores progress to admin clients
 */
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

/**
 * Get Socket.IO instance
 */
export function getSocketIO(): SocketIOServer | null {
    return io
}

// ---------- Geolocation mode ----------
//
// Geo events live under a dedicated `/geo` namespace to keep them isolated
// from the admin namespace. Clients join a per-user room so we only broadcast
// rewards/tier-ups to the affected user.

function geoNamespace(): ReturnType<SocketIOServer['of']> | null {
    return io ? io.of('/geo') : null
}

export function ensureGeoNamespace(): void {
    const ns = geoNamespace()
    if (!ns) return
    if ((ns as unknown as { _the_box_geo_wired?: boolean })._the_box_geo_wired) return
    // Resolve session once at connection time so `join_user` cannot be used
    // to subscribe to another user's reward stream (previously an IDOR).
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

// ---------- User-targeted notifications ----------
//
// Generic per-user notification channel (Premium grants, future account-level
// alerts). Lives under `/notifications` so it stays mounted regardless of which
// page the user is on, unlike `/geo` which only connects on Geo screens.

function userNotificationsNamespace(): ReturnType<SocketIOServer['of']> | null {
    return io ? io.of('/notifications') : null
}

export function ensureUserNotificationsNamespace(): void {
    const ns = userNotificationsNamespace()
    if (!ns) return
    if ((ns as unknown as { _the_box_user_wired?: boolean })._the_box_user_wired) return
    // Same auth posture as /geo — session-bound, no cross-user join.
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

/**
 * Emit a generic reward grant to the user-notifications namespace. Called
 * by every async reward path (reactivation, milestones, payouts, …) AFTER
 * `rewardsService.grant(...)` returns wasNew=true so the inbox UI updates
 * live without polling. The grant row is already persisted, so a missed
 * emit (offline client) is reconciled on reconnect via the unclaimed-list
 * endpoint — this emit is best-effort, not authoritative.
 */
export function emitRewardGranted(userId: string, event: RewardGrantedEvent): void {
    const ns = userNotificationsNamespace()
    if (!ns) return
    ns.to(`user:${userId}`).emit('reward:granted', event)
}

/**
 * Emit an achievement-unlock to the user-notifications namespace. Called
 * from every unlock path — game completion + forfeit (`game.routes`) and
 * the account-age milestone worker — AFTER the `user_achievements` rows are
 * persisted, so the user sees a celebratory toast on whatever page they are
 * on. Best-effort: a missed emit (offline client) is reconciled when the
 * achievements page next loads, so this emit is not authoritative.
 */
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

// ---------- Geo-fetch pipeline (admin-only) ----------
// Pipeline progress is admin-facing only — emitted into the /admin namespace
// so the new admin tab can render live state without joining /geo.

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
