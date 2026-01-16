import { db } from '../../database/connection.js'
import { TournamentService } from '../../../domain/tournament/service.js'
import { TournamentEmailService } from '../../email/tournamentEmailService.js'
import { queueLogger } from '../../logger/logger.js'

const log = queueLogger
const tournamentService = new TournamentService(db)
const emailService = new TournamentEmailService(db)

interface TournamentJobResult {
    message: string
    created?: boolean
    ended?: boolean
    emailsSent?: number
}

export async function createWeeklyTournament(): Promise<TournamentJobResult> {
    try {
        const now = new Date()
        // Get the Monday of the current week
        const dayOfWeek = now.getDay()
        const monday = new Date(now)
        monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1))
        const startDate = monday.toISOString().split('T')[0]!

        log.info({ startDate }, 'Creating weekly tournament')

        const tournament = await tournamentService.createWeeklyTournament(startDate)

        // Send start emails to active users
        const userEmails = await emailService.getActiveUserEmails()
        await emailService.sendTournamentStartEmail(tournament, userEmails)

        log.info({ tournamentId: tournament.id, emailsSent: userEmails.length }, 'Weekly tournament created and emails sent')

        return {
            message: `Created weekly tournament: ${tournament.name} (${userEmails.length} emails sent)`,
            created: true,
            emailsSent: userEmails.length,
        }
    } catch (error: any) {
        log.error({ error: String(error) }, 'Failed to create weekly tournament')
        return {
            message: `Failed to create weekly tournament: ${error.message}`,
            created: false,
        }
    }
}

export async function createMonthlyTournament(): Promise<TournamentJobResult> {
    try {
        const now = new Date()
        const year = now.getFullYear()
        const month = now.getMonth() + 1 // 1-indexed

        log.info({ year, month }, 'Creating monthly tournament')

        const tournament = await tournamentService.createMonthlyTournament(year, month)

        // Send start emails to active users
        const userEmails = await emailService.getActiveUserEmails()
        await emailService.sendTournamentStartEmail(tournament, userEmails)

        log.info({ tournamentId: tournament.id, emailsSent: userEmails.length }, 'Monthly tournament created and emails sent')

        return {
            message: `Created monthly tournament: ${tournament.name} (${userEmails.length} emails sent)`,
            created: true,
            emailsSent: userEmails.length,
        }
    } catch (error: any) {
        log.error({ error: String(error) }, 'Failed to create monthly tournament')
        return {
            message: `Failed to create monthly tournament: ${error.message}`,
            created: false,
        }
    }
}

export async function endWeeklyTournament(): Promise<TournamentJobResult> {
    try {
        // Find active weekly tournaments that have ended
        const now = new Date().toISOString().split('T')[0]!
        const tournaments = await tournamentService.listTournaments({ type: 'weekly', isActive: true })

        const endedTournaments = tournaments.filter((t) => t.endDate < now)

        if (endedTournaments.length === 0) {
            log.info('No weekly tournaments to end')
            return {
                message: 'No weekly tournaments to end',
                ended: false,
            }
        }

        for (const tournament of endedTournaments) {
            log.info({ tournamentId: tournament.id }, 'Ending weekly tournament')

            // Refresh leaderboard
            await tournamentService.refreshLeaderboard()

            // Get top performers
            const topPerformers = await tournamentService.getTopPerformers(tournament.id, 10)

            // End tournament
            await tournamentService.endTournament(tournament.id)

            // Send results emails to all participants
            const participantEmails = await emailService.getTournamentParticipantEmails(tournament.id)

            if (participantEmails.length > 0) {
                // Create recipient list with ranks and scores
                const recipients = await Promise.all(
                    participantEmails.map(async (email) => {
                        const user = await db('user').where({ email }).first()
                        if (!user) return { email }

                        const rank = await tournamentService.getUserRank(tournament.id, user.id)
                        const leaderboardEntry = topPerformers.find((p) => p.userId === user.id)

                        return {
                            email,
                            rank: rank || undefined,
                            score: leaderboardEntry?.totalScore,
                        }
                    })
                )

                await emailService.sendTournamentResultsEmail(tournament, topPerformers, recipients)

                log.info({ tournamentId: tournament.id, emailsSent: participantEmails.length }, 'Weekly tournament ended and results sent')
            }
        }

        return {
            message: `Ended ${endedTournaments.length} weekly tournament(s)`,
            ended: true,
        }
    } catch (error: any) {
        log.error({ error: String(error) }, 'Failed to end weekly tournament')
        return {
            message: `Failed to end weekly tournament: ${error.message}`,
            ended: false,
        }
    }
}

