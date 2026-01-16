import type { Knex } from 'knex'
import type {
    Tournament,
    TournamentParticipant,
    TournamentLeaderboardEntry,
    CreateTournamentDto,
    UpdateTournamentDto,
    TournamentStats,
} from './types.js'

export class TournamentRepository {
    constructor(private db: Knex) { }

    // Tournament CRUD
    async create(data: CreateTournamentDto): Promise<Tournament> {
        const [tournament] = await this.db('tournaments')
            .insert({
                name: data.name,
                type: data.type,
                start_date: data.startDate,
                end_date: data.endDate,
                prize_description: data.prizeDescription || null,
                max_participants: data.maxParticipants || null,
            })
            .returning('*')

        return this.mapTournament(tournament)
    }

    async findById(id: number): Promise<Tournament | null> {
        const tournament = await this.db('tournaments').where({ id }).first()
        return tournament ? this.mapTournament(tournament) : null
    }

    async findAll(filters?: {
        type?: 'weekly' | 'monthly'
        isActive?: boolean
    }): Promise<Tournament[]> {
        let query = this.db('tournaments').orderBy('start_date', 'desc')

        if (filters?.type) {
            query = query.where({ type: filters.type })
        }
        if (filters?.isActive !== undefined) {
            query = query.where({ is_active: filters.isActive })
        }

        const tournaments = await query
        return tournaments.map(this.mapTournament)
    }

    async findActive(): Promise<Tournament[]> {
        const now = new Date().toISOString().split('T')[0]
        const tournaments = await this.db('tournaments')
            .where('is_active', true)
            .whereRaw('start_date <= ?', [now])
            .whereRaw('end_date >= ?', [now])
            .orderBy('start_date', 'desc')

        return tournaments.map(this.mapTournament)
    }

    async findUpcoming(): Promise<Tournament[]> {
        const now = new Date().toISOString().split('T')[0]
        const tournaments = await this.db('tournaments')
            .where('is_active', true)
            .whereRaw('start_date > ?', [now])
            .orderBy('start_date', 'asc')

        return tournaments.map(this.mapTournament)
    }

    async update(id: number, data: UpdateTournamentDto): Promise<Tournament | null> {
        const updateData: Record<string, any> = { updated_at: this.db.fn.now() }

        if (data.name !== undefined) updateData.name = data.name
        if (data.isActive !== undefined) updateData.is_active = data.isActive
        if (data.prizeDescription !== undefined) updateData.prize_description = data.prizeDescription
        if (data.maxParticipants !== undefined) updateData.max_participants = data.maxParticipants

        const [tournament] = await this.db('tournaments')
            .where({ id })
            .update(updateData)
            .returning('*')

        return tournament ? this.mapTournament(tournament) : null
    }

    async delete(id: number): Promise<boolean> {
        const deleted = await this.db('tournaments').where({ id }).del()
        return deleted > 0
    }

    // Participant management
    async addParticipant(tournamentId: number, userId: string): Promise<TournamentParticipant> {
        const [participant] = await this.db('tournament_participants')
            .insert({
                tournament_id: tournamentId,
                user_id: userId,
            })
            .returning('*')
            .onConflict(['tournament_id', 'user_id'])
            .ignore()

        return this.mapParticipant(participant)
    }

    async removeParticipant(tournamentId: number, userId: string): Promise<boolean> {
        const deleted = await this.db('tournament_participants')
            .where({ tournament_id: tournamentId, user_id: userId })
            .del()
        return deleted > 0
    }

    async findParticipant(
        tournamentId: number,
        userId: string
    ): Promise<TournamentParticipant | null> {
        const participant = await this.db('tournament_participants')
            .where({ tournament_id: tournamentId, user_id: userId })
            .first()

        return participant ? this.mapParticipant(participant) : null
    }

    async getParticipantCount(tournamentId: number): Promise<number> {
        const result = await this.db('tournament_participants')
            .where({ tournament_id: tournamentId })
            .count('* as count')
            .first()

        return Number(result?.count || 0)
    }

    // Leaderboard queries
    async getLeaderboard(
        tournamentId: number,
        limit = 100,
        offset = 0
    ): Promise<TournamentLeaderboardEntry[]> {
        // Refresh materialized view first
        await this.refreshLeaderboardView()

        const entries = await this.db('tournament_leaderboard')
            .where({ tournament_id: tournamentId })
            .where('total_score', '>', 0)
            .orderBy('rank', 'asc')
            .limit(limit)
            .offset(offset)

        return entries.map(this.mapLeaderboardEntry)
    }

    async getUserRank(tournamentId: number, userId: string): Promise<number | null> {
        await this.refreshLeaderboardView()

        const entry = await this.db('tournament_leaderboard')
            .where({ tournament_id: tournamentId, user_id: userId })
            .first()

        return entry?.rank || null
    }

    async getTopParticipants(tournamentId: number, limit = 10): Promise<TournamentLeaderboardEntry[]> {
        return this.getLeaderboard(tournamentId, limit, 0)
    }

    async refreshLeaderboardView(): Promise<void> {
        await this.db.raw('REFRESH MATERIALIZED VIEW tournament_leaderboard')
    }

    // Statistics
    async getStats(tournamentId: number): Promise<TournamentStats> {
        const stats = await this.db('tournament_leaderboard')
            .where({ tournament_id: tournamentId })
            .select(
                this.db.raw('COUNT(*) as total_participants'),
                this.db.raw('COALESCE(AVG(total_score), 0) as average_score'),
                this.db.raw('COALESCE(MAX(total_score), 0) as highest_score'),
                this.db.raw('COALESCE(AVG(CASE WHEN challenges_completed > 0 THEN 1 ELSE 0 END), 0) as completion_rate')
            )
            .first()

        return {
            totalParticipants: Number(stats?.total_participants || 0),
            averageScore: Math.round(Number(stats?.average_score || 0)),
            highestScore: Number(stats?.highest_score || 0),
            completionRate: Number(stats?.completion_rate || 0),
        }
    }

    // Utility methods
    private mapTournament(row: any): Tournament {
        return {
            id: row.id,
            name: row.name,
            type: row.type,
            startDate: row.start_date,
            endDate: row.end_date,
            isActive: row.is_active,
            prizeDescription: row.prize_description,
            maxParticipants: row.max_participants,
            createdAt: new Date(row.created_at),
            updatedAt: new Date(row.updated_at),
        }
    }

    private mapParticipant(row: any): TournamentParticipant {
        return {
            id: row.id,
            tournamentId: row.tournament_id,
            userId: row.user_id,
            totalScore: row.total_score,
            challengesCompleted: row.challenges_completed,
            rank: row.rank,
            joinedAt: new Date(row.joined_at),
            lastUpdatedAt: new Date(row.last_updated_at),
        }
    }

    private mapLeaderboardEntry(row: any): TournamentLeaderboardEntry {
        return {
            tournamentId: row.tournament_id,
            userId: row.user_id,
            username: row.username,
            displayName: row.display_name,
            avatarUrl: row.avatar_url,
            totalScore: row.total_score,
            challengesCompleted: row.challenges_completed,
            lastPlayedAt: row.last_played_at ? new Date(row.last_played_at) : null,
            rank: row.rank,
        }
    }
}
