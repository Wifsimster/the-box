/**
 * Batch Import Logic for full RAWG database import
 *
 * This module handles importing ALL high-quality games from RAWG API with:
 * - Batch processing (configurable batch size, default 100 games)
 * - Pause/Resume capability
 * - Progress persistence to database
 * - Direct database insertion (no JSON intermediate)
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
import type { ImportState, ImportStatus, JobData, BatchImportProgressEvent } from '@the-box/types'

const log = queueLogger.child({ module: 'batch-import-logic' })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..', '..')
const UPLOADS_DIR = path.resolve(ROOT_DIR, '..', '..', 'uploads', 'screenshots')

// Progress callback type for batch imports
export type BatchProgressCallback = (
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

// Batch result type
export interface BatchResult {
  gamesProcessed: number
  gamesImported: number
  gamesSkipped: number
  screenshotsDownloaded: number
  failedCount: number
  isPaused: boolean
  isComplete: boolean
  importStateId: number
  currentBatch: number
  totalBatches: number | null
  totalGamesAvailable: number | null
}

// Rate Limiter
class RateLimiter {
  private requests: number[] = []
  private readonly windowMs = 60000 // 1 minute
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
      log.info({ waitTime }, 'rate limit reached, waiting')
      await sleep(waitTime)
    }

    // Add minimum delay between requests
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
class RAWGBatchClient {
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
        log.warn('rate limited by RAWG, waiting 60s')
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

// Utility functions
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
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
      await sleep(1000 * Math.pow(2, attempt)) // Exponential backoff
    }
  }
  return false
}

/**
 * Start a new full import
 */
export async function startBatchImport(config: {
  batchSize?: number
  minMetacritic?: number
  screenshotsPerGame?: number
}): Promise<{ importState: ImportState; job: BullJob<JobData> }> {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) {
    throw new Error('RAWG_API_KEY environment variable is required')
  }

  // Check for existing active import
  const activeImport = await importStateRepository.findActive()
  if (activeImport) {
    throw new Error('An import is already in progress or paused')
  }

  // Create import state
  const importState = await importStateRepository.create({
    batchSize: config.batchSize ?? 100,
    minMetacritic: config.minMetacritic ?? 70,
    screenshotsPerGame: config.screenshotsPerGame ?? 3,
  })

  // Fetch total count from RAWG
  const client = new RAWGBatchClient(apiKey)
  const totalGamesAvailable = await client.fetchTotalCount(importState.minMetacritic)
  const totalBatches = Math.ceil(totalGamesAvailable / importState.batchSize)

  // Update import state with totals
  await importStateRepository.update(importState.id, {
    totalGamesAvailable,
    totalBatchesEstimated: totalBatches,
    status: 'in_progress',
    startedAt: new Date(),
  })

  const updatedState = await importStateRepository.findById(importState.id)

  log.info({
    importStateId: importState.id,
    totalGamesAvailable,
    totalBatches,
    batchSize: importState.batchSize,
  }, 'starting batch import')

  // Create the first batch job
  const job = await importQueue.add('batch-import-games', {
    importStateId: importState.id,
    batchSize: importState.batchSize,
    screenshotsPerGame: importState.screenshotsPerGame,
    minMetacritic: importState.minMetacritic,
  })

  return { importState: updatedState!, job }
}

/**
 * Process a single batch of games
 */
