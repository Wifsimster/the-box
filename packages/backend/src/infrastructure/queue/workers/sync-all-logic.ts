/**
 * Sync All Games Logic
 *
 * This module handles syncing ALL games from RAWG API with:
 * - Finding missing games that meet the metacritic threshold
 * - Updating existing games with fresh metadata
 * - Batch processing with pause/resume capability
 * - Weekly recurring execution
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { Job as BullJob } from 'bullmq'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import { gameRepository } from '../../repositories/game.repository.js'
import { screenshotRepository } from '../../repositories/screenshot.repository.js'
import { importStateRepository } from '../../repositories/import-state.repository.js'
import { importQueue } from '../queues.js'
import type { ImportState, JobData } from '@the-box/types'

const log = queueLogger.child({ module: 'sync-all' })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..', '..')
const UPLOADS_DIR = path.resolve(ROOT_DIR, '..', '..', 'uploads', 'screenshots')

// Progress callback type
export type SyncAllProgressCallback = (
  current: number,
  total: number,
  message: string,
  state: ImportState
) => void

// RAWG API Types
interface RAWGGenre {
  id: number
  name: string
  slug: string
}

interface RAWGPlatform {
  platform: {
    id: number
    name: string
    slug: string
  }
}

interface RAWGDeveloper {
  id: number
  name: string
  slug: string
}

interface RAWGPublisher {
  id: number
  name: string
  slug: string
}

interface RAWGGame {
  id: number
  slug: string
  name: string
  released: string | null
  background_image: string | null
  developers?: RAWGDeveloper[]
  publishers?: RAWGPublisher[]
  genres: RAWGGenre[]
  platforms: RAWGPlatform[]
  screenshots_count?: number
  metacritic?: number
}

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

// Sync result type
export interface SyncAllResult {
  gamesProcessed: number
  gamesImported: number
  gamesUpdated: number
  gamesSkipped: number
  screenshotsDownloaded: number
  failedCount: number
  isPaused: boolean
  isComplete: boolean
  syncStateId: number
  currentBatch: number
  totalBatches: number | null
  totalGamesAvailable: number | null
}

// Timing utilities
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const seconds = Math.floor(ms / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = seconds % 60
  if (minutes < 60) return `${minutes}m ${remainingSeconds}s`
  const hours = Math.floor(minutes / 60)
  const remainingMinutes = minutes % 60
  return `${hours}h ${remainingMinutes}m`
}

function calculateETA(processed: number, total: number, elapsedMs: number): string {
  if (processed === 0) return 'calculating...'
  const avgTimePerGame = elapsedMs / processed
  const remainingGames = total - processed
  const remainingMs = avgTimePerGame * remainingGames
  return formatDuration(remainingMs)
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

// Rate Limiter
class RateLimiter {
  private requests: number[] = []
  private readonly windowMs = 60000
  private readonly maxRequests: number
  private readonly delayMs: number

  constructor(maxRequestsPerMinute: number = 20, delayMs: number = 3000) {
    this.maxRequests = maxRequestsPerMinute
    this.delayMs = delayMs
  }

  async acquire(): Promise<void> {
    const now = Date.now()
    this.requests = this.requests.filter((t) => now - t < this.windowMs)

    if (this.requests.length >= this.maxRequests) {
      const oldestRequest = this.requests[0]!
      const waitTime = this.windowMs - (now - oldestRequest) + 100
      log.warn(`  Rate limit reached, waiting ${formatDuration(waitTime)}...`)
      await sleep(waitTime)
    }

    if (this.requests.length > 0) {
      const lastRequest = this.requests[this.requests.length - 1]!
      const timeSinceLast = now - lastRequest
      if (timeSinceLast < this.delayMs) {
        await sleep(this.delayMs - timeSinceLast)
      }
    }

    this.requests.push(Date.now())
  }
}

// RAWG API Client
class RAWGSyncClient {
  private baseUrl = 'https://api.rawg.io/api'
  private apiKey: string
  private rateLimiter: RateLimiter

  constructor(apiKey: string) {
    this.apiKey = apiKey
    this.rateLimiter = new RateLimiter(20, 3000)
  }

  private async fetch<T>(endpoint: string, params: Record<string, string | number> = {}): Promise<T> {
    await this.rateLimiter.acquire()

    const url = new URL(`${this.baseUrl}${endpoint}`)
    url.searchParams.set('key', this.apiKey)

    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, String(value))
    }

    const response = await fetch(url.toString())

    if (!response.ok) {
      if (response.status === 429) {
        log.warn('  RAWG API rate limit (429), waiting 60s...')
        await sleep(60000)
        return this.fetch(endpoint, params)
      }
      throw new Error(`RAWG API error: ${response.status} ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  async fetchGames(page: number, pageSize: number = 40, minMetacritic: number = 70): Promise<RAWGPaginatedResponse<RAWGGame>> {
    return this.fetch<RAWGPaginatedResponse<RAWGGame>>('/games', {
      page,
      page_size: pageSize,
      ordering: '-rating',
      metacritic: `${minMetacritic},100`,
    })
  }

  async fetchGameDetails(id: number): Promise<RAWGGame> {
    return this.fetch<RAWGGame>(`/games/${id}`)
  }

  async fetchGameScreenshots(id: number): Promise<RAWGPaginatedResponse<RAWGScreenshot>> {
    return this.fetch<RAWGPaginatedResponse<RAWGScreenshot>>(`/games/${id}/screenshots`)
  }

  async fetchTotalCount(minMetacritic: number = 70): Promise<number> {
    const response = await this.fetch<RAWGPaginatedResponse<RAWGGame>>('/games', {
      page: 1,
      page_size: 1,
      metacritic: `${minMetacritic},100`,
    })
    return response.count
  }
}

async function downloadImage(url: string, outputPath: string, retries: number = 3): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }

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

/**
 * Configuration for sync-all-games job
 */
