export interface Tournament {
    id: number
    name: string
    type: 'weekly' | 'monthly'
    startDate: string
    endDate: string
    isActive: boolean
    prizeDescription: string | null
    maxParticipants: number | null
    createdAt: string
    updatedAt: string
}

export interface TournamentLeaderboardEntry {
    tournamentId: number
    userId: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    totalScore: number
    challengesCompleted: number
    lastPlayedAt: string | null
    rank: number
}

export interface TournamentStats {
    totalParticipants: number
    averageScore: number
    highestScore: number
    completionRate: number
}

interface ApiResponse<T> {
    success: boolean
    data?: T
    error?: {
        code: string
        message: string
    }
}

export class TournamentService {
    // Get all tournaments with optional filters
    async getTournaments(filters?: {
        type?: 'weekly' | 'monthly'
        isActive?: boolean
    }): Promise<Tournament[]> {
        const params = new URLSearchParams()
        if (filters?.type) params.append('type', filters.type)
        if (filters?.isActive !== undefined) params.append('isActive', String(filters.isActive))

        const response = await fetch(`/api/tournaments?${params.toString()}`, {
            credentials: 'include',
        })

        if (!response.ok) {
            throw new Error('Failed to fetch tournaments')
        }

        const result: ApiResponse<{ tournaments: Tournament[] }> = await response.json()
        if (!result.success || !result.data) {
            throw new Error(result.error?.message || 'Failed to fetch tournaments')
        }

        return result.data.tournaments
    }

    // Get active tournaments
    async getActiveTournaments(): Promise<Tournament[]> {
        const response = await fetch(`/api/tournaments/active`, {
            credentials: 'include',
        })

        if (!response.ok) {
            throw new Error('Failed to fetch active tournaments')
        }

        const result: ApiResponse<{ tournaments: Tournament[] }> = await response.json()
        if (!result.success || !result.data) {
            throw new Error(result.error?.message || 'Failed to fetch active tournaments')
        }

        return result.data.tournaments
    }

    // Get upcoming tournaments
    async getUpcomingTournaments(): Promise<Tournament[]> {
        const response = await fetch(`/api/tournaments/upcoming`, {
            credentials: 'include',
        })

        if (!response.ok) {
            throw new Error('Failed to fetch upcoming tournaments')
        }

        const result: ApiResponse<{ tournaments: Tournament[] }> = await response.json()
        if (!result.success || !result.data) {
            throw new Error(result.error?.message || 'Failed to fetch upcoming tournaments')
        }

        return result.data.tournaments
    }

    // Get specific tournament
    async getTournament(id: number): Promise<Tournament> {
        const response = await fetch(`/api/tournaments/${id}`, {
            credentials: 'include',
        })

        if (!response.ok) {
            throw new Error('Failed to fetch tournament')
        }

        const result: ApiResponse<{ tournament: Tournament }> = await response.json()
        if (!result.success || !result.data) {
            throw new Error(result.error?.message || 'Failed to fetch tournament')
        }

        return result.data.tournament
    }

    // Get tournament leaderboard
    async getTournamentLeaderboard(
        id: number,
        limit = 100,
        offset = 0
    ): Promise<TournamentLeaderboardEntry[]> {
        const params = new URLSearchParams()
        params.append('limit', String(limit))
        params.append('offset', String(offset))

        const response = await fetch(
            `/api/tournaments/${id}/leaderboard?${params.toString()}`,
            { credentials: 'include' }
        )

        if (!response.ok) {
            throw new Error('Failed to fetch tournament leaderboard')
        }

        const result: ApiResponse<{ leaderboard: TournamentLeaderboardEntry[] }> = await response.json()
        if (!result.success || !result.data) {
            throw new Error(result.error?.message || 'Failed to fetch tournament leaderboard')
        }

        return result.data.leaderboard
    }

    // Get tournament stats
    async getTournamentStats(id: number): Promise<TournamentStats> {
        const response = await fetch(`/api/tournaments/${id}/stats`, {
            credentials: 'include',
        })

        if (!response.ok) {
            throw new Error('Failed to fetch tournament stats')
        }

        const result: ApiResponse<{ stats: TournamentStats }> = await response.json()
        if (!result.success || !result.data) {
            throw new Error(result.error?.message || 'Failed to fetch tournament stats')
        }

        return result.data.stats
    }

    // Get user's rank in tournament (requires auth)
    async getMyRank(id: number): Promise<number | null> {
        try {
            const response = await fetch(`/api/tournaments/${id}/my-rank`, {
                credentials: 'include',
            })

            if (!response.ok) {
                return null
            }

            const result: ApiResponse<{ rank: number | null }> = await response.json()
            if (!result.success || !result.data) {
                return null
            }

            return result.data.rank
        } catch {
            return null
        }
    }

    // Join tournament (requires auth)
    async joinTournament(id: number): Promise<void> {
        const response = await fetch(`/api/tournaments/${id}/join`, {
            method: 'POST',
            credentials: 'include',
        })

        if (!response.ok) {
            const result: ApiResponse<unknown> = await response.json()
            throw new Error(result.error?.message || 'Failed to join tournament')
        }
    }

    // Leave tournament (requires auth)
    async leaveTournament(id: number): Promise<void> {
        const response = await fetch(`/api/tournaments/${id}/leave`, {
            method: 'DELETE',
            credentials: 'include',
        })

        if (!response.ok) {
            const result: ApiResponse<unknown> = await response.json()
            throw new Error(result.error?.message || 'Failed to leave tournament')
        }
    }

    // Check if user is participating (requires auth)
    async isParticipating(id: number): Promise<boolean> {
        try {
            const response = await fetch(`/api/tournaments/${id}/is-participating`, {
                credentials: 'include',
            })

            if (!response.ok) {
                return false
            }

            const result: ApiResponse<{ isParticipating: boolean }> = await response.json()
            if (!result.success || !result.data) {
                return false
            }

            return result.data.isParticipating
        } catch {
            return false
        }
    }
}

export const tournamentService = new TournamentService()
