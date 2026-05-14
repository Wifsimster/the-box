import { Worker, Job as BullJob } from 'bullmq'
import { redisConnectionOptions } from '../connection.js'
import { db } from '../../database/connection.js'
import { queueLogger } from '../../logger/logger.js'
import type { WebhookDeliveryJobData } from '../queues.js'
import {
  webhookRepository,
  webhookDeliveryRepository,
} from '../../repositories/webhook.repository.js'
import {
  resolveWebhookUrlSafely,
  signWebhookBody,
} from '../../../domain/services/webhook-signer.service.js'
import { webhookSecretCache } from '../webhook-secret-cache.js'

const log = queueLogger.child({ worker: 'webhook-delivery' })

// One outbound HTTP call has a hard 10s ceiling — webhooks are not a place
// to wait on a slow third-party. Combined with the 3-attempt retry budget
// in queues.ts this caps the worst-case total time on a single delivery
// at ~30s of wall clock + the 15s exponential backoff between retries.
const DELIVERY_TIMEOUT_MS = 10_000

// Final attempt count (BullMQ retries + per-delivery in-DB retries) before
// we flip the row to `dead` and stop retrying. The row stays in the table
// for 24h so the dashboard can show "your last webhook failed".
const MAX_ATTEMPTS = 3

function classifyHttpStatus(status: number): 'success' | 'retryable' | 'permanent' {
  if (status >= 200 && status < 300) return 'success'
  // 429 + 5xx are server-side problems worth retrying.
  if (status === 429 || (status >= 500 && status < 600)) return 'retryable'
  // Everything else (4xx) is the receiver telling us this delivery will
  // never succeed — no point retrying.
  return 'permanent'
}

async function deliverOne(deliveryId: number): Promise<void> {
  const claimed = await webhookDeliveryRepository.markInProgress(deliveryId)
  if (!claimed) {
    // Another worker already picked this up, or it's no longer pending
    // (could be delivered, dead, or in_progress from a previous run that
    // crashed mid-flight). Trust the DB state and stop.
    log.debug({ deliveryId }, 'delivery not claimable — skipping')
    return
  }

  const delivery = await webhookDeliveryRepository.findById(deliveryId)
  if (!delivery) {
    log.warn({ deliveryId }, 'delivery row vanished after claim')
    return
  }
  // Direct lookup — ownership was enforced at registration / list / delete
  // endpoints, the worker just needs URL + active flag.
  const target = await db('webhooks')
    .where('id', delivery.webhook_id)
    .first<{ id: number; url: string; is_active: boolean }>()

  if (!target || !target.is_active) {
    // Webhook revoked between enqueue and delivery — mark dead, don't retry.
    await webhookDeliveryRepository.markFailed({
      id: deliveryId,
      status: null,
      error: 'webhook inactive',
      nextAttemptAt: null,
      isDead: true,
    })
    return
  }

  // SSRF re-check at delivery time. Defeats DNS rebinding.
  const resolved = await resolveWebhookUrlSafely(target.url)
  if (!resolved.ok) {
    await webhookDeliveryRepository.markFailed({
      id: deliveryId,
      status: null,
      error: `dns guard: ${resolved.code}`,
      nextAttemptAt: null,
      isDead: true,
    })
    return
  }

  // The signing secret isn't recoverable from the DB (we only stored its
  // hash). We pull it from the in-process cache populated at registration
  // time. If the cache misses (process restart between register and first
  // delivery), the receiver will reject the signature — that's a known
  // limitation we mitigate in M3 by storing an encrypted-at-rest secret.
  const secret = webhookSecretCache.get(target.id)
  const body = JSON.stringify(delivery.payload)
  const sig = secret
    ? signWebhookBody(secret, body)
    : { signature: 'unsigned', timestamp: Math.floor(Date.now() / 1000) }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS)
  let response: Response | null = null
  let networkError: string | null = null
  try {
    response = await fetch(target.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-TheBox-Event': delivery.event_type,
        'X-TheBox-Delivery': String(delivery.id),
        'X-TheBox-Event-Id': delivery.event_id,
        'X-TheBox-Signature': sig.signature,
        'User-Agent': 'TheBox-Webhooks/1 (+https://thebox.app/docs/public-api)',
      },
      body,
      signal: controller.signal,
      redirect: 'manual', // never follow redirects — SSRF bypass risk
    })
  } catch (err) {
    networkError = err instanceof Error ? err.message : String(err)
  } finally {
    clearTimeout(timer)
  }

  if (response) {
    const verdict = classifyHttpStatus(response.status)
    if (verdict === 'success') {
      await webhookDeliveryRepository.markDelivered(deliveryId, response.status)
      await webhookRepository.markDelivered(target.id)
      return
    }
    const isDead = verdict === 'permanent' || delivery.attempt_count + 1 >= MAX_ATTEMPTS
    await webhookDeliveryRepository.markFailed({
      id: deliveryId,
      status: response.status,
      error: `http ${response.status}`,
      nextAttemptAt: isDead ? null : new Date(Date.now() + retryDelay(delivery.attempt_count + 1)),
      isDead,
    })
    if (!isDead) {
      // BullMQ throw triggers the queue-level retry; combined with the DB
      // state we get a single coherent attempt count.
      throw new Error(`retryable http ${response.status}`)
    }
    return
  }

  // Network failure (timeout, DNS, ECONNREFUSED, …). Always retryable up
  // to MAX_ATTEMPTS.
  const isDead = delivery.attempt_count + 1 >= MAX_ATTEMPTS
  await webhookDeliveryRepository.markFailed({
    id: deliveryId,
    status: null,
    error: (networkError ?? 'unknown network error').slice(0, 500),
    nextAttemptAt: isDead ? null : new Date(Date.now() + retryDelay(delivery.attempt_count + 1)),
    isDead,
  })
  if (!isDead) {
    throw new Error(networkError ?? 'network error')
  }
}

function retryDelay(attempt: number): number {
  // 15s, 60s, 240s. Keeps the worst case bounded under 5 minutes wall clock.
  return 15_000 * 4 ** (attempt - 1)
}

export const webhookWorker = new Worker<WebhookDeliveryJobData>(
  'webhook-delivery',
  async (job: BullJob<WebhookDeliveryJobData>) => {
    if (job.data.kind !== 'deliver') {
      throw new Error(`unknown webhook job kind: ${(job.data as { kind: string }).kind}`)
    }
    await deliverOne(job.data.deliveryId)
  },
  {
    connection: redisConnectionOptions,
    concurrency: 8,
    lockDuration: 30_000,
    stalledInterval: 30_000,
  },
)

webhookWorker.on('failed', (job, error) => {
  log.warn(
    { jobId: job?.id, attemptsMade: job?.attemptsMade, error: String(error) },
    'webhook delivery failed',
  )
})

webhookWorker.on('error', (error) => {
  log.error({ error: String(error) }, 'webhook worker error')
})

log.info('webhook delivery worker initialized')
