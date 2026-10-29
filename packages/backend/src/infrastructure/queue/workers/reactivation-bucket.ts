import { createHash } from 'crypto'

export const HOLDOUT_PERCENT = 10

export function reactivationBucket(userId: string): number {
    const digest = createHash('sha256').update(userId).digest()
    const n = digest.readUInt32BE(0)
    return n % 100
}

export function isHoldoutUser(userId: string): boolean {
    return reactivationBucket(userId) < HOLDOUT_PERCENT
}
