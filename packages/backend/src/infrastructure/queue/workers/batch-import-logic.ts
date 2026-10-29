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
import { broadcastBatchImportProgress } from '../../socket/socket.js'
import type { ImportState, JobData } from '@the-box/types'
import { mergeGameAliases } from '../../../domain/services/game-aliases.service.js'

const log = queueLogger.child({ module: 'batch-import' })

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..', '..')
const UPLOADS_DIR = path.resolve(ROOT_DIR, '..', '..', 'uploads', 'screenshots')

export type BatchProgressCallback = (
  current: number,
  total: number,
  message: string,
  state: ImportState
) => void

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
  alternative_names?: string[]
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
      await sleep(1000 * Math.pow(2, attempt))
    }
  }
  return false
}

export async function startBatchImport(config: {
  batchSize?: number
  minMetacritic?: number
  screenshotsPerGame?: number
}): Promise<{ importState: ImportState; job: BullJob<JobData> }> {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) {
    throw new Error('RAWG_API_KEY environment variable is required')
  }

  const activeImport = await importStateRepository.findActive()
  if (activeImport) {
    throw new Error('An import is already in progress or paused')
  }

  const importState = await importStateRepository.create({
    batchSize: config.batchSize ?? 100,
    minMetacritic: config.minMetacritic ?? 70,
    screenshotsPerGame: config.screenshotsPerGame ?? 5,
  })

  const client = new RAWGBatchClient(apiKey)
  const totalGamesAvailable = await client.fetchTotalCount(importState.minMetacritic)
  const totalBatches = Math.ceil(totalGamesAvailable / importState.batchSize)

  await importStateRepository.update(importState.id, {
    totalGamesAvailable,
    totalBatchesEstimated: totalBatches,
    status: 'in_progress',
    startedAt: new Date(),
  })

  const updatedState = await importStateRepository.findById(importState.id)

  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info(`FULL IMPORT STARTED - ID: ${importState.id}`)
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info({
    importStateId: importState.id,
    totalGamesAvailable,
    totalBatches,
    batchSize: importState.batchSize,
    minMetacritic: importState.minMetacritic,
    screenshotsPerGame: importState.screenshotsPerGame,
  }, `Config: ${importState.batchSize} games/batch, Metacritic >= ${importState.minMetacritic}, ${importState.screenshotsPerGame} screenshots/game`)
  log.info(`Target: ${totalGamesAvailable.toLocaleString()} games across ${totalBatches} batches`)

  const job = await importQueue.add('batch-import-games', {
    importStateId: importState.id,
    batchSize: importState.batchSize,
    screenshotsPerGame: importState.screenshotsPerGame,
    minMetacritic: importState.minMetacritic,
  }, {
    priority: 1000,
  })

  return { importState: updatedState!, job }
}

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

  if (state.status === 'paused') {
    log.info('──────────────────────────────────────────────────────────────────────────')
    log.info(`IMPORT PAUSED - Skipping batch processing`)
    log.info('──────────────────────────────────────────────────────────────────────────')
    log.info({ importStateId, gamesProcessed: state.gamesProcessed }, 'Import is paused, waiting for resume')
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

  const batchNumber = state.currentBatch + 1
  const batchStartTime = Date.now()
  const totalGames = state.totalGamesAvailable || 0
  const progressPercent = totalGames > 0 ? ((state.gamesProcessed / totalGames) * 100).toFixed(1) : '0'

  log.info('──────────────────────────────────────────────────────────────────────────')
  log.info(`BATCH ${batchNumber}/${state.totalBatchesEstimated || '?'} STARTING`)
  log.info('──────────────────────────────────────────────────────────────────────────')
  log.info({
    importStateId,
    batch: `${batchNumber}/${state.totalBatchesEstimated || '?'}`,
    progress: `${progressPercent}%`,
    gamesProcessed: state.gamesProcessed,
    totalGames,
  }, `Progress: ${state.gamesProcessed.toLocaleString()}/${totalGames.toLocaleString()} games (${progressPercent}%)`)
  log.info(`Starting from page ${page}...`)

  await fs.mkdir(UPLOADS_DIR, { recursive: true })

  while (gamesInBatch < state.batchSize && hasMorePages) {
    const currentState = await importStateRepository.findById(importStateId)
    if (currentState?.status === 'paused') {
      log.info('──────────────────────────────────────────────────────────────────────────')
      log.info(`PAUSE SIGNAL RECEIVED - Saving progress and stopping batch`)
      log.info('──────────────────────────────────────────────────────────────────────────')
      log.info({ importStateId, page, gamesInBatch }, `Pausing at page ${page} after ${gamesInBatch} games in this batch`)
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

      const midState = await importStateRepository.findById(importStateId)
      if (midState?.status === 'paused') {
        log.info('──────────────────────────────────────────────────────────────────────────')
        log.info(`PAUSE SIGNAL RECEIVED during game processing`)
        log.info('──────────────────────────────────────────────────────────────────────────')
        log.info({ importStateId, gamesInBatch, imported: gamesImported, skipped: gamesSkipped }, 'Saving progress...')
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

      const gameIndex = state.gamesProcessed + gamesInBatch

      const existingGame = await gameRepository.findBySlug(rawGame.slug)
      if (existingGame) {
        gamesSkipped++
        log.info(`  [${gameIndex}/${totalGames}] SKIP "${rawGame.name}" (already exists)`)
        onProgress?.(
          state.gamesProcessed + gamesInBatch,
          state.totalGamesAvailable || 0,
          `Skipped: ${rawGame.name} (exists)`,
          state
        )
        continue
      }

      const screenshotResponse = await client.fetchGameScreenshots(rawGame.id)
      if (screenshotResponse.results.length === 0) {
        gamesSkipped++
        log.info(`  [${gameIndex}/${totalGames}] SKIP "${rawGame.name}" (no screenshots)`)
        continue
      }

      const details = await client.fetchGameDetails(rawGame.id)

      try {
        const game = await gameRepository.create({
          name: rawGame.name,
          slug: rawGame.slug,
          aliases: mergeGameAliases(rawGame.name, [], details.alternative_names ?? []),
          releaseYear: rawGame.released ? parseInt(rawGame.released.slice(0, 4)) : undefined,
          developer: details.developers?.[0]?.name,
          publisher: details.publishers?.[0]?.name,
          genres: rawGame.genres.map((g) => g.name),
          platforms: rawGame.platforms.map((p) => p.platform.name),
          coverImageUrl: rawGame.background_image ?? undefined,
          metacritic: details.metacritic,
        })

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
        log.info(`  [${gameIndex}/${totalGames}] ADD "${rawGame.name}" (+${screenshotsToAdd.length} screenshots) [batch: ${elapsed}, ETA: ${eta}]`)
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

      if (gamesInBatch % 10 === 0) {
        await importStateRepository.updateProgress(importStateId, {
          gamesProcessed: state.gamesProcessed + gamesInBatch,
          gamesImported: state.gamesImported + gamesImported,
          gamesSkipped: state.gamesSkipped + gamesSkipped,
          screenshotsDownloaded: state.screenshotsDownloaded + screenshotsDownloaded,
          failedCount: state.failedCount + failedCount,
          currentPage: page,
        })
        const elapsed = formatDuration(Date.now() - batchStartTime)
        const eta = calculateETA(gamesInBatch, state.batchSize, Date.now() - batchStartTime)
        log.info(`  -- Checkpoint: ${gamesInBatch}/${state.batchSize} games in batch (+${gamesImported} imported, ${gamesSkipped} skipped) [${elapsed} elapsed, ETA: ${eta}]`)
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

  const updatedState = await importStateRepository.findById(importStateId)
  if (updatedState) {
    const progress = Math.round(
      (updatedState.gamesProcessed / (updatedState.totalGamesAvailable || 1)) * 100
    )
    broadcastBatchImportProgress({
      importStateId: updatedState.id,
      progress,
      status: updatedState.status,
      message: `Batch ${updatedState.currentBatch}/${updatedState.totalBatchesEstimated || 0} completed`,
      current: updatedState.currentPage,
      gamesImported: updatedState.gamesImported,
      gamesSkipped: updatedState.gamesSkipped,
      screenshotsDownloaded: updatedState.screenshotsDownloaded,
      currentBatch: updatedState.currentBatch,
      totalGamesAvailable: updatedState.totalGamesAvailable || 0,
      totalBatches: updatedState.totalBatchesEstimated || 0,
    })
  }

  const totalProcessed = updatedState!.gamesProcessed
  const isComplete = !hasMorePages || totalProcessed >= (updatedState!.totalGamesAvailable || 0)

  log.info('──────────────────────────────────────────────────────────────────────────')
  log.info(`BATCH ${newCurrentBatch} COMPLETED in ${formatDuration(batchDuration)}`)
  log.info('──────────────────────────────────────────────────────────────────────────')
  log.info({
    batch: newCurrentBatch,
    duration: formatDuration(batchDuration),
    gamesInBatch,
    imported: gamesImported,
    skipped: gamesSkipped,
    failed: failedCount,
    screenshots: screenshotsDownloaded,
  }, `Summary: +${gamesImported} imported, ${gamesSkipped} skipped, ${failedCount} failed, ${screenshotsDownloaded} screenshots`)

  const totalProgress = updatedState!.totalGamesAvailable
    ? ((updatedState!.gamesProcessed / updatedState!.totalGamesAvailable) * 100).toFixed(1)
    : '?'
  log.info(`Overall: ${updatedState!.gamesProcessed.toLocaleString()}/${(updatedState!.totalGamesAvailable || 0).toLocaleString()} games (${totalProgress}%)`)

  if (isComplete) {
    await importStateRepository.setStatus(importStateId, 'completed')
    log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    log.info('FULL IMPORT COMPLETED')
    log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
    log.info({
      importStateId,
      totalProcessed: updatedState!.gamesProcessed,
      totalImported: updatedState!.gamesImported,
      totalSkipped: updatedState!.gamesSkipped,
      totalScreenshots: updatedState!.screenshotsDownloaded,
      totalFailed: updatedState!.failedCount,
    }, `Final: ${updatedState!.gamesImported} games imported, ${updatedState!.gamesSkipped} skipped, ${updatedState!.screenshotsDownloaded} screenshots`)
  } else {
    log.info(`Next batch (${newCurrentBatch + 1}) will be scheduled...`)
  }

  const finalState = await importStateRepository.findById(importStateId)
  return createResult(finalState!, false, isComplete)
}

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

  log.info(`Scheduling batch ${state.currentBatch + 1}/${state.totalBatchesEstimated || '?'}...`)

  const job = await importQueue.add('batch-import-games', {
    importStateId: state.id,
    batchSize: state.batchSize,
    screenshotsPerGame: state.screenshotsPerGame,
    minMetacritic: state.minMetacritic,
  }, {
    priority: 1000,
  })

  return job
}

export async function pauseImport(importStateId: number): Promise<ImportState> {
  const state = await importStateRepository.findById(importStateId)
  if (!state) {
    throw new Error(`Import state ${importStateId} not found`)
  }

  if (state.status !== 'in_progress') {
    throw new Error(`Cannot pause import with status: ${state.status}`)
  }

  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info(`IMPORT PAUSE REQUESTED`)
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info({
    importStateId,
    gamesProcessed: state.gamesProcessed,
    gamesImported: state.gamesImported,
    currentBatch: state.currentBatch,
  }, `Pausing at ${state.gamesProcessed} games (batch ${state.currentBatch})`)
  const updated = await importStateRepository.setStatus(importStateId, 'paused')
  return updated!
}

export async function resumeImport(importStateId: number): Promise<{ importState: ImportState; job: BullJob<JobData> }> {
  const state = await importStateRepository.findById(importStateId)
  if (!state) {
    throw new Error(`Import state ${importStateId} not found`)
  }

  if (state.status !== 'paused') {
    throw new Error(`Cannot resume import with status: ${state.status}`)
  }

  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info(`IMPORT RESUMED`)
  log.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')
  log.info({
    importStateId,
    currentPage: state.currentPage,
    gamesProcessed: state.gamesProcessed,
    currentBatch: state.currentBatch,
  }, `Resuming from page ${state.currentPage} (${state.gamesProcessed} games processed, batch ${state.currentBatch})`)
  const updated = await importStateRepository.setStatus(importStateId, 'in_progress')

  const job = await importQueue.add('batch-import-games', {
    importStateId: state.id,
    batchSize: state.batchSize,
    screenshotsPerGame: state.screenshotsPerGame,
    minMetacritic: state.minMetacritic,
    isResume: true,
  }, {
    priority: 1000,
  })

  return { importState: updated!, job }
}

export async function getActiveImport(): Promise<ImportState | null> {
  return importStateRepository.findActive()
}

export async function getImportState(id: number): Promise<ImportState | null> {
  return importStateRepository.findById(id)
}

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