export interface SyncAllConfig {
  batchSize?: number
  minMetacritic?: number
  screenshotsPerGame?: number
  updateExistingMetadata?: boolean
}

/**
 * Start a new sync-all job
 */
export async function startSyncAll(config: SyncAllConfig): Promise<{ syncState: ImportState; job: BullJob<JobData> }> {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) {
    throw new Error('RAWG_API_KEY environment variable is required')
  }

  // Check for existing active sync
  const activeSync = await importStateRepository.findActiveByType('sync-all')
  if (activeSync) {
    throw new Error('A sync-all job is already in progress or paused')
  }

  // Create sync state
  const syncState = await importStateRepository.create({
    importType: 'sync-all',
    batchSize: config.batchSize ?? 100,
    minMetacritic: config.minMetacritic ?? 70,
    screenshotsPerGame: config.screenshotsPerGame ?? 3,
  })

  // Fetch total count from RAWG
  const client = new RAWGSyncClient(apiKey)
  const totalGamesAvailable = await client.fetchTotalCount(syncState.minMetacritic)
  const totalBatches = Math.ceil(totalGamesAvailable / syncState.batchSize)

  // Update sync state with totals
  await importStateRepository.update(syncState.id, {
    totalGamesAvailable,
    totalBatchesEstimated: totalBatches,
    status: 'in_progress',
    startedAt: new Date(),
  })

  const updatedState = await importStateRepository.findById(syncState.id)

  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info(`SYNC ALL GAMES STARTED - ID: ${syncState.id}`)
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info({
    syncStateId: syncState.id,
    totalGamesAvailable,
    totalBatches,
    batchSize: syncState.batchSize,
    minMetacritic: syncState.minMetacritic,
    screenshotsPerGame: syncState.screenshotsPerGame,
    updateExistingMetadata: config.updateExistingMetadata ?? true,
  }, `Config: ${syncState.batchSize} games/batch, Metacritic >= ${syncState.minMetacritic}`)
  log.info(`Target: ${totalGamesAvailable.toLocaleString()} games across ${totalBatches} batches`)

  // Create the first batch job with lowest priority (runs after all other tasks)
  const job = await importQueue.add('sync-all-games', {
    syncStateId: syncState.id,
    batchSize: syncState.batchSize,
    screenshotsPerGame: syncState.screenshotsPerGame,
    minMetacritic: syncState.minMetacritic,
    updateExistingMetadata: config.updateExistingMetadata ?? true,
  }, {
    priority: 1000, // Lowest priority - yields to all other tasks
  })

  return { syncState: updatedState!, job }
}

