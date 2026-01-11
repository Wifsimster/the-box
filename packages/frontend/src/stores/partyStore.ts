import { create } from 'zustand'
import { devtools } from 'zustand/middleware'
import type { Party, PartyMember, LiveScore } from '@/types'
import {
  createParty as socketCreateParty,
  joinParty as socketJoinParty,
  leaveParty as socketLeaveParty,
  startPartyGame as socketStartPartyGame,
  resetPartyGame as socketResetPartyGame,
  updatePartyScore as socketUpdatePartyScore,
  partyPlayerFinished as socketPartyPlayerFinished,
  onPartyCreated,
  onPartyJoined,
  onPartyUpdated,
  onPartyGameStarted,
  onPartyGameReset,
  onPartyError,
  onPartyDisbanded,
  onLeaderboardUpdate,
  onPlayerJoined,
  onPlayerLeft,
  removePartyListeners,
} from '@/lib/socket'

interface PartyState {
  // Party data
  party: Party | null
  partyCode: string | null
  isHost: boolean
  isInParty: boolean
  isGameStarted: boolean

  // Leaderboard
  leaderboard: LiveScore[]

  // UI state
  error: string | null
  isLoading: boolean

  // Actions
  createParty: (username: string) => void
  joinParty: (partyCode: string, username: string) => void
  leaveParty: () => void
  startGame: (challengeId: number) => void
  resetGame: () => void
  updateScore: (score: number) => void
  playerFinished: (score: number) => void

  // Internal actions
  setParty: (party: Party | null) => void
  setError: (error: string | null) => void
  setLeaderboard: (entries: LiveScore[]) => void
  clearParty: () => void

  // Socket listener management
  initializeListeners: () => () => void
}

const initialState = {
  party: null,
  partyCode: null,
  isHost: false,
  isInParty: false,
  isGameStarted: false,
  leaderboard: [],
  error: null,
  isLoading: false,
}

export const usePartyStore = create<PartyState>()(
  devtools(
    (set, get) => ({
      ...initialState,

      // Set party and derive computed properties
      setParty: (party) => {
        if (!party) {
          set({ ...initialState })
          return
        }

        // Find current user by checking socketId (we don't have access to it directly)
        // Instead, we track isHost based on party updates
        const currentMember = party.members.find((m: PartyMember) => m.isHost)

        set({
          party,
          partyCode: party.code,
          isInParty: true,
          isGameStarted: party.isGameStarted,
          // isHost is tracked separately via socket events
        })
      },

      setError: (error) => set({ error }),

      setLeaderboard: (entries) => set({ leaderboard: entries }),

      clearParty: () => set({ ...initialState }),

      // Party actions
      createParty: (username) => {
        set({ isLoading: true, error: null })
        socketCreateParty(username)
      },

      joinParty: (partyCode, username) => {
        set({ isLoading: true, error: null })
        socketJoinParty(partyCode.toUpperCase(), username)
      },

      leaveParty: () => {
        const { partyCode } = get()
        if (partyCode) {
          socketLeaveParty(partyCode)
          set({ ...initialState })
        }
      },

      startGame: (challengeId) => {
        const { partyCode, isHost } = get()
        if (partyCode && isHost) {
          socketStartPartyGame(partyCode, challengeId)
        }
      },

      resetGame: () => {
        const { partyCode, isHost } = get()
        if (partyCode && isHost) {
          socketResetPartyGame(partyCode)
        }
      },

      updateScore: (score) => {
        const { partyCode } = get()
        if (partyCode) {
          socketUpdatePartyScore(partyCode, score)
        }
      },

      playerFinished: (score) => {
        const { partyCode } = get()
        if (partyCode) {
          socketPartyPlayerFinished(partyCode, score)
        }
      },

      // Initialize socket listeners
      initializeListeners: () => {
        const cleanups: (() => void)[] = []

        // Party created - user is host
        cleanups.push(
          onPartyCreated(({ partyCode, party }) => {
            set({
              party,
              partyCode,
              isHost: true,
              isInParty: true,
              isLoading: false,
              error: null,
            })
          })
        )

        // Party joined - user is not host
        cleanups.push(
          onPartyJoined(({ party }) => {
            set({
              party,
              partyCode: party.code,
              isHost: false,
              isInParty: true,
              isLoading: false,
              error: null,
            })
          })
        )

        // Party updated
        cleanups.push(
          onPartyUpdated(({ party }) => {
            set({
              party,
              isGameStarted: party.isGameStarted,
              // isHost is tracked via party_created/party_joined events
            })
          })
        )

        // Game started
        cleanups.push(
          onPartyGameStarted(({ challengeId }) => {
            set({ isGameStarted: true })
          })
        )

        // Game reset
        cleanups.push(
          onPartyGameReset(({ message }) => {
            set({ isGameStarted: false })
            // Could show a toast notification here
          })
        )

        // Error
        cleanups.push(
          onPartyError(({ message }) => {
            set({ error: message, isLoading: false })
          })
        )

        // Party disbanded
        cleanups.push(
          onPartyDisbanded(({ reason }) => {
            set({ ...initialState, error: reason })
          })
        )

        // Leaderboard update
        cleanups.push(
          onLeaderboardUpdate((entries) => {
            set({ leaderboard: entries })
          })
        )

        // Player joined/left (optional: could show notifications)
        cleanups.push(onPlayerJoined(() => {}))
        cleanups.push(onPlayerLeft(() => {}))

        // Return cleanup function
        return () => {
          cleanups.forEach((cleanup) => cleanup())
          removePartyListeners()
        }
      },
    }),
    { name: 'PartyStore' }
  )
)
