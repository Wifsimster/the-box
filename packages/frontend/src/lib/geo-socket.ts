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
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        randomizationFactor: 0.5,
    })
}

function getGeoSocket(): Socket {
    if (!socket) socket = createSocket()
    return socket
}

export function connectGeoSocket(userId: string | null | undefined): void {
    const s = getGeoSocket()

    const join = (): void => {
        if (userId) s.emit('join_user', userId)
    }

    if (s.connected) {
        join()
        return
    }

    if (!(s as unknown as { _wired?: boolean })._wired) {
        s.on('connect', join)
        s.on('geo:contribution:rewarded', (e: GeoRewardedEvent) => {
            useGeoStore.getState().ingestRewardedEvent(e)
        })
        s.on('geo:contributor:tier_up', (e: GeoTierUpEvent) => {
            useGeoStore.getState().ingestTierUpEvent(e)
        })
        ;(s as unknown as { _wired?: boolean })._wired = true
    }

    s.connect()
}
