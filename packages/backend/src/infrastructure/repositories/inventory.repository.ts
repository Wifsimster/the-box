import { db } from '../database/connection.js'
import { repoLogger } from '../logger/logger.js'
import type { UserInventory, UserInventoryItem } from '@the-box/types'

const log = repoLogger.child({ repository: 'inventory' })

// Database row type
export interface UserInventoryRow {
    id: number
    user_id: string
    item_type: string
    item_key: string
    quantity: number
    created_at: Date
    updated_at: Date
}

function mapRowToItem(row: UserInventoryRow): UserInventoryItem {
    return {
        id: row.id,
        userId: row.user_id,
        itemType: row.item_type,
        itemKey: row.item_key,
        quantity: row.quantity,
    }
}

export const inventoryRepository = {
    /**
     * Get user's full inventory
     */
    async getUserInventory(userId: string): Promise<UserInventory> {
        log.debug({ userId }, 'getUserInventory')

        const rows = await db('user_inventory')
            .where('user_id', userId)
            .select<UserInventoryRow[]>('*')

        const powerups: Record<string, number> = {}
        let totalItems = 0

        for (const row of rows) {
            if (row.item_type === 'powerup') {
                powerups[row.item_key] = row.quantity
                totalItems += row.quantity
            }
        }

        return { powerups, totalItems }
    },

    /**
     * Get specific inventory item
     */
    async getItem(userId: string, itemType: string, itemKey: string): Promise<UserInventoryItem | null> {
        log.debug({ userId, itemType, itemKey }, 'getItem')

        const row = await db('user_inventory')
            .where({
                user_id: userId,
                item_type: itemType,
                item_key: itemKey,
            })
            .first<UserInventoryRow>()

        return row ? mapRowToItem(row) : null
    },

    /**
     * Add items to inventory (creates if not exists)
     */
    async addItems(userId: string, itemType: string, itemKey: string, quantity: number): Promise<void> {
        log.info({ userId, itemType, itemKey, quantity }, 'addItems')

        // Upsert: insert or update if exists
        await db.raw(`
            INSERT INTO user_inventory (user_id, item_type, item_key, quantity, updated_at)
            VALUES (?, ?, ?, ?, NOW())
            ON CONFLICT (user_id, item_type, item_key)
            DO UPDATE SET quantity = user_inventory.quantity + ?, updated_at = NOW()
        `, [userId, itemType, itemKey, quantity, quantity])
    },

    /**
     * Use items from inventory (decrements quantity)
     * Returns true if successful, false if not enough items
     */
    async useItems(userId: string, itemType: string, itemKey: string, quantity: number = 1): Promise<boolean> {
        log.info({ userId, itemType, itemKey, quantity }, 'useItems')

        const result = await db('user_inventory')
            .where({
                user_id: userId,
                item_type: itemType,
                item_key: itemKey,
            })
            .where('quantity', '>=', quantity)
            .decrement('quantity', quantity)

        const affected = result as unknown as number
        if (affected === 0) {
            log.warn({ userId, itemType, itemKey, quantity }, 'useItems failed - not enough items')
            return false
        }

        return true
    },

    /**
     * Get quantity of a specific item
     */
    async getItemQuantity(userId: string, itemType: string, itemKey: string): Promise<number> {
        const item = await this.getItem(userId, itemType, itemKey)
        return item?.quantity ?? 0
    },

    /**
     * Add multiple items in a single transaction
     */
    async addMultipleItems(
        userId: string,
        items: Array<{ itemType: string; itemKey: string; quantity: number }>
    ): Promise<void> {
        log.info({ userId, itemCount: items.length }, 'addMultipleItems')

        await db.transaction(async (trx) => {
            for (const item of items) {
                await trx.raw(`
                    INSERT INTO user_inventory (user_id, item_type, item_key, quantity, updated_at)
                    VALUES (?, ?, ?, ?, NOW())
                    ON CONFLICT (user_id, item_type, item_key)
                    DO UPDATE SET quantity = user_inventory.quantity + ?, updated_at = NOW()
                `, [userId, item.itemType, item.itemKey, item.quantity, item.quantity])
            }
        })
    },
}