export async function processBatch(
  importStateId: number,
  onProgress?: BatchProgressCallback
): Promise<BatchResult> {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) {
    throw new Error('RAWG_API_KEY environment variable is required')
  }

  const state = await importStateRepository.findById(importStateId)
  if (!state) {
    throw new Error(`Import state ${importStateId} not found`)
  }

  // Check if paused before starting
  if (state.status === 'paused') {
    log.info({ importStateId }, 'import is paused, not processing')
    return createResult(state, true, false)
  }

  const client = new RAWGBatchClient(apiKey)
  let gamesInBatch = 0
  let gamesImported = 0
  let gamesSkipped = 0
  let screenshotsDownloaded = 0
  let failedCount = 0
  let page = state.currentPage
  let hasMorePages = true

  log.info({
    importStateId,
    currentPage: page,
    batchSize: state.batchSize,
    currentBatch: state.currentBatch + 1,
  }, 'processing batch')

  await fs.mkdir(UPLOADS_DIR, { recursive: true })

  while (gamesInBatch < state.batchSize && hasMorePages) {
    // Check for pause signal
    const currentState = await importStateRepository.findById(importStateId)
    if (currentState?.status === 'paused') {
      log.info({ importStateId, page }, 'pause signal received, stopping batch')
      await importStateRepository.updateProgress(importStateId, {
        currentPage: page,
        gamesProcessed: state.gamesProcessed + gamesInBatch,
        gamesImported: state.gamesImported + gamesImported,
        gamesSkipped: state.gamesSkipped + gamesSkipped,
        screenshotsDownloaded: state.screenshotsDownloaded + screenshotsDownloaded,
        failedCount: state.failedCount + failedCount,
      })
      const finalState = await importStateRepository.findById(importStateId)
      return createResult(finalState!, true, false)
    }

    onProgress?.(
      state.gamesProcessed + gamesInBatch,
      state.totalGamesAvailable || 0,
      `Fetching page ${page}...`,
      state
    )

    const response = await client.fetchGames(page, 40, state.minMetacritic)

    for (const rawGame of response.results) {
      if (gamesInBatch >= state.batchSize) break

      // Check for pause signal during game processing
      const midState = await importStateRepository.findById(importStateId)
      if (midState?.status === 'paused') {
        log.info({ importStateId }, 'pause signal during game processing')
        await importStateRepository.updateProgress(importStateId, {
          currentPage: page,
          gamesProcessed: state.gamesProcessed + gamesInBatch,
          gamesImported: state.gamesImported + gamesImported,
          gamesSkipped: state.gamesSkipped + gamesSkipped,
          screenshotsDownloaded: state.screenshotsDownloaded + screenshotsDownloaded,
          failedCount: state.failedCount + failedCount,
        })
        const finalState = await importStateRepository.findById(importStateId)
        return createResult(finalState!, true, false)
      }

      gamesInBatch++

      // Check if game already exists
      const existingGame = await gameRepository.findBySlug(rawGame.slug)
      if (existingGame) {
        log.debug({ slug: rawGame.slug }, 'game already exists, skipping')
        gamesSkipped++
        onProgress?.(
          state.gamesProcessed + gamesInBatch,
          state.totalGamesAvailable || 0,
          `Skipped: ${rawGame.name} (exists)`,
          state
        )
        continue
      }

      // Fetch screenshots
      const screenshotResponse = await client.fetchGameScreenshots(rawGame.id)
      if (screenshotResponse.results.length === 0) {
        log.debug({ slug: rawGame.slug }, 'no screenshots, skipping')
        gamesSkipped++
        continue
      }

      // Fetch detailed game info
      const details = await client.fetchGameDetails(rawGame.id)

      try {
        // Insert game to database
        const game = await gameRepository.create({
          name: rawGame.name,
          slug: rawGame.slug,
          aliases: [],
          releaseYear: rawGame.released ? parseInt(rawGame.released.slice(0, 4)) : undefined,
          developer: details.developers?.[0]?.name,
          publisher: details.publishers?.[0]?.name,
          genres: rawGame.genres.map((g) => g.name),
          platforms: rawGame.platforms.map((p) => p.platform.name),
          coverImageUrl: rawGame.background_image ?? undefined,
        })

        // Process screenshots
        const screenshotsToAdd = screenshotResponse.results.slice(0, state.screenshotsPerGame)
        for (let i = 0; i < screenshotsToAdd.length; i++) {
          const rawScreenshot = screenshotsToAdd[i]!
          const filename = `screenshot_${i + 1}.jpg`
          const localPath = `/uploads/screenshots/${rawGame.slug}/${filename}`
          const absolutePath = path.join(UPLOADS_DIR, rawGame.slug, filename)

          // Distribute difficulty evenly
          const difficulty = ((i % 3) + 1) as 1 | 2 | 3

          // Download screenshot
          const downloaded = await downloadImage(rawScreenshot.image, absolutePath)
          if (!downloaded) {
            failedCount++
            continue
          }

          // Insert screenshot to database
          await screenshotRepository.create({
            gameId: game.id,
            imageUrl: localPath,
            difficulty,
          })

          screenshotsDownloaded++
          await sleep(100) // Small delay between downloads
        }

        gamesImported++
        onProgress?.(
          state.gamesProcessed + gamesInBatch,
          state.totalGamesAvailable || 0,
          `Added: ${rawGame.name}`,
          state
        )
        log.debug({ name: rawGame.name, screenshots: screenshotsToAdd.length }, 'game imported')
      } catch (error) {
        log.error({ slug: rawGame.slug, error: String(error) }, 'failed to import game')
        failedCount++
      }

      // Update progress every 10 games
      if (gamesInBatch % 10 === 0) {
        await importStateRepository.updateProgress(importStateId, {
          gamesProcessed: state.gamesProcessed + gamesInBatch,
          gamesImported: state.gamesImported + gamesImported,
          gamesSkipped: state.gamesSkipped + gamesSkipped,
          screenshotsDownloaded: state.screenshotsDownloaded + screenshotsDownloaded,
          failedCount: state.failedCount + failedCount,
          currentPage: page,
        })
      }
    }

    if (!response.next) {
      hasMorePages = false
      log.info('reached end of RAWG results')
    } else {
      page++
    }
  }

  // Update final progress for this batch
  const newCurrentBatch = state.currentBatch + 1
  await importStateRepository.updateProgress(importStateId, {
    currentPage: page,
    gamesProcessed: state.gamesProcessed + gamesInBatch,
    gamesImported: state.gamesImported + gamesImported,
    gamesSkipped: state.gamesSkipped + gamesSkipped,
    screenshotsDownloaded: state.screenshotsDownloaded + screenshotsDownloaded,
    failedCount: state.failedCount + failedCount,
    currentBatch: newCurrentBatch,
  })

  // Check if import is complete
  const updatedState = await importStateRepository.findById(importStateId)
  const totalProcessed = updatedState!.gamesProcessed
  const isComplete = !hasMorePages || totalProcessed >= (updatedState!.totalGamesAvailable || 0)

  if (isComplete) {
    await importStateRepository.setStatus(importStateId, 'completed')
    log.info({ importStateId, totalProcessed }, 'batch import complete')
  }

  const finalState = await importStateRepository.findById(importStateId)
  return createResult(finalState!, false, isComplete)
}

