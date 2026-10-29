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

const log = queueLogger.child({ worker: 'webhook-delivery' })

const DELIVERY_TIMEOUT_MS = 10_000

const MAX_ATTEMPTS = 3

function classifyHttpStatus(status: number): 'success' | 'retryable' | 'permanent' {
  if (status >= 200 && status < 300) return 'success'
  if (status === 429 || (status >= 500 && status < 600)) return 'retryable'
  return 'permanent'
}

async function deliverOne(deliveryId: number): Promise<void> {
  const claimed = await webhookDeliveryRepository.markInProgress(deliveryId)
  if (!claimed) {
    log.debug({ deliveryId }, 'delivery not claimable — skipping')
    return
  }

  const delivery = await webhookDeliveryRepository.findById(deliveryId)
  if (!delivery) {
    log.warn({ deliveryId }, 'delivery row vanished after claim')
    return
  }
  const target = await db('webhooks')
    .where('id', delivery.webhook_id)
    .first<{ id: number; url: string; is_active: boolean; secret_enc: string | null }>()

  if (!target || !target.is_active) {
    await webhookDeliveryRepository.markFailed({
      id: deliveryId,
      status: null,
      error: 'webhook inactive',
      nextAttemptAt: null,
      isDead: true,
    })
    return
  }

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

  const secret = webhookRepository.decryptSecret(target)
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
      redirect: 'manual',
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
      throw new Error(`retryable http ${response.status}`)
    }
    return
  }

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
