import { create } from 'zustand'
import { io, type Socket } from 'socket.io-client'
import type { GeoGamersPartyView, GeoPoint } from '@the-box/types'

const SOCKET_URL = import.meta.env.VITE_API_URL || undefined

let socket: Socket | null = null

function getSocket(): Socket {
    if (socket) return socket
    const path = SOCKET_URL ? `${SOCKET_URL}/geogamers-party` : '/geogamers-party'
    socket = io(path, {
        autoConnect: false,
        path: '/socket.io',
        withCredentials: true,
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionAttempts: Infinity,
    })
    return socket
}

interface PartyState {
    connected: boolean
    view: GeoGamersPartyView | null
    code: string | null
    error: string | null
    // per-round local phase feedback
    lastGuessCorrect: boolean | null
    pendingPin: GeoPoint | null
    selectedMapId: number | null

    connect: () => void
    create: (opts: { rounds: number; timerSeconds: number; name?: string }) => void
    join: (code: string, name?: string) => void
    start: () => void
    guessGame: (guess: string) => void
    setPendingPin: (p: GeoPoint | null) => void
    selectMap: (id: number) => void
    submitLocation: () => void
    advance: () => void
    leave: () => void
}

export const useGeoGamersPartyStore = create<PartyState>()((set, get) => ({
    connected: false,
    view: null,
    code: null,
    error: null,
    lastGuessCorrect: null,
    pendingPin: null,
    selectedMapId: null,

    connect() {
        const s = getSocket()
        if ((s as unknown as { _wired?: boolean })._wired) {
            if (!s.connected) s.connect()
            return
        }
        s.on('connect', () => set({ connected: true }))
        s.on('disconnect', () => set({ connected: false }))
        s.on('party:created', (e: { code: string }) => set({ code: e.code }))
        s.on('party:state', (view: GeoGamersPartyView) => {
            set((prev) => ({
                view,
                code: view.code,
                // reset per-round local state when the round index advances
                pendingPin: prev.view?.round?.index !== view.round?.index ? null : prev.pendingPin,
                lastGuessCorrect:
                    prev.view?.round?.index !== view.round?.index ? null : prev.lastGuessCorrect,
                selectedMapId: view.round?.maps?.[0]?.id ?? prev.selectedMapId,
            }))
        })
        s.on('party:guess_result', (e: { correct: boolean }) =>
            set({ lastGuessCorrect: e.correct }),
        )
        s.on('party:error', (e: { code: string; message: string }) => set({ error: e.message }))
        ;(s as unknown as { _wired?: boolean })._wired = true
        s.connect()
    },

    create(opts) {
        get().connect()
        getSocket().emit('party:create', opts)
    },

    join(code, name) {
        get().connect()
        getSocket().emit('party:join', { code: code.toUpperCase(), name })
    },

    start() {
        const code = get().code
        if (code) getSocket().emit('party:start', { code })
    },

    guessGame(guess) {
        const code = get().code
        if (code) getSocket().emit('party:guess_game', { code, guess })
    },

    setPendingPin(p) {
        set({ pendingPin: p })
    },

    selectMap(id) {
        set({ selectedMapId: id })
    },

    submitLocation() {
        const { code, selectedMapId, pendingPin } = get()
        if (code && selectedMapId && pendingPin) {
            getSocket().emit('party:guess_location', { code, geoMapId: selectedMapId, guess: pendingPin })
        }
    },

    advance() {
        const code = get().code
        if (code) getSocket().emit('party:advance', { code })
    },

    leave() {
        const code = get().code
        if (code) getSocket().emit('party:leave', { code })
        set({ view: null, code: null, pendingPin: null, lastGuessCorrect: null })
    },
}))