/**
 * Schedule the next batch job
 */
export async function scheduleNextBatch(importStateId: number): Promise<BullJob<JobData> | null> {
  const state = await importStateRepository.findById(importStateId)
  if (!state) {
    log.warn({ importStateId }, 'import state not found, cannot schedule next batch')
    return null
  }

  if (state.status !== 'in_progress') {
    log.info({ importStateId, status: state.status }, 'import not in progress, not scheduling next batch')
    return null
  }

  log.info({ importStateId, nextBatch: state.currentBatch + 1 }, 'scheduling next batch')

  const job = await importQueue.add('batch-import-games', {
    importStateId: state.id,
    batchSize: state.batchSize,
    screenshotsPerGame: state.screenshotsPerGame,
    minMetacritic: state.minMetacritic,
  })

  return job
}

/**
 * Pause an ongoing import
 */
export async function pauseImport(importStateId: number): Promise<ImportState> {
  const state = await importStateRepository.findById(importStateId)
  if (!state) {
    throw new Error(`Import state ${importStateId} not found`)
  }

  if (state.status !== 'in_progress') {
    throw new Error(`Cannot pause import with status: ${state.status}`)
  }

  log.info({ importStateId }, 'pausing import')
  const updated = await importStateRepository.setStatus(importStateId, 'paused')
  return updated!
}

/**
 * Resume a paused import
 */
export async function resumeImport(importStateId: number): Promise<{ importState: ImportState; job: BullJob<JobData> }> {
  const state = await importStateRepository.findById(importStateId)
  if (!state) {
    throw new Error(`Import state ${importStateId} not found`)
  }

  if (state.status !== 'paused') {
    throw new Error(`Cannot resume import with status: ${state.status}`)
  }

  log.info({ importStateId, currentPage: state.currentPage }, 'resuming import')
  const updated = await importStateRepository.setStatus(importStateId, 'in_progress')

  // Create a new batch job
  const job = await importQueue.add('batch-import-games', {
    importStateId: state.id,
    batchSize: state.batchSize,
    screenshotsPerGame: state.screenshotsPerGame,
    minMetacritic: state.minMetacritic,
    isResume: true,
  })

  return { importState: updated!, job }
}

/**
 * Get current active import
 */
export async function getActiveImport(): Promise<ImportState | null> {
  return importStateRepository.findActive()
}

/**
 * Get import state by ID
 */
export async function getImportState(id: number): Promise<ImportState | null> {
  return importStateRepository.findById(id)
}

// Helper function to create result object
function createResult(state: ImportState, isPaused: boolean, isComplete: boolean): BatchResult {
  return {
    gamesProcessed: state.gamesProcessed,
    gamesImported: state.gamesImported,
    gamesSkipped: state.gamesSkipped,
    screenshotsDownloaded: state.screenshotsDownloaded,
    failedCount: state.failedCount,
    isPaused,
    isComplete,
    importStateId: state.id,
    currentBatch: state.currentBatch,
    totalBatches: state.totalBatchesEstimated,
    totalGamesAvailable: state.totalGamesAvailable,
  }
}