export async function endMonthlyTournament(): Promise<TournamentJobResult> {
    try {
        // Find active monthly tournaments that have ended
        const now = new Date().toISOString().split('T')[0]!
        const tournaments = await tournamentService.listTournaments({ type: 'monthly', isActive: true })

        const endedTournaments = tournaments.filter((t) => t.endDate < now)

        if (endedTournaments.length === 0) {
            log.info('No monthly tournaments to end')
            return {
                message: 'No monthly tournaments to end',
                ended: false,
            }
        }

        for (const tournament of endedTournaments) {
            log.info({ tournamentId: tournament.id }, 'Ending monthly tournament')

            // Refresh leaderboard
            await tournamentService.refreshLeaderboard()

            // Get top performers
            const topPerformers = await tournamentService.getTopPerformers(tournament.id, 10)

            // End tournament
            await tournamentService.endTournament(tournament.id)

            // Send results emails to all participants
            const participantEmails = await emailService.getTournamentParticipantEmails(tournament.id)

            if (participantEmails.length > 0) {
                const recipients = await Promise.all(
                    participantEmails.map(async (email) => {
                        const user = await db('user').where({ email }).first()
                        if (!user) return { email }

                        const rank = await tournamentService.getUserRank(tournament.id, user.id)
                        const leaderboardEntry = topPerformers.find((p) => p.userId === user.id)

                        return {
                            email,
                            rank: rank || undefined,
                            score: leaderboardEntry?.totalScore,
                        }
                    })
                )

                await emailService.sendTournamentResultsEmail(tournament, topPerformers, recipients)

                log.info({ tournamentId: tournament.id, emailsSent: participantEmails.length }, 'Monthly tournament ended and results sent')
            }
        }

        return {
            message: `Ended ${endedTournaments.length} monthly tournament(s)`,
            ended: true,
        }
    } catch (error: any) {
        log.error({ error: String(error) }, 'Failed to end monthly tournament')
        return {
            message: `Failed to end monthly tournament: ${error.message}`,
            ended: false,
        }
    }
}

export async function sendTournamentReminders(): Promise<TournamentJobResult> {
    try {
        // Find active tournaments ending soon (within 24-48 hours)
        const now = new Date()
        const tomorrow = new Date(now)
        tomorrow.setDate(tomorrow.getDate() + 1)
        const dayAfterTomorrow = new Date(now)
        dayAfterTomorrow.setDate(dayAfterTomorrow.getDate() + 2)

        const tomorrowStr = tomorrow.toISOString().split('T')[0]!
        const dayAfterStr = dayAfterTomorrow.toISOString().split('T')[0]!

        const activeTournaments = await tournamentService.getActiveTournaments()
        const endingSoon = activeTournaments.filter(
            (t) => t.endDate === tomorrowStr || t.endDate === dayAfterStr
        )

        if (endingSoon.length === 0) {
            log.info('No tournaments ending soon')
            return {
                message: 'No tournaments ending soon',
                emailsSent: 0,
            }
        }

        let totalEmailsSent = 0

        for (const tournament of endingSoon) {
            const hoursRemaining = Math.round(
                (new Date(tournament.endDate).getTime() - now.getTime()) / (1000 * 60 * 60)
            )

            log.info({ tournamentId: tournament.id, hoursRemaining }, 'Sending tournament reminder')

            const participantEmails = await emailService.getTournamentParticipantEmails(tournament.id)

            if (participantEmails.length > 0) {
                await emailService.sendTournamentReminderEmail(tournament, participantEmails, hoursRemaining)
                totalEmailsSent += participantEmails.length

                log.info({ tournamentId: tournament.id, emailsSent: participantEmails.length }, 'Tournament reminders sent')
            }
        }

        return {
            message: `Sent ${totalEmailsSent} reminder emails for ${endingSoon.length} tournament(s)`,
            emailsSent: totalEmailsSent,
        }
    } catch (error: any) {
        log.error({ error: String(error) }, 'Failed to send tournament reminders')
        return {
            message: `Failed to send tournament reminders: ${error.message}`,
            emailsSent: 0,
        }
    }
}
