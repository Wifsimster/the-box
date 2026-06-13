import { io, Socket } from 'socket.io-client'

// In production, VITE_API_URL is empty string - use undefined so Socket.IO connects to same origin
// In development, use the specified URL (e.g., http://localhost:3000)
const SOCKET_URL = import.meta.env.VITE_API_URL || undefined

let socket: Socket | null = null

/**
 * Get or create Socket.IO client instance for admin namespace
 * Auto-connect is disabled - must call connect() manually
 */
export function getAdminSocket(): Socket {
    if (!socket) {
        // If SOCKET_URL is undefined, use '/admin' (same origin namespace)
        // Otherwise use full URL like 'http://localhost:3000/admin'
        const socketPath = SOCKET_URL ? `${SOCKET_URL}/admin` : '/admin'
        socket = io(socketPath, {
            autoConnect: false,
            path: '/socket.io',
            // Required for the backend to receive the Better Auth session
            // cookie during the namespace handshake — without it the new
            // io.use() middleware rejects every connection.
            withCredentials: true,
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

        socket.on('connect', () => {
            // Connected to admin namespace
        })

        socket.on('disconnect', () => {
            // Disconnected from admin namespace
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
    }
}
