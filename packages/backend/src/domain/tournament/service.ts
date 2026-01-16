import type { Knex } from 'knex'
import { TournamentRepository } from './repository.js'
import type {
    Tournament,
    TournamentParticipant,
    TournamentLeaderboardEntry,
    CreateTournamentDto,
    UpdateTournamentDto,
    TournamentStats,
} from './types.js'

export class TournamentService {
    private repository: TournamentRepository

    constructor(db: Knex) {
        this.repository = new TournamentRepository(db)
    }

    // Tournament management
    async createTournament(data: CreateTournamentDto): Promise<Tournament> {
        // Validate dates
        const startDate = new Date(data.startDate)
        const endDate = new Date(data.endDate)

        if (endDate <= startDate) {
            throw new Error('End date must be after start date')
        }

        // Validate type-specific date ranges
        if (data.type === 'weekly') {
            const daysDiff = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24))
            if (daysDiff !== 6) {
                throw new Error('Weekly tournaments must span exactly 7 days (start to end inclusive)')
            }
        } else if (data.type === 'monthly') {
            const monthDiff = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
                (endDate.getMonth() - startDate.getMonth())
            if (monthDiff !== 0) {
                throw new Error('Monthly tournaments must be within a single month')
            }
        }

        return this.repository.create(data)
    }

    async getTournament(id: number): Promise<Tournament | null> {
        return this.repository.findById(id)
    }

    async listTournaments(filters?: {
        type?: 'weekly' | 'monthly'
        isActive?: boolean
    }): Promise<Tournament[]> {
        return this.repository.findAll(filters)
    }

    async getActiveTournaments(): Promise<Tournament[]> {
        return this.repository.findActive()
    }

    async getUpcomingTournaments(): Promise<Tournament[]> {
        return this.repository.findUpcoming()
    }

    async updateTournament(id: number, data: UpdateTournamentDto): Promise<Tournament | null> {
        const existing = await this.repository.findById(id)
        if (!existing) {
            throw new Error('Tournament not found')
        }

        return this.repository.update(id, data)
    }

    async deleteTournament(id: number): Promise<boolean> {
        return this.repository.delete(id)
    }

    async endTournament(id: number): Promise<Tournament | null> {
        return this.repository.update(id, { isActive: false })
    }

    // Participant management
    async joinTournament(tournamentId: number, userId: string): Promise<TournamentParticipant> {
        const tournament = await this.repository.findById(tournamentId)
        if (!tournament) {
            throw new Error('Tournament not found')
        }

        if (!tournament.isActive) {
            throw new Error('Tournament is not active')
        }

        // Check if tournament has started
        const now = new Date().toISOString().split('T')[0]!
        if (now < tournament.startDate) {
            throw new Error('Tournament has not started yet')
        }

        // Check if tournament has ended
        if (now > tournament.endDate) {
            throw new Error('Tournament has already ended')
        }

        // Check participant limit
        if (tournament.maxParticipants) {
            const count = await this.repository.getParticipantCount(tournamentId)
            if (count >= tournament.maxParticipants) {
                throw new Error('Tournament is full')
            }
        }

        return this.repository.addParticipant(tournamentId, userId)
    }

    async leaveTournament(tournamentId: number, userId: string): Promise<boolean> {
        return this.repository.removeParticipant(tournamentId, userId)
    }

    async isUserParticipating(tournamentId: number, userId: string): Promise<boolean> {
        const participant = await this.repository.findParticipant(tournamentId, userId)
        return participant !== null
    }

    async getParticipantCount(tournamentId: number): Promise<number> {
        return this.repository.getParticipantCount(tournamentId)
    }

    // Leaderboard
    async getTournamentLeaderboard(
        tournamentId: number,
        limit = 100,
        offset = 0
    ): Promise<TournamentLeaderboardEntry[]> {
        const tournament = await this.repository.findById(tournamentId)
        if (!tournament) {
            throw new Error('Tournament not found')
        }

        return this.repository.getLeaderboard(tournamentId, limit, offset)
    }

    async getUserRank(tournamentId: number, userId: string): Promise<number | null> {
        return this.repository.getUserRank(tournamentId, userId)
    }

    async getTopPerformers(tournamentId: number, limit = 10): Promise<TournamentLeaderboardEntry[]> {
        return this.repository.getTopParticipants(tournamentId, limit)
    }

    async getTournamentStats(tournamentId: number): Promise<TournamentStats> {
        return this.repository.getStats(tournamentId)
    }

    // Utility methods for scheduled jobs
    async createWeeklyTournament(startDate: string): Promise<Tournament> {
        const start = new Date(startDate)
        const end = new Date(start)
        end.setDate(end.getDate() + 6) // 7 days total (inclusive)

        const name = `Weekly Challenge ${start.toISOString().split('T')[0]}`
        const endDateStr = end.toISOString().split('T')[0]!

        return this.createTournament({
            name,
            type: 'weekly',
            startDate,
            endDate: endDateStr,
            prizeDescription: 'Top 10 players earn a weekly champion badge',
        })
    }

    async createMonthlyTournament(year: number, month: number): Promise<Tournament> {
        const startDate = new Date(year, month - 1, 1)
        const endDate = new Date(year, month, 0) // Last day of month

        const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
            'July', 'August', 'September', 'October', 'November', 'December']
        const name = `${monthNames[month - 1]} ${year} Tournament`

        return this.createTournament({
            name,
            type: 'monthly',
            startDate: startDate.toISOString().split('T')[0]!,
            endDate: endDate.toISOString().split('T')[0]!,
            prizeDescription: 'Top 3 players earn exclusive monthly champion badges and recognition',
        })
    }

    async refreshLeaderboard(): Promise<void> {
        await this.repository.refreshLeaderboardView()
    }
}
