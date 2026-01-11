/**
 * Sync Logic for fetching newest games from RAWG API
 *
 * This module handles the recurring sync job that:
 * - Fetches recently released games from RAWG API
 * - Checks if games already exist in the database
 * - Inserts new games and their screenshots
 * - Downloads screenshot images to local storage
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import { gameRepository } from '../../repositories/game.repository.js'
import { screenshotRepository } from '../../repositories/screenshot.repository.js'

const log = queueLogger.child({ module: 'sync-logic' })

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..', '..')
const UPLOADS_DIR = path.resolve(ROOT_DIR, '..', '..', 'uploads', 'screenshots')

// Progress callback type
export type ProgressCallback = (current: number, total: number, message: string) => void

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
export interface SyncResult {
  newGames: number
  screenshotsProcessed: number
  skipped: number
  failedCount: number
  message: string
}

// Rate Limiter (same as import-logic.ts)
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

// RAWG API Client for sync (fetches newest games)
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
        log.warn('rate limited by RAWG, waiting 60s')
        await sleep(60000)
        return this.fetch(endpoint, params)
      }
      throw new Error(`RAWG API error: ${response.status} ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  async fetchNewestGames(page: number, pageSize: number = 20): Promise<RAWGPaginatedResponse<RAWGGame>> {
    // Get today's date and 6 months ago for date range
    const today = new Date()
    const sixMonthsAgo = new Date()
    sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)

    const todayStr = today.toISOString().split('T')[0]
    const sixMonthsAgoStr = sixMonthsAgo.toISOString().split('T')[0]

    return this.fetch<RAWGPaginatedResponse<RAWGGame>>('/games', {
      page,
      page_size: pageSize,
      ordering: '-released', // Newest first
      dates: `${sixMonthsAgoStr},${todayStr}`, // Last 6 months
      metacritic: '60,100', // Quality filter (slightly lower than import for more games)
    })
  }

  async fetchGameDetails(id: number): Promise<RAWGGame> {
    return this.fetch<RAWGGame>(`/games/${id}`)
  }

  async fetchGameScreenshots(id: number): Promise<RAWGPaginatedResponse<RAWGScreenshot>> {
    return this.fetch<RAWGPaginatedResponse<RAWGScreenshot>>(`/games/${id}/screenshots`)
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
 * Main sync function - fetches newest games from RAWG and inserts to database
 */
export async function syncNewGamesFromRAWG(
  maxGames: number,
  screenshotsPerGame: number,
  onProgress?: ProgressCallback
): Promise<SyncResult> {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) {
    throw new Error('RAWG_API_KEY environment variable is required')
  }

  const client = new RAWGSyncClient(apiKey)
  let newGames = 0
  let screenshotsProcessed = 0
  let skipped = 0
  let failedCount = 0
  let page = 1
  let processedCount = 0

  log.info({ maxGames, screenshotsPerGame }, 'starting sync of newest games')

  while (newGames < maxGames) {
    onProgress?.(processedCount, maxGames, `Fetching page ${page}...`)

    const response = await client.fetchNewestGames(page)

    if (response.results.length === 0) {
      log.info('no more games from RAWG')
      break
    }

    for (const rawGame of response.results) {
      if (newGames >= maxGames) break
      processedCount++

      // Check if game already exists in database
      const existingGame = await gameRepository.findBySlug(rawGame.slug)
      if (existingGame) {
        log.debug({ slug: rawGame.slug }, 'game already exists, skipping')
        skipped++
        onProgress?.(processedCount, maxGames, `Skipped: ${rawGame.name} (exists)`)
        continue
      }

      // Fetch screenshots for this game
      const screenshotResponse = await client.fetchGameScreenshots(rawGame.id)
      if (screenshotResponse.results.length === 0) {
        log.debug({ slug: rawGame.slug }, 'no screenshots, skipping')
        skipped++
        continue
      }

      // Fetch detailed game info (for developers/publishers)
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
          metacritic: details.metacritic,
        })

        log.info({ gameId: game.id, name: game.name }, 'game inserted to database')

        // Process screenshots
        const screenshotsToAdd = screenshotResponse.results.slice(0, screenshotsPerGame)
        for (let i = 0; i < screenshotsToAdd.length; i++) {
          const rawScreenshot = screenshotsToAdd[i]!
          const filename = `screenshot_${i + 1}.jpg`
          const localPath = `/uploads/screenshots/${rawGame.slug}/${filename}`
          const absolutePath = path.join(UPLOADS_DIR, rawGame.slug, filename)

          // Distribute difficulty evenly
          const difficulty = ((i % 3) + 1) as 1 | 2 | 3

          // Download screenshot image
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

          screenshotsProcessed++
          await sleep(100) // Small delay between downloads
        }

        newGames++
        onProgress?.(processedCount, maxGames, `Added: ${rawGame.name}`)
        log.info({ name: rawGame.name, screenshots: screenshotsToAdd.length }, 'game synced')
      } catch (error) {
        log.error({ slug: rawGame.slug, error: String(error) }, 'failed to insert game')
        failedCount++
      }
    }

    if (!response.next) {
      log.info('reached end of RAWG results')
      break
    }
    page++
  }

  const result: SyncResult = {
    newGames,
    screenshotsProcessed,
    skipped,
    failedCount,
    message: `Synced ${newGames} new games with ${screenshotsProcessed} screenshots (${skipped} skipped, ${failedCount} failed)`,
  }

  log.info(result, 'sync complete')
  return result
}