/**
 * Process a single batch for sync-all
 */
export async function processSyncAllBatch(
  syncStateId: number,
  updateExistingMetadata: boolean = true,
  onProgress?: SyncAllProgressCallback
): Promise<SyncAllResult> {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) {
    throw new Error('RAWG_API_KEY environment variable is required')
  }

  const state = await importStateRepository.findById(syncStateId)
  if (!state) {
    throw new Error(`Sync state ${syncStateId} not found`)
  }

  // Check if paused before starting
  if (state.status === 'paused') {
    log.info('──────────────────────────────────────────────────────────────────────────')
    log.info(`SYNC PAUSED - Skipping batch processing`)
    log.info('──────────────────────────────────────────────────────────────────────────')
    return createResult(state, 0, true, false)
  }

  const client = new RAWGSyncClient(apiKey)
  let gamesInBatch = 0
  let gamesImported = 0
  let gamesUpdated = 0
  let gamesSkipped = 0
  let screenshotsDownloaded = 0
  let failedCount = 0
  let page = state.currentPage
  let hasMorePages = true

  const batchNumber = state.currentBatch + 1
  const batchStartTime = Date.now()
  const totalGames = state.totalGamesAvailable || 0
  const progressPercent = totalGames > 0 ? ((state.gamesProcessed / totalGames) * 100).toFixed(1) : '0'

  log.info('──────────────────────────────────────────────────────────────────────────')
  log.info(`SYNC BATCH ${batchNumber}/${state.totalBatchesEstimated || '?'} STARTING`)
  log.info('──────────────────────────────────────────────────────────────────────────')
  log.info({
    syncStateId,
    batch: `${batchNumber}/${state.totalBatchesEstimated || '?'}`,
    progress: `${progressPercent}%`,
    gamesProcessed: state.gamesProcessed,
    totalGames,
  }, `Progress: ${state.gamesProcessed.toLocaleString()}/${totalGames.toLocaleString()} games (${progressPercent}%)`)
  log.info(`Starting from page ${page}...`)

  await fs.mkdir(UPLOADS_DIR, { recursive: true })

  while (gamesInBatch < state.batchSize && hasMorePages) {
    // Check for pause signal
    const currentState = await importStateRepository.findById(syncStateId)
    if (currentState?.status === 'paused') {
      log.info('PAUSE SIGNAL RECEIVED - Saving progress and stopping batch')
      await saveProgress(syncStateId, state, page, gamesInBatch, gamesImported, gamesUpdated, gamesSkipped, screenshotsDownloaded, failedCount)
      const finalState = await importStateRepository.findById(syncStateId)
      return createResult(finalState!, gamesUpdated, true, false)
    }

    log.info(`  Fetching page ${page} from RAWG API...`)
    onProgress?.(
      state.gamesProcessed + gamesInBatch,
      state.totalGamesAvailable || 0,
      `Fetching page ${page}...`,
      state
    )

    const response = await client.fetchGames(page, 40, state.minMetacritic)
    log.info(`  Page ${page}: ${response.results.length} games fetched`)

    for (const rawGame of response.results) {
      if (gamesInBatch >= state.batchSize) break

      // Check for pause signal during game processing
      const midState = await importStateRepository.findById(syncStateId)
      if (midState?.status === 'paused') {
        log.info('PAUSE SIGNAL RECEIVED during game processing')
        await saveProgress(syncStateId, state, page, gamesInBatch, gamesImported, gamesUpdated, gamesSkipped, screenshotsDownloaded, failedCount)
        const finalState = await importStateRepository.findById(syncStateId)
        return createResult(finalState!, gamesUpdated, true, false)
      }

      gamesInBatch++
      const gameIndex = state.gamesProcessed + gamesInBatch

      try {
        // Check if game already exists
        const existingGame = await gameRepository.findBySlug(rawGame.slug)

        if (existingGame) {
          // UPDATE existing game metadata
          if (updateExistingMetadata) {
            const details = await client.fetchGameDetails(rawGame.id)
            await gameRepository.updateFromRawg(existingGame.id, {
              name: rawGame.name,
              releaseYear: rawGame.released ? parseInt(rawGame.released.slice(0, 4)) : undefined,
              developer: details.developers?.[0]?.name,
              publisher: details.publishers?.[0]?.name,
              genres: rawGame.genres.map(g => g.name),
              platforms: rawGame.platforms.map(p => p.platform.name),
              coverImageUrl: rawGame.background_image ?? undefined,
              metacritic: details.metacritic,
              rawgId: rawGame.id,
              lastSyncedAt: new Date(),
            })
            gamesUpdated++
            const elapsed = formatDuration(Date.now() - batchStartTime)
            log.info(`  [${gameIndex}/${totalGames}] UPDATE "${rawGame.name}" [${elapsed}]`)
            onProgress?.(
              state.gamesProcessed + gamesInBatch,
              state.totalGamesAvailable || 0,
              `Updated: ${rawGame.name}`,
              state
            )
          } else {
            gamesSkipped++
            log.info(`  [${gameIndex}/${totalGames}] SKIP "${rawGame.name}" (exists, no update)`)
          }
          continue
        }

        // NEW GAME - Fetch screenshots first
        const screenshotResponse = await client.fetchGameScreenshots(rawGame.id)
        if (screenshotResponse.results.length === 0) {
          gamesSkipped++
          log.info(`  [${gameIndex}/${totalGames}] SKIP "${rawGame.name}" (no screenshots)`)
          continue
        }

        // Fetch detailed game info
        const details = await client.fetchGameDetails(rawGame.id)

        // Insert game to database
        const game = await gameRepository.create({
          name: rawGame.name,
          slug: rawGame.slug,
          aliases: [],
          releaseYear: rawGame.released ? parseInt(rawGame.released.slice(0, 4)) : undefined,
          developer: details.developers?.[0]?.name,
          publisher: details.publishers?.[0]?.name,
          genres: rawGame.genres.map(g => g.name),
          platforms: rawGame.platforms.map(p => p.platform.name),
          coverImageUrl: rawGame.background_image ?? undefined,
          metacritic: details.metacritic,
          rawgId: rawGame.id,
          lastSyncedAt: new Date().toISOString(),
        })

        // Process screenshots
        const screenshotsToAdd = screenshotResponse.results.slice(0, state.screenshotsPerGame)
        for (let i = 0; i < screenshotsToAdd.length; i++) {
          const rawScreenshot = screenshotsToAdd[i]!
          const filename = `screenshot_${i + 1}.jpg`
          const localPath = `/uploads/screenshots/${rawGame.slug}/${filename}`
          const absolutePath = path.join(UPLOADS_DIR, rawGame.slug, filename)

          const difficulty = ((i % 3) + 1) as 1 | 2 | 3

          const downloaded = await downloadImage(rawScreenshot.image, absolutePath)
          if (!downloaded) {
            failedCount++
            continue
          }

          await screenshotRepository.create({
            gameId: game.id,
            imageUrl: localPath,
            difficulty,
          })

          screenshotsDownloaded++
          await sleep(100)
        }

        gamesImported++
        const elapsed = formatDuration(Date.now() - batchStartTime)
        const eta = calculateETA(gamesInBatch, state.batchSize, Date.now() - batchStartTime)
        log.info(`  [${gameIndex}/${totalGames}] ADD "${rawGame.name}" (+${screenshotsToAdd.length} screenshots) [${elapsed}, ETA: ${eta}]`)
        onProgress?.(
          state.gamesProcessed + gamesInBatch,
          state.totalGamesAvailable || 0,
          `Added: ${rawGame.name}`,
          state
        )
      } catch (error) {
        failedCount++
        log.error(`  [${gameIndex}/${totalGames}] FAIL "${rawGame.slug}": ${String(error)}`)
      }

      // Update progress every 10 games
      if (gamesInBatch % 10 === 0) {
        await saveProgress(syncStateId, state, page, gamesInBatch, gamesImported, gamesUpdated, gamesSkipped, screenshotsDownloaded, failedCount)
        const elapsed = formatDuration(Date.now() - batchStartTime)
        const eta = calculateETA(gamesInBatch, state.batchSize, Date.now() - batchStartTime)
        log.info(`  -- Checkpoint: ${gamesInBatch}/${state.batchSize} (+${gamesImported} new, ${gamesUpdated} updated, ${gamesSkipped} skipped) [${elapsed}, ETA: ${eta}]`)
      }
    }

    if (!response.next) {
      hasMorePages = false
      log.info('  Reached end of RAWG results (no more pages)')
    } else {
      page++
    }
  }

  const batchDuration = Date.now() - batchStartTime

  // Update final progress for this batch
  const newCurrentBatch = state.currentBatch + 1
  await importStateRepository.updateProgress(syncStateId, {
    currentPage: page,
    gamesProcessed: state.gamesProcessed + gamesInBatch,
    gamesImported: state.gamesImported + gamesImported,
    gamesSkipped: state.gamesSkipped + gamesSkipped,
    screenshotsDownloaded: state.screenshotsDownloaded + screenshotsDownloaded,
    failedCount: state.failedCount + failedCount,
    currentBatch: newCurrentBatch,
  })

  // Check if sync is complete
  const updatedState = await importStateRepository.findById(syncStateId)
  const totalProcessed = updatedState!.gamesProcessed
  const isComplete = !hasMorePages || totalProcessed >= (updatedState!.totalGamesAvailable || 0)

  // Log batch summary
  log.info('──────────────────────────────────────────────────────────────────────────')
  log.info(`SYNC BATCH ${newCurrentBatch} COMPLETED in ${formatDuration(batchDuration)}`)
  log.info('──────────────────────────────────────────────────────────────────────────')
  log.info({
    batch: newCurrentBatch,
    duration: formatDuration(batchDuration),
    gamesInBatch,
    imported: gamesImported,
    updated: gamesUpdated,
    skipped: gamesSkipped,
    failed: failedCount,
    screenshots: screenshotsDownloaded,
  }, `Summary: +${gamesImported} new, ${gamesUpdated} updated, ${gamesSkipped} skipped, ${failedCount} failed`)

  if (isComplete) {
    await importStateRepository.setStatus(syncStateId, 'completed')
    log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    log.info('SYNC ALL GAMES COMPLETED')
    log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    log.info({
      syncStateId,
      totalProcessed: updatedState!.gamesProcessed,
      totalImported: updatedState!.gamesImported,
      totalSkipped: updatedState!.gamesSkipped,
      totalScreenshots: updatedState!.screenshotsDownloaded,
      totalFailed: updatedState!.failedCount,
    }, `Final: ${updatedState!.gamesImported} new games, ${updatedState!.gamesSkipped} skipped`)
  } else {
    log.info(`Next batch (${newCurrentBatch + 1}) will be scheduled...`)
  }

  const finalState = await importStateRepository.findById(syncStateId)
  return createResult(finalState!, gamesUpdated, false, isComplete)
}

