export interface Tournament {
    id: number
    name: string
    type: 'weekly' | 'monthly'
    startDate: string // ISO date string (YYYY-MM-DD)
    endDate: string // ISO date string (YYYY-MM-DD)
    isActive: boolean
    prizeDescription: string | null
    maxParticipants: number | null
    createdAt: Date
    updatedAt: Date
}

export interface TournamentParticipant {
    id: number
    tournamentId: number
    userId: string
    totalScore: number
    challengesCompleted: number
    rank: number | null
    joinedAt: Date
    lastUpdatedAt: Date
}

export interface TournamentLeaderboardEntry {
    tournamentId: number
    userId: string
    username: string
    displayName: string | null
    avatarUrl: string | null
    totalScore: number
    challengesCompleted: number
    lastPlayedAt: Date | null
    rank: number
}

export interface TournamentNotification {
    id: number
    tournamentId: number
    userId: string | null
    notificationType: 'start' | 'reminder' | 'results' | 'prize_awarded'
    emailSubject: string | null
    emailBody: string | null
    isSent: boolean
    sentAt: Date | null
    createdAt: Date
}

export interface CreateTournamentDto {
    name: string
    type: 'weekly' | 'monthly'
    startDate: string
    endDate: string
    prizeDescription?: string
    maxParticipants?: number
}

export interface UpdateTournamentDto {
    name?: string
    isActive?: boolean
    prizeDescription?: string
    maxParticipants?: number
}

export interface TournamentStats {
    totalParticipants: number
    averageScore: number
    highestScore: number
    completionRate: number
}
