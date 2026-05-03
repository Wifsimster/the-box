import { createHash } from 'crypto'

/**
 * Pure helpers for the reactivation A/B cohort split. Extracted from the
 * worker so unit tests can import them without dragging the BullMQ /
 * Redis / socket singletons into the test process — the same hang we
 * hit on the leaderboard payout test (see leaderboard-payout-period.ts
 * for the lesson).
 */

// Holdout share, in [0, 100). 10 % of eligible users skip the chest grant
// but still receive the warm welcome-back email. Hash is on user_id only
// so a given user is permanently in one cohort across weeks.
export const HOLDOUT_PERCENT = 10

/**
 * Stable per-user 0-99 bucket. Hash is on user_id only — NOT user_id+week
 * — so a given user is always treatment OR always holdout for this
 * feature, regardless of when the worker fires.
 */
export function reactivationBucket(userId: string): number {
    const digest = createHash('sha256').update(userId).digest()
    // First 4 bytes as unsigned int, mod 100. 4 bytes is plenty of entropy
    // for a 100-bucket split and avoids BigInt for a uint64.
    const n = digest.readUInt32BE(0)
    return n % 100
}

export function isHoldoutUser(userId: string): boolean {
    return reactivationBucket(userId) < HOLDOUT_PERCENT
}
