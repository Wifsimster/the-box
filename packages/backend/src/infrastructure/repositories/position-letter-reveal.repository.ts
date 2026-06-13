import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type {
    PositionLetterRevealRepository as Port,
    PositionLetterRevealRow,
} from '../../domain/ports/repositories.js'

const log = repoLogger.child({ repository: 'position-letter-reveal' })

export const positionLetterRevealRepository = {
    async find(
        tierSessionId: string,
        position: number
    ): Promise<PositionLetterRevealRow | null> {
        const row = await db<PositionLetterRevealRow>('position_letter_reveals')
            .where({ tier_session_id: tierSessionId, position })
            .first()
        return row ?? null
    },

    async recordReveal(input: {
        tierSessionId: string
        position: number
        addPenaltyPct: number
    }): Promise<PositionLetterRevealRow> {
        const { tierSessionId, position, addPenaltyPct } = input
        log.info({ tierSessionId, position, addPenaltyPct }, 'recordReveal')

        // Upsert: first reveal inserts the row, later reveals bump the
        // counter and stack the penalty. The cap and the per-step penalty
        // are decided by the domain service under the tier-session
        // advisory lock, so this statement only has to be atomic per row.
        const result = await db.raw<{ rows: PositionLetterRevealRow[] }>(
            `
            INSERT INTO position_letter_reveals
                (tier_session_id, position, letters_revealed, penalty_pct)
            VALUES (?, ?, 1, ?)
            ON CONFLICT (tier_session_id, position) DO UPDATE SET
                letters_revealed = position_letter_reveals.letters_revealed + 1,
                penalty_pct = position_letter_reveals.penalty_pct + EXCLUDED.penalty_pct,
                last_revealed_at = NOW()
            RETURNING *
            `,
            [tierSessionId, position, addPenaltyPct]
        )
        return result.rows[0]!
    },

    async findPending(
        tierSessionId: string,
        position: number
    ): Promise<PositionLetterRevealRow | null> {
        const row = await db<PositionLetterRevealRow>('position_letter_reveals')
            .where({ tier_session_id: tierSessionId, position })
            .whereNull('applied_to_guess_id')
            .first()
        return row ?? null
    },

    async markApplied(revealId: number, guessId: number | null): Promise<void> {
        await db('position_letter_reveals')
            .where({ id: revealId })
            .whereNull('applied_to_guess_id')
            .update({ applied_to_guess_id: guessId })
    },
}

// Type-level check: the repository must satisfy the domain port.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const _positionLetterRevealRepositoryTypeCheck: Port =
    positionLetterRevealRepository
