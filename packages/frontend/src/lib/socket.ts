import { io, Socket } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

let socket: Socket | null = null

/**
 * Get or create Socket.IO client instance for admin namespace
 * Auto-connect is disabled - must call connect() manually
 */
export function getAdminSocket(): Socket {
    if (!socket) {
        socket = io(`${SOCKET_URL}/admin`, {
            autoConnect: false,
            path: '/socket.io',
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionDelayMax: 5000,
            reconnectionAttempts: 5,
        })

        socket.on('connect', () => {
            console.log('[Socket.IO] Connected to admin namespace')
        })

        socket.on('disconnect', (reason) => {
            console.log('[Socket.IO] Disconnected:', reason)
        })

        socket.on('connect_error', (error) => {
            console.error('[Socket.IO] Connection error:', error)
        })
    }

    return socket
}

/**
 * Connect to the admin Socket.IO namespace and join admin room
 */
export function connectAdminSocket(): void {
    const adminSocket = getAdminSocket()

    if (!adminSocket.connected) {
        adminSocket.connect()

        // Join admin room once connected
        adminSocket.once('connect', () => {
            adminSocket.emit('join_admin')
            console.log('[Socket.IO] Joined admin room')
        })
    }
}

/**
 * Disconnect from the admin Socket.IO namespace
 */
export function disconnectAdminSocket(): void {
    if (socket?.connected) {
        socket.emit('leave_admin')
        socket.disconnect()
        console.log('[Socket.IO] Left admin room and disconnected')
    }
}

/**
 * Check if admin socket is connected
 */
export function isAdminSocketConnected(): boolean {
    return socket?.connected ?? false
}
