/**
 * Top-Up Screenshots Logic
 *
 * Adds missing screenshots to existing games whose active capture count is
 * below `targetScreenshotsPerGame`. Re-uses RAWG as the source and assumes the
 * existing per-game files are the leading slice of RAWG's screenshot list (the
 * convention enforced by every other importer in this repo). Pause/resume is
 * driven by `import_states.last_processed_offset`, which we use as the last
 * game id we walked past.
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { Job as BullJob } from 'bullmq'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import { db } from '../../database/connection.js'
import { screenshotRepository } from '../../repositories/screenshot.repository.js'
import { importStateRepository } from '../../repositories/import-state.repository.js'
import { importQueue } from '../queues.js'
import type { ImportState, JobData } from '@the-box/types'

const log = queueLogger.child({ module: 'topup-screenshots' })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..', '..')
const UPLOADS_DIR = path.resolve(ROOT_DIR, '..', '..', 'uploads', 'screenshots')

const IMPORT_TYPE = 'topup-screenshots'

// Lowest priority so we yield to user-facing imports / daily challenges
const TOPUP_JOB_PRIORITY = 1000

interface RAWGScreenshot {
  id: number
  image: string
  width: number
  height: number
}

interface RAWGPaginatedResponse<T> {
  count: number
  next: string | null
  previous: string | null
  results: T[]
}

export type TopupProgressCallback = (
  current: number,
  total: number,
  message: string,
  state: ImportState
) => void

export interface TopupResult {
  gamesProcessed: number
  gamesToppedUp: number
  gamesSkipped: number
  screenshotsDownloaded: number
  failedCount: number
  isPaused: boolean
  isComplete: boolean
  topupStateId: number
  currentBatch: number
  totalBatches: number | null
  totalGamesAvailable: number | null
}

export interface TopupConfig {
  batchSize?: number
  targetScreenshotsPerGame?: number
}

interface CandidateGame {
  id: number
  slug: string
  rawg_id: number
  active_count: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

class RateLimiter {
  private requests: number[] = []
  private readonly windowMs = 60_000
  private readonly maxRequests: number
  private readonly delayMs: number

  constructor(maxRequestsPerMinute = 20, delayMs = 3000) {
    this.maxRequests = maxRequestsPerMinute
    this.delayMs = delayMs
  }

  async acquire(): Promise<void> {
    const now = Date.now()
    this.requests = this.requests.filter((t) => now - t < this.windowMs)

    if (this.requests.length >= this.maxRequests) {
      const oldest = this.requests[0]!
      const wait = this.windowMs - (now - oldest) + 100
      log.warn(`  Rate limit reached, waiting ${Math.round(wait / 1000)}s...`)
      await sleep(wait)
    }

    if (this.requests.length > 0) {
      const last = this.requests[this.requests.length - 1]!
      const since = now - last
      if (since < this.delayMs) await sleep(this.delayMs - since)
    }

    this.requests.push(Date.now())
  }
}

class RAWGTopupClient {
  private baseUrl = 'https://api.rawg.io/api'
  private rateLimiter = new RateLimiter(20, 3000)
  constructor(private apiKey: string) {}

  async fetchGameScreenshots(rawgId: number): Promise<RAWGPaginatedResponse<RAWGScreenshot>> {
    await this.rateLimiter.acquire()
    const url = new URL(`${this.baseUrl}/games/${rawgId}/screenshots`)
    url.searchParams.set('key', this.apiKey)

    const response = await fetch(url.toString())
    if (!response.ok) {
      if (response.status === 429) {
        log.warn('  RAWG API rate limit (429), waiting 60s...')
        await sleep(60_000)
        return this.fetchGameScreenshots(rawgId)
      }
      throw new Error(`RAWG API error: ${response.status} ${response.statusText}`)
    }
    return response.json() as Promise<RAWGPaginatedResponse<RAWGScreenshot>>
  }
}

async function downloadImage(url: string, outputPath: string, retries = 3): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      await fs.mkdir(path.dirname(outputPath), { recursive: true })
      await fs.writeFile(outputPath, buffer)
      return true
    } catch (error) {
      if (attempt === retries - 1) {
        log.error({ url, error: String(error) }, 'failed to download image')
        return false
      }
      await sleep(1000 * Math.pow(2, attempt))
    }
  }
  return false
}

async function countCandidates(target: number): Promise<number> {
  const result = await db('games as g')
    .leftJoin('screenshots as s', function () {
      this.on('s.game_id', '=', 'g.id').andOn('s.is_active', '=', db.raw('true'))
    })
    .whereNotNull('g.rawg_id')
    .groupBy('g.id')
    .havingRaw('COUNT(s.id) < ?', [target])
    .count<{ count: string }[]>('g.id')

  // count() with groupBy returns one row per group, so total is rows.length
  return result.length
}

async function fetchCandidateBatch(
  target: number,
  limit: number,
  afterGameId: number
): Promise<CandidateGame[]> {
  const rows = await db('games as g')
    .leftJoin('screenshots as s', function () {
      this.on('s.game_id', '=', 'g.id').andOn('s.is_active', '=', db.raw('true'))
    })
    .whereNotNull('g.rawg_id')
    .andWhere('g.id', '>', afterGameId)
    .groupBy('g.id', 'g.slug', 'g.rawg_id')
    .havingRaw('COUNT(s.id) < ?', [target])
    .orderBy('g.id', 'asc')
    .limit(limit)
    .select<{ id: number; slug: string; rawg_id: number; active_count: string | number }[]>(
      'g.id',
      'g.slug',
      'g.rawg_id',
      db.raw('COUNT(s.id) as active_count')
    )

  return rows.map((r) => ({
    id: r.id,
    slug: r.slug,
    rawg_id: r.rawg_id,
    active_count: typeof r.active_count === 'string' ? parseInt(r.active_count, 10) : r.active_count,
  }))
}

export async function getActiveTopupScreenshots(): Promise<ImportState | null> {
  return importStateRepository.findActiveByType(IMPORT_TYPE)
}

export async function getTopupScreenshotsState(id: number): Promise<ImportState | null> {
  return importStateRepository.findById(id)
}

export async function startTopupScreenshots(
  config: TopupConfig
): Promise<{ topupState: ImportState; job: BullJob<JobData> }> {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) throw new Error('RAWG_API_KEY environment variable is required')

  const active = await getActiveTopupScreenshots()
  if (active) throw new Error('A topup-screenshots job is already in progress or paused')

  const target = config.targetScreenshotsPerGame ?? 5
  const batchSize = config.batchSize ?? 50

  const topupState = await importStateRepository.create({
    importType: IMPORT_TYPE,
    batchSize,
    screenshotsPerGame: target,
  })

  const totalGamesAvailable = await countCandidates(target)
  const totalBatches = Math.max(1, Math.ceil(totalGamesAvailable / batchSize))

  await importStateRepository.update(topupState.id, {
    totalGamesAvailable,
    totalBatchesEstimated: totalBatches,
    status: 'in_progress',
    startedAt: new Date(),
  })

  const updatedState = await importStateRepository.findById(topupState.id)

  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info(`TOPUP SCREENSHOTS STARTED - ID: ${topupState.id}`)
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info({
    topupStateId: topupState.id,
    targetScreenshotsPerGame: target,
    batchSize,
    totalGamesAvailable,
    totalBatches,
  }, `Target: ${target} screenshots/game, ${totalGamesAvailable} games need topup`)

  if (totalGamesAvailable === 0) {
    await importStateRepository.setStatus(topupState.id, 'completed')
    log.info('No games need topup; marking complete immediately')
  }

  const job = await importQueue.add(
    'topup-screenshots',
    {
      topupStateId: topupState.id,
      targetScreenshotsPerGame: target,
      batchSize,
    },
    { priority: TOPUP_JOB_PRIORITY }
  )

  return { topupState: updatedState!, job }
}

export async function scheduleTopupNextBatch(topupStateId: number): Promise<BullJob<JobData> | null> {
  const state = await importStateRepository.findById(topupStateId)
  if (!state) {
    log.warn({ topupStateId }, 'topup state not found, cannot schedule next batch')
    return null
  }
  if (state.status !== 'in_progress') {
    log.info({ topupStateId, status: state.status }, 'topup not in progress, not scheduling next batch')
    return null
  }

  return importQueue.add(
    'topup-screenshots',
    {
      topupStateId: state.id,
      targetScreenshotsPerGame: state.screenshotsPerGame,
      batchSize: state.batchSize,
    },
    { priority: TOPUP_JOB_PRIORITY }
  )
}

export async function pauseTopupScreenshots(topupStateId: number): Promise<ImportState> {
  const state = await importStateRepository.findById(topupStateId)
  if (!state) throw new Error(`Topup state ${topupStateId} not found`)
  if (state.status !== 'in_progress') {
    throw new Error(`Cannot pause topup with status: ${state.status}`)
  }
  log.info({ topupStateId, gamesProcessed: state.gamesProcessed }, 'topup pause requested')
  const updated = await importStateRepository.setStatus(topupStateId, 'paused')
  return updated!
}

export async function resumeTopupScreenshots(
  topupStateId: number
): Promise<{ topupState: ImportState; job: BullJob<JobData> }> {
  const state = await importStateRepository.findById(topupStateId)
  if (!state) throw new Error(`Topup state ${topupStateId} not found`)
  if (state.status !== 'paused') {
    throw new Error(`Cannot resume topup with status: ${state.status}`)
  }
  log.info({ topupStateId, gamesProcessed: state.gamesProcessed }, 'topup resume requested')
  const updated = await importStateRepository.setStatus(topupStateId, 'in_progress')

  const job = await importQueue.add(
    'topup-screenshots',
    {
      topupStateId: state.id,
      targetScreenshotsPerGame: state.screenshotsPerGame,
      batchSize: state.batchSize,
      isResume: true,
    },
    { priority: TOPUP_JOB_PRIORITY }
  )

  return { topupState: updated!, job }
}

export async function cancelTopupScreenshots(topupStateId: number): Promise<ImportState> {
  const state = await importStateRepository.findById(topupStateId)
  if (!state) throw new Error(`Topup state ${topupStateId} not found`)
  if (state.status === 'completed' || state.status === 'failed') {
    throw new Error(`Cannot cancel topup with status: ${state.status}`)
  }
  log.warn({ topupStateId }, 'topup cancelled by admin')
  const updated = await importStateRepository.setStatus(topupStateId, 'failed')
  return updated!
}

function buildResult(state: ImportState, isPaused: boolean, isComplete: boolean): TopupResult {
  return {
    gamesProcessed: state.gamesProcessed,
    gamesToppedUp: state.gamesImported, // reuse field for "games we touched"
    gamesSkipped: state.gamesSkipped,
    screenshotsDownloaded: state.screenshotsDownloaded,
    failedCount: state.failedCount,
    isPaused,
    isComplete,
    topupStateId: state.id,
    currentBatch: state.currentBatch,
    totalBatches: state.totalBatchesEstimated,
    totalGamesAvailable: state.totalGamesAvailable,
  }
}

export async function processTopupBatch(
  topupStateId: number,
  onProgress?: TopupProgressCallback
): Promise<TopupResult> {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) throw new Error('RAWG_API_KEY environment variable is required')

  const state = await importStateRepository.findById(topupStateId)
  if (!state) throw new Error(`Topup state ${topupStateId} not found`)

  if (state.status === 'paused') {
    log.info({ topupStateId }, 'topup paused, skipping batch')
    return buildResult(state, true, false)
  }

  const target = state.screenshotsPerGame
  const client = new RAWGTopupClient(apiKey)
  const afterGameId = state.lastProcessedOffset
  const candidates = await fetchCandidateBatch(target, state.batchSize, afterGameId)

  log.info('──────────────────────────────────────────────────────────────────────────')
  log.info(`TOPUP BATCH ${state.currentBatch + 1}/${state.totalBatchesEstimated ?? '?'} STARTING`)
  log.info('──────────────────────────────────────────────────────────────────────────')
  log.info({
    topupStateId,
    candidates: candidates.length,
    afterGameId,
    target,
  }, `Processing ${candidates.length} candidate games (after id ${afterGameId})`)

  if (candidates.length === 0) {
    await importStateRepository.setStatus(topupStateId, 'completed')
    const finalState = await importStateRepository.findById(topupStateId)
    log.info({ topupStateId }, 'no more candidate games, topup complete')
    return buildResult(finalState!, false, true)
  }

  await fs.mkdir(UPLOADS_DIR, { recursive: true })

  let gamesProcessed = 0
  let gamesToppedUp = 0
  let gamesSkipped = 0
  let screenshotsDownloaded = 0
  let failedCount = 0
  let lastGameId = afterGameId

  for (const candidate of candidates) {
    // Honor pause requests between games
    const mid = await importStateRepository.findById(topupStateId)
    if (mid?.status === 'paused') {
      log.info({ topupStateId, lastGameId }, 'topup pause signal received, stopping batch')
      break
    }

    gamesProcessed++
    lastGameId = candidate.id
    const needed = target - candidate.active_count

    try {
      const screenshotResp = await client.fetchGameScreenshots(candidate.rawg_id)
      const available = screenshotResp.results

      if (available.length <= candidate.active_count) {
        gamesSkipped++
        log.info(
          { gameId: candidate.id, slug: candidate.slug, available: available.length, current: candidate.active_count },
          'no new screenshots available on RAWG'
        )
        continue
      }

      // Trust the existing convention: existing files map to the leading
      // RAWG screenshots, so the new ones are the next slice.
      const toAdd = available.slice(candidate.active_count, candidate.active_count + needed)
      let addedForGame = 0

      for (let i = 0; i < toAdd.length; i++) {
        const raw = toAdd[i]!
        const positionNumber = candidate.active_count + i + 1
        const filename = `screenshot_${positionNumber}.jpg`
        const localPath = `/uploads/screenshots/${candidate.slug}/${filename}`
        const absolutePath = path.join(UPLOADS_DIR, candidate.slug, filename)

        const ok = await downloadImage(raw.image, absolutePath)
        if (!ok) {
          failedCount++
          continue
        }

        const difficulty = (((positionNumber - 1) % 3) + 1) as 1 | 2 | 3
        await screenshotRepository.create({
          gameId: candidate.id,
          imageUrl: localPath,
          difficulty,
        })

        screenshotsDownloaded++
        addedForGame++
        await sleep(100)
      }

      if (addedForGame > 0) {
        gamesToppedUp++
        log.info(
          { gameId: candidate.id, slug: candidate.slug, added: addedForGame },
          `topped up "${candidate.slug}" (+${addedForGame})`
        )
      } else {
        gamesSkipped++
      }
    } catch (error) {
      failedCount++
      log.error({ gameId: candidate.id, slug: candidate.slug, error: String(error) }, 'topup failed for game')
    }

    onProgress?.(
      state.gamesProcessed + gamesProcessed,
      state.totalGamesAvailable ?? 0,
      `Topped up: ${candidate.slug}`,
      state
    )
  }

  const newState = await importStateRepository.updateProgress(topupStateId, {
    lastProcessedOffset: lastGameId,
    gamesProcessed: state.gamesProcessed + gamesProcessed,
    gamesImported: state.gamesImported + gamesToppedUp,
    gamesSkipped: state.gamesSkipped + gamesSkipped,
    screenshotsDownloaded: state.screenshotsDownloaded + screenshotsDownloaded,
    failedCount: state.failedCount + failedCount,
    currentBatch: state.currentBatch + 1,
  })

  // Re-read to pick up status changes that may have happened during batch
  const refreshed = (await importStateRepository.findById(topupStateId))!

  if (refreshed.status === 'paused') {
    log.info({ topupStateId }, 'batch ended in paused state')
    return buildResult(refreshed, true, false)
  }

  // If the batch returned fewer rows than batchSize, we've hit the end
  const isComplete = candidates.length < state.batchSize
  if (isComplete) {
    await importStateRepository.setStatus(topupStateId, 'completed')
    const finalState = await importStateRepository.findById(topupStateId)
    log.info(
      {
        topupStateId,
        totalProcessed: finalState!.gamesProcessed,
        totalToppedUp: finalState!.gamesImported,
        totalScreenshots: finalState!.screenshotsDownloaded,
      },
      'topup-screenshots complete'
    )
    return buildResult(finalState!, false, true)
  }

  log.info(
    {
      batch: refreshed.currentBatch,
      gamesProcessed,
      gamesToppedUp,
      gamesSkipped,
      screenshotsDownloaded,
      failedCount,
    },
    'topup batch complete; will schedule next'
  )
  return buildResult(newState ?? refreshed, false, false)
}
