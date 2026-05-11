import { io, Socket } from 'socket.io-client'
import type { RewardGrantedEvent, UserPremiumGrantedEvent } from '@the-box/types'
import { toast as sonner } from 'sonner'
import i18n from '@/lib/i18n'

const SOCKET_URL = import.meta.env.VITE_API_URL || undefined

let socket: Socket | null = null

function createSocket(): Socket {
    const path = SOCKET_URL ? `${SOCKET_URL}/notifications` : '/notifications'
    return io(path, {
        autoConnect: false,
        path: '/socket.io',
        // Carries the Better Auth session cookie through the WebSocket
        // handshake so the server's namespace middleware can authorize.
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        randomizationFactor: 0.5,
    })
}

function getNotificationsSocket(): Socket {
    if (!socket) socket = createSocket()
    return socket
}

function showPremiumGrantedToast(event: UserPremiumGrantedEvent): void {
    const t = i18n.getFixedT(null, 'translation')
    sonner.success(t('notifications.premiumGranted.title'), {
        description: t('notifications.premiumGranted.body'),
        duration: 8000,
    })
    // Side-channel for stores/components that need to react beyond the toast
    // (e.g., refreshing cached entitlement). Kept loose to avoid coupling.
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('user:premium-granted', { detail: event }))
    }
}

/**
 * Open the `/notifications` socket and join the per-user room. Idempotent —
 * re-calling with the same userId just re-joins; calling with a different
 * userId re-joins the new room (sign-in/sign-out boundaries).
 */
export function connectNotificationsSocket(userId: string | null | undefined): void {
    if (!userId) return
    const s = getNotificationsSocket()

    const join = (): void => {
        s.emit('join_user', userId)
    }

    if (!(s as unknown as { _wired?: boolean })._wired) {
        s.on('connect', join)
        s.on('user:premium-granted', (e: UserPremiumGrantedEvent) => {
            showPremiumGrantedToast(e)
        })
        // Async reward grants land in the RewardsInbox — no toast on
        // arrival, by design. The bell-badge counter (driven by the
        // rewards store) is the only visual cue. This forwards the
        // payload to a window event so the store can subscribe without
        // creating a socket↔store import cycle.
        s.on('reward:granted', (e: RewardGrantedEvent) => {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('reward:granted', { detail: e })
                )
            }
        })
        ;(s as unknown as { _wired?: boolean })._wired = true
    }

    if (s.connected) {
        join()
        return
    }
    s.connect()
}

export function disconnectNotificationsSocket(): void {
    if (socket?.connected) socket.disconnect()
}
