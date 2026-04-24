import { io, Socket } from 'socket.io-client'
import type {
    GeoRewardedEvent,
    GeoTierUpEvent,
} from '@the-box/types'
import { useGeoStore } from '@/stores/geoStore'

const SOCKET_URL = import.meta.env.VITE_API_URL || undefined

let socket: Socket | null = null

function createSocket(): Socket {
    const path = SOCKET_URL ? `${SOCKET_URL}/geo` : '/geo'
    return io(path, {
        autoConnect: false,
        path: '/socket.io',
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        // Cellular networks drop and recover all day — keep trying. Default
        // randomizationFactor (0.5) already jitters the backoff so a fleet
        // recovering from the same outage doesn't stampede the server.
        reconnectionAttempts: Infinity,
        randomizationFactor: 0.5,
    })
}

export function getGeoSocket(): Socket {
    if (!socket) socket = createSocket()
    return socket
}

/**
 * Open the `/geo` socket, join the per-user room, and feed all three event
 * types into the store. Idempotent: re-calling re-joins without reconnecting.
 */
export function connectGeoSocket(userId: string | null | undefined): void {
    const s = getGeoSocket()

    const join = (): void => {
        if (userId) s.emit('join_user', userId)
    }

    if (s.connected) {
        join()
        return
    }

    // Wire once; rely on the singleton's listeners surviving reconnects.
    if (!(s as unknown as { _wired?: boolean })._wired) {
        s.on('connect', join)
        s.on('geo:contribution:rewarded', (e: GeoRewardedEvent) => {
            useGeoStore.getState().ingestRewardedEvent(e)
        })
        s.on('geo:contributor:tier_up', (e: GeoTierUpEvent) => {
            useGeoStore.getState().ingestTierUpEvent(e)
        })
        s.on('geo:leaderboard:update', (payload: { challengeDate: string }) => {
            // Refresh the daily board if we happen to be viewing it.
            useGeoStore.getState().loadLeaderboardDaily(payload.challengeDate).catch(() => {})
        })
        ;(s as unknown as { _wired?: boolean })._wired = true
    }

    s.connect()
}

export function disconnectGeoSocket(): void {
    if (socket?.connected) socket.disconnect()
}
