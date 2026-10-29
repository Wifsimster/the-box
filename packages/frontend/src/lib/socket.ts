import { io, Socket } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_API_URL || undefined

let socket: Socket | null = null

export function getAdminSocket(): Socket {
    if (!socket) {
        const socketPath = SOCKET_URL ? `${SOCKET_URL}/admin` : '/admin'
        socket = io(socketPath, {
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

        socket.on('connect', () => {
        })

        socket.on('disconnect', () => {
        })

        socket.on('connect_error', (error) => {
            console.error('[Socket.IO] Connection error:', error)
        })
    }

    return socket
}

export function connectAdminSocket(): void {
    const adminSocket = getAdminSocket()

    if (!adminSocket.connected) {
        adminSocket.connect()

        adminSocket.once('connect', () => {
            adminSocket.emit('join_admin')
        })
    }
}

export function disconnectAdminSocket(): void {
    if (socket?.connected) {
        socket.emit('leave_admin')
        socket.disconnect()
    }
}
