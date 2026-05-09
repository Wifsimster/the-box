import { pushSubscriptionRepository } from '../../repositories/push-subscription.repository.js'
import { queueLogger } from '../../logger/logger.js'

const log = queueLogger.child({ worker: 'prune-push-subscriptions' })

// Hard-delete subscriptions that the push provider declared dead (410/404,
// flipped to is_active=false by the fan-out worker) and that haven't seen a
// successful send in `STALE_AFTER_MS`. Without this, the table grows
// monotonically with churned browsers / reinstalls.
const STALE_AFTER_MS = 30 * 24 * 60 * 60_000 // 30 days

export interface PruneResult {
  deleted: number
  message: string
}

export async function prunePushSubscriptions(): Promise<PruneResult> {
  const deleted = await pushSubscriptionRepository.pruneStale(STALE_AFTER_MS)
  const message = `pruned ${deleted} stale push subscription(s) (>${STALE_AFTER_MS / 86_400_000}d inactive)`
  log.info({ deleted }, message)
  return { deleted, message }
}