/**
 * Schedule the next batch job
 */
export async function scheduleSyncAllNextBatch(syncStateId: number): Promise<BullJob<JobData> | null> {
  const state = await importStateRepository.findById(syncStateId)
  if (!state) {
    log.warn({ syncStateId }, 'sync state not found, cannot schedule next batch')
    return null
  }

  if (state.status !== 'in_progress') {
    log.info({ syncStateId, status: state.status }, 'sync not in progress, not scheduling next batch')
    return null
  }

  log.info(`Scheduling sync batch ${state.currentBatch + 1}/${state.totalBatchesEstimated || '?'}...`)

  const job = await importQueue.add('sync-all-games', {
    syncStateId: state.id,
    batchSize: state.batchSize,
    screenshotsPerGame: state.screenshotsPerGame,
    minMetacritic: state.minMetacritic,
    updateExistingMetadata: true,
  }, {
    priority: 1000, // Lowest priority - yields to all other tasks
  })

  return job
}

/**
 * Pause an ongoing sync
 */
export async function pauseSyncAll(syncStateId: number): Promise<ImportState> {
  const state = await importStateRepository.findById(syncStateId)
  if (!state) {
    throw new Error(`Sync state ${syncStateId} not found`)
  }

  if (state.status !== 'in_progress') {
    throw new Error(`Cannot pause sync with status: ${state.status}`)
  }

  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info(`SYNC PAUSE REQUESTED`)
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info({
    syncStateId,
    gamesProcessed: state.gamesProcessed,
    gamesImported: state.gamesImported,
    currentBatch: state.currentBatch,
  }, `Pausing at ${state.gamesProcessed} games (batch ${state.currentBatch})`)
  const updated = await importStateRepository.setStatus(syncStateId, 'paused')
  return updated!
}

