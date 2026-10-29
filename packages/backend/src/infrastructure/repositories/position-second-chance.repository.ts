import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type {
    PositionSecondChanceRepository as Port,
    PositionSecondChanceRow,
} from '../../domain/ports/repositories.js'

const log = repoLogger.child({ repository: 'position-second-chance' })

const ITEM_TYPE = 'powerup'
const ITEM_KEY = 'second_chance'

export const positionSecondChanceRepository = {
    async activate(input: {
        userId: string
        tierSessionId: string
        position: number
    }): Promise<
        | { ok: true; row: PositionSecondChanceRow }
        | { ok: false; reason: 'ALREADY_ACTIVE' | 'NO_INVENTORY' }
    > {
        const { userId, tierSessionId, position } = input
        log.info({ userId, tierSessionId, position }, 'activate')

        return db.transaction(async (trx) => {
            const existing = await trx<PositionSecondChanceRow>(
                'position_second_chances'
            )
                .where({ tier_session_id: tierSessionId, position })
                .first()
            if (existing) {
                return { ok: false, reason: 'ALREADY_ACTIVE' as const }
            }

            const decremented = await trx('user_inventory')
                .where({
                    user_id: userId,
                    item_type: ITEM_TYPE,
                    item_key: ITEM_KEY,
                })
                .where('quantity', '>=', 1)
                .decrement('quantity', 1)

            const affected = decremented as unknown as number
            if (affected === 0) {
                return { ok: false, reason: 'NO_INVENTORY' as const }
            }

            const inserted = await trx
                .raw<{ rows: PositionSecondChanceRow[] }>(
                    `
                    INSERT INTO position_second_chances (tier_session_id, position)
                    VALUES (?, ?)
                    ON CONFLICT (tier_session_id, position) DO NOTHING
                    RETURNING *
                    `,
                    [tierSessionId, position]
                )

            if (inserted.rows.length === 0) {
                await trx('user_inventory')
                    .where({
                        user_id: userId,
                        item_type: ITEM_TYPE,
                        item_key: ITEM_KEY,
                    })
                    .increment('quantity', 1)
                return { ok: false, reason: 'ALREADY_ACTIVE' as const }
            }

            return { ok: true, row: inserted.rows[0]! }
        })
    },

    async findPending(
        tierSessionId: string,
        position: number
    ): Promise<PositionSecondChanceRow | null> {
        const row = await db<PositionSecondChanceRow>('position_second_chances')
            .where({ tier_session_id: tierSessionId, position })
            .whereNull('applied_to_guess_id')
            .first()
        return row ?? null
    },

    async markApplied(
        activationId: number,
        guessId: number | null
    ): Promise<void> {
        await db('position_second_chances')
            .where({ id: activationId })
            .whereNull('applied_to_guess_id')
            .update({ applied_to_guess_id: guessId })
    },
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const _positionSecondChanceRepositoryTypeCheck: Port =
    positionSecondChanceRepository
