import { io, Socket } from 'socket.io-client'
import type {
    AchievementUnlockedEvent,
    RewardGrantedEvent,
    UserPremiumGrantedEvent,
} from '@the-box/types'
import { toast as sonner } from 'sonner'
import i18n from '@/lib/i18n'
import { notifyAchievementsUnlocked } from '@/lib/achievementToasts'

const SOCKET_URL = import.meta.env.VITE_API_URL || undefined

let socket: Socket | null = null

function createSocket(): Socket {
    const path = SOCKET_URL ? `${SOCKET_URL}/notifications` : '/notifications'
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
    if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('user:premium-granted', { detail: event }))
    }
}

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
        s.on('reward:granted', (e: RewardGrantedEvent) => {
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('reward:granted', { detail: e })
                )
            }
        })
        s.on('achievement:unlocked', (e: AchievementUnlockedEvent) => {
            notifyAchievementsUnlocked(e.achievements)
            if (typeof window !== 'undefined') {
                window.dispatchEvent(
                    new CustomEvent('achievement:unlocked', { detail: e })
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