/**
 * Resume a paused sync
 */
export async function resumeSyncAll(syncStateId: number): Promise<{ syncState: ImportState; job: BullJob<JobData> }> {
  const state = await importStateRepository.findById(syncStateId)
  if (!state) {
    throw new Error(`Sync state ${syncStateId} not found`)
  }

  if (state.status !== 'paused') {
    throw new Error(`Cannot resume sync with status: ${state.status}`)
  }

  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info(`SYNC RESUMED`)
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info({
    syncStateId,
    currentPage: state.currentPage,
    gamesProcessed: state.gamesProcessed,
    currentBatch: state.currentBatch,
  }, `Resuming from page ${state.currentPage} (${state.gamesProcessed} games processed)`)
  const updated = await importStateRepository.setStatus(syncStateId, 'in_progress')

  const job = await importQueue.add('sync-all-games', {
    syncStateId: state.id,
    batchSize: state.batchSize,
    screenshotsPerGame: state.screenshotsPerGame,
    minMetacritic: state.minMetacritic,
    updateExistingMetadata: true,
    isResume: true,
  }, {
    priority: 1000, // Lowest priority - yields to all other tasks
  })

  return { syncState: updated!, job }
}

/**
 * Cancel/abort a sync (marks as failed so a new one can be started)
 */
