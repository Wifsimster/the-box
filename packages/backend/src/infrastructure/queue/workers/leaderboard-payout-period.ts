/**
 * Pure helpers for the monthly leaderboard payout. Extracted from the
 * worker so the unit tests can import them without dragging the BullMQ
 * queues + socket initialization into the test process — which was
 * causing `node --test` to hang on file teardown waiting for those
 * singletons to close.
 */

const FRAME_KEY_PREFIX = 'frame_top100'

/**
 * Compute the prior calendar month for the date `now` (UTC). Returns
 * `{ year, month, label }` where `month` is 1-indexed and `label` is the
 * canonical `YYYY-MM` string used in source_refs and item keys.
 */
export function priorMonthLabel(now: Date = new Date()): {
    year: number
    month: number
    label: string
} {
    const y = now.getUTCFullYear()
    const m = now.getUTCMonth() // 0-indexed
    const priorYear = m === 0 ? y - 1 : y
    const priorMonth = m === 0 ? 12 : m
    const label = `${priorYear}-${String(priorMonth).padStart(2, '0')}`
    return { year: priorYear, month: priorMonth, label }
}

/**
 * Build the canonical item_key for a given period. Underscored format
 * (`frame_top100_2026_05`) keeps it ASCII-safe for the `user_inventory`
 * `item_key` column without allocating a new id space.
 */
export function frameItemKey(label: string): string {
    return `${FRAME_KEY_PREFIX}_${label.replace('-', '_')}`
}
