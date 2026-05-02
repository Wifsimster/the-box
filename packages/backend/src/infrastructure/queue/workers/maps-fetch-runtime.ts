import { randomUUID } from 'node:crypto'
import type {
  GeoIngestAttemptKind,
  GeoIngestOutcome,
  GeoSourceName,
} from '@the-box/types'
import { queueLogger } from '../../logger/logger.js'
import { db } from '../../database/connection.js'
import { geoIngestAttemptRepository } from '../../repositories/geo-ingest-attempt.repository.js'
import { geoSourceConfigRepository } from '../../repositories/geo-source-config.repository.js'
import { CircuitOpenError, runGuarded } from '../../redis/source-guard.js'
import { advancePipeline } from './maps-pipeline-logic.js'

const log = queueLogger.child({ worker: 'maps-fetch-runtime' })

export interface SourceIdentity {
  gameId: number
  steamAppId: number | null
  rawgId: number | null
  wikiSubdomain: string | null
  wikiPageTitle: string | null
  wikidataQid: string | null
  name: string
  slug: string
}

/**
 * Lookup source-identity fields for a game in one round trip. Each per-source
 * worker reads only the field(s) it needs but the SELECT is the same.
 */
export async function loadSourceIdentity(
  gameId: number,
): Promise<SourceIdentity | null> {
  const row = await db<Record<string, unknown>>('games')
    .where('id', gameId)
    .select(
      'id',
      'name',
      'slug',
      'steam_app_id',
      'rawg_id',
      'wiki_subdomain',
      'wiki_page_title',
      'wikidata_qid',
    )
    .first<{
      id: number
      name: string
      slug: string
      steam_app_id: number | null
      rawg_id: number | null
      wiki_subdomain: string | null
      wiki_page_title: string | null
      wikidata_qid: string | null
    }>()
  if (!row) return null
  return {
    gameId: row.id,
    name: row.name,
    slug: row.slug,
    steamAppId: row.steam_app_id ?? null,
    rawgId: row.rawg_id ?? null,
    wikiSubdomain: row.wiki_subdomain ?? null,
    wikiPageTitle: row.wiki_page_title ?? null,
    wikidataQid: row.wikidata_qid ?? null,
  }
}

export interface FetchOutcomeReport {
  outcome: GeoIngestOutcome
  itemsIngested?: number
  httpStatus?: number
  errorCode?: string
  errorDetail?: Record<string, unknown>
}

export interface RunSourceFetchInput {
  gameId: number
  source: GeoSourceName
  attemptKind: GeoIngestAttemptKind
  correlationId?: string
  /**
   * Token-bucket capacity. Defaults to `rateLimitPerMin / 60 + 1`.
   */
  rateCapacity?: number
  /**
   * Per-second refill. Defaults to `rateLimitPerMin / 60`.
   */
  rateRefillPerSec?: number
  /**
   * The actual fetch + persist work. Throws on transient failure (BullMQ
   * retries) or returns a domain outcome (e.g. not_found, empty) which is
   * recorded without retrying.
   */
  fetch: () => Promise<FetchOutcomeReport>
}

/**
 * Common shell for per-source fetchers: guard with rate limiter + circuit
 * breaker, time the call, log the attempt, advance the pipeline.
 *
 * Throwing inside `fetch` lets BullMQ retry (transient errors). Returning a
 * non-success `FetchOutcomeReport` records the outcome and advances without
 * retry — for permanent / domain failures.
 */
export async function runSourceFetch(
  input: RunSourceFetchInput,
): Promise<FetchOutcomeReport> {
  const correlationId = input.correlationId ?? randomUUID()
  const cfg = await geoSourceConfigRepository.findByName(input.source)
  const ratePerMin = cfg?.rateLimitPerMin ?? 30
  const refillPerSec = input.rateRefillPerSec ?? ratePerMin / 60
  const capacity = input.rateCapacity ?? Math.max(1, Math.ceil(refillPerSec))

  const startedAt = Date.now()
  let report: FetchOutcomeReport
  try {
    report = await runGuarded(
      {
        source: input.source,
        rateCapacity: capacity,
        rateRefillPerSec: refillPerSec,
      },
      input.fetch,
    )
  } catch (err) {
    if (err instanceof CircuitOpenError) {
      report = { outcome: 'circuit_open', errorCode: 'CIRCUIT_OPEN' }
    } else {
      report = transientErrorToReport(err)
      // Re-throw to let BullMQ retry transient errors.
      await recordAttempt(input, report, correlationId, Date.now() - startedAt)
      throw err
    }
  }

  await recordAttempt(input, report, correlationId, Date.now() - startedAt)

  // Always advance the pipeline so the orchestrator picks the next source.
  await advancePipeline({
    gameId: input.gameId,
    correlationId,
    delayMs: report.outcome === 'rate_limited' ? 5_000 : 200,
  })

  return report
}

async function recordAttempt(
  input: RunSourceFetchInput,
  report: FetchOutcomeReport,
  correlationId: string,
  latencyMs: number,
): Promise<void> {
  log.info(
    {
      gameId: input.gameId,
      source: input.source,
      outcome: report.outcome,
      items: report.itemsIngested ?? 0,
      latencyMs,
      correlationId,
    },
    'fetch attempt',
  )
  await geoIngestAttemptRepository.record({
    gameId: input.gameId,
    source: input.source,
    attemptKind: input.attemptKind,
    outcome: report.outcome,
    httpStatus: report.httpStatus,
    errorCode: report.errorCode,
    errorDetail: report.errorDetail,
    itemsIngested: report.itemsIngested ?? 0,
    latencyMs,
    correlationId,
  })
}

function transientErrorToReport(err: unknown): FetchOutcomeReport {
  if (!err || typeof err !== 'object') {
    return { outcome: 'parse_error', errorCode: 'UNKNOWN' }
  }
  const e = err as { status?: number; code?: string; message?: string }
  if (typeof e.status === 'number') {
    if (e.status === 429) {
      return { outcome: 'rate_limited', httpStatus: 429 }
    }
    if (e.status >= 500) {
      return { outcome: 'http_5xx', httpStatus: e.status }
    }
    if (e.status >= 400) {
      return { outcome: 'http_4xx', httpStatus: e.status }
    }
  }
  if (e.code === 'ETIMEDOUT' || e.code === 'EAI_AGAIN') {
    return { outcome: 'timeout', errorCode: e.code }
  }
  return { outcome: 'parse_error', errorCode: e.code ?? 'UNKNOWN', errorDetail: { message: e.message } }
}