export async function cancelSyncAll(syncStateId: number): Promise<ImportState> {
  const state = await importStateRepository.findById(syncStateId)
  if (!state) {
    throw new Error(`Sync state ${syncStateId} not found`)
  }

  if (state.status === 'completed' || state.status === 'failed') {
    throw new Error(`Cannot cancel sync with status: ${state.status}`)
  }

  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info(`SYNC CANCELLED`)
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info({
    syncStateId,
    previousStatus: state.status,
    gamesProcessed: state.gamesProcessed,
    gamesImported: state.gamesImported,
    currentBatch: state.currentBatch,
  }, `Sync cancelled after ${state.gamesProcessed} games (batch ${state.currentBatch})`)

  const updated = await importStateRepository.setStatus(syncStateId, 'failed')
  return updated!
}

/**
 * Get current active sync
 */
export async function getActiveSyncAll(): Promise<ImportState | null> {
  return importStateRepository.findActiveByType('sync-all')
}

/**
 * Get sync state by ID
 */
export async function getSyncAllState(id: number): Promise<ImportState | null> {
  return importStateRepository.findById(id)
}

// Helper functions
async function saveProgress(
  syncStateId: number,
  state: ImportState,
  page: number,
  gamesInBatch: number,
  gamesImported: number,
  gamesUpdated: number,
  gamesSkipped: number,
  screenshotsDownloaded: number,
  failedCount: number
): Promise<void> {
  await importStateRepository.updateProgress(syncStateId, {
    currentPage: page,
    gamesProcessed: state.gamesProcessed + gamesInBatch,
    gamesImported: state.gamesImported + gamesImported,
    gamesSkipped: state.gamesSkipped + gamesSkipped + gamesUpdated, // Count updates as "skipped" for progress
    screenshotsDownloaded: state.screenshotsDownloaded + screenshotsDownloaded,
    failedCount: state.failedCount + failedCount,
  })
}

function createResult(state: ImportState, gamesUpdated: number, isPaused: boolean, isComplete: boolean): SyncAllResult {
  return {
    gamesProcessed: state.gamesProcessed,
    gamesImported: state.gamesImported,
    gamesUpdated,
    gamesSkipped: state.gamesSkipped,
    screenshotsDownloaded: state.screenshotsDownloaded,
    failedCount: state.failedCount,
    isPaused,
    isComplete,
    syncStateId: state.id,
    currentBatch: state.currentBatch,
    totalBatches: state.totalBatchesEstimated,
    totalGamesAvailable: state.totalGamesAvailable,
  }
}
