import type { Knex } from 'knex'
import { resend } from '../auth/auth.js'
import { env } from '../../config/env.js'
import { TournamentEmailTemplates } from './tournamentEmailTemplates.js'
import type { Tournament, TournamentLeaderboardEntry } from '../../domain/tournament/types.js'

export class TournamentEmailService {
    private templates: TournamentEmailTemplates
    private db: Knex

    constructor(db: Knex, baseUrl: string = 'http://localhost:5173') {
        this.templates = new TournamentEmailTemplates(baseUrl)
        this.db = db
    }

    async sendTournamentStartEmail(tournament: Tournament, userEmails: string[]): Promise<void> {
        if (!resend) {
            console.warn('Resend not configured, skipping tournament start emails')
            return
        }

        const { subject, html } = this.templates.tournamentStart(tournament)

        // Send in batches of 100 (Resend limit)
        const batches = this.chunkArray(userEmails, 100)

        for (const batch of batches) {
            try {
                await resend.batch.send(
                    batch.map((email) => ({
                        from: `The Box <${env.EMAIL_FROM}>`,
                        to: email,
                        subject,
                        html,
                    }))
                )

                // Log notifications
                await this.logNotifications(
                    tournament.id,
                    batch,
                    'start',
                    subject,
                    html
                )
            } catch (error) {
                console.error('Failed to send tournament start emails:', error)
                throw error
            }
        }
    }

    async sendTournamentReminderEmail(
        tournament: Tournament,
        userEmails: string[],
        hoursRemaining: number
    ): Promise<void> {
        if (!resend) {
            console.warn('Resend not configured, skipping tournament reminder emails')
            return
        }

        const { subject, html } = this.templates.tournamentReminder(tournament, hoursRemaining)

        const batches = this.chunkArray(userEmails, 100)

        for (const batch of batches) {
            try {
                await resend.batch.send(
                    batch.map((email) => ({
                        from: `The Box <${env.EMAIL_FROM}>`,
                        to: email,
                        subject,
                        html,
                    }))
                )

                await this.logNotifications(
                    tournament.id,
                    batch,
                    'reminder',
                    subject,
                    html
                )
            } catch (error) {
                console.error('Failed to send tournament reminder emails:', error)
                throw error
            }
        }
    }

    async sendTournamentResultsEmail(
        tournament: Tournament,
        topPerformers: TournamentLeaderboardEntry[],
        recipients: Array<{ email: string; rank?: number; score?: number }>
    ): Promise<void> {
        if (!resend) {
            console.warn('Resend not configured, skipping tournament results emails')
            return
        }

        const batches = this.chunkArray(recipients, 100)

        for (const batch of batches) {
            try {
                await resend.batch.send(
                    batch.map((recipient) => {
                        const { subject, html } = this.templates.tournamentResults(
                            tournament,
                            topPerformers,
                            recipient.rank,
                            recipient.score
                        )

                        return {
                            from: `The Box <${env.EMAIL_FROM}>`,
                            to: recipient.email,
                            subject,
                            html,
                        }
                    })
                )

                await this.logNotifications(
                    tournament.id,
                    batch.map((r) => r.email),
                    'results',
                    'Tournament Results',
                    'Personalized results email'
                )
            } catch (error) {
                console.error('Failed to send tournament results emails:', error)
                throw error
            }
        }
    }

    async getActiveUserEmails(): Promise<string[]> {
        const users = await this.db('user')
            .where('isAnonymous', false)
            .whereNotNull('email')
            .select('email')

        return users.map((u) => u.email).filter((email): email is string => !!email)
    }

    async getTournamentParticipantEmails(tournamentId: number): Promise<string[]> {
        const participants = await this.db('tournament_participants')
            .join('user', 'tournament_participants.user_id', 'user.id')
            .where('tournament_participants.tournament_id', tournamentId)
            .where('user.isAnonymous', false)
            .whereNotNull('user.email')
            .select('user.email')

        return participants.map((p) => p.email).filter((email): email is string => !!email)
    }

    private async logNotifications(
        tournamentId: number,
        emails: string[],
        type: 'start' | 'reminder' | 'results' | 'prize_awarded',
        subject: string,
        body: string
    ): Promise<void> {
        // Get user IDs from emails
        const users = await this.db('user')
            .whereIn('email', emails)
            .select('id', 'email')

        const emailToUserId = new Map(users.map((u) => [u.email, u.id]))

        const notifications = emails.map((email) => ({
            tournament_id: tournamentId,
            user_id: emailToUserId.get(email) || null,
            notification_type: type,
            email_subject: subject,
            email_body: body,
            is_sent: true,
            sent_at: new Date(),
        }))

        if (notifications.length > 0) {
            await this.db('tournament_notifications').insert(notifications)
        }
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = []
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size))
        }
        return chunks
    }
}
