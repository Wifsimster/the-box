/**
 * Import Logic for Job Workers
 *
 * Refactored from screenshot-fetcher.ts to support progress callbacks
 * and integration with BullMQ workers.
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import { env } from '../../../config/env.js'
import { queueLogger } from '../../logger/logger.js'
import { gameRepository } from '../../repositories/index.js'

const log = queueLogger

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..', '..', '..', '..')
const DATA_DIR = path.join(ROOT_DIR, 'data')
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

// Output data types
export interface GameData {
  rawg_id: number
  name: string
  slug: string
  aliases: string[]
  release_year: number | null
  developer: string | null
  publisher: string | null
  genres: string[]
  platforms: string[]
  cover_image_url: string | null
  screenshots: ScreenshotData[]
}

export interface ScreenshotData {
  game_slug: string
  image_url: string
  thumbnail_url: string | null
  original_url: string
  difficulty: 1 | 2 | 3
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
class RAWGClient {
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

// Main export functions

export async function fetchGamesFromRAWG(
  targetCount: number,
  screenshotsPerGame: number,
  minMetacritic: number = 70,
  onProgress?: ProgressCallback
): Promise<{ games: GameData[]; screenshots: ScreenshotData[]; skipped: number }> {
  const apiKey = env.RAWG_API_KEY
  if (!apiKey) {
    throw new Error('RAWG_API_KEY environment variable is required')
  }

  const client = new RAWGClient(apiKey)
  const games: GameData[] = []
  const screenshots: ScreenshotData[] = []
  let page = 1
  let screenshotIndex = 0
  let skipped = 0

  log.info({ targetCount, screenshotsPerGame, minMetacritic }, 'starting RAWG fetch')

  while (games.length < targetCount) {
    onProgress?.(games.length, targetCount, `Fetching page ${page}...`)

    const response = await client.fetchGames(page, 40, minMetacritic)

    for (const rawGame of response.results) {
      if (games.length >= targetCount) break

      // Check if game already exists in database
      const existingGame = await gameRepository.findBySlug(rawGame.slug)
      if (existingGame) {
        log.debug({ slug: rawGame.slug }, 'game already exists, skipping')
        onProgress?.(games.length, targetCount, `Skipped: ${rawGame.name} (exists)`)
        skipped++
        continue
      }

      // Fetch screenshots for this game
      const screenshotResponse = await client.fetchGameScreenshots(rawGame.id)

      if (screenshotResponse.results.length === 0) {
        continue // Skip games without screenshots
      }

      // Fetch detailed game info (for developers/publishers)
      const details = await client.fetchGameDetails(rawGame.id)

      const gameData: GameData = {
        rawg_id: rawGame.id,
        name: rawGame.name,
        slug: rawGame.slug,
        aliases: [],
        release_year: rawGame.released ? parseInt(rawGame.released.slice(0, 4)) : null,
        developer: details.developers?.[0]?.name ?? null,
        publisher: details.publishers?.[0]?.name ?? null,
        genres: rawGame.genres.map((g) => g.name),
        platforms: rawGame.platforms.map((p) => p.platform.name),
        cover_image_url: rawGame.background_image,
        screenshots: [],
      }

      // Add screenshots
      const screenshotsToAdd = screenshotResponse.results.slice(0, screenshotsPerGame)
      for (let i = 0; i < screenshotsToAdd.length; i++) {
        const rawScreenshot = screenshotsToAdd[i]!
        const filename = `screenshot_${i + 1}.jpg`
        const localPath = `/uploads/screenshots/${rawGame.slug}/${filename}`

        // Distribute difficulty evenly
        const difficulty = ((screenshotIndex % 3) + 1) as 1 | 2 | 3
        screenshotIndex++

        const screenshotData: ScreenshotData = {
          game_slug: rawGame.slug,
          image_url: localPath,
          thumbnail_url: null,
          original_url: rawScreenshot.image,
          difficulty,
        }

        gameData.screenshots.push(screenshotData)
        screenshots.push(screenshotData)
      }

      games.push(gameData)
      onProgress?.(games.length, targetCount, `Added: ${rawGame.name}`)
      log.debug({ game: rawGame.name, total: games.length }, 'game fetched')
    }

    if (!response.next) {
      log.info('reached end of RAWG results')
      break
    }
    page++
  }

  log.info({ gamesCount: games.length, screenshotsCount: screenshots.length, skipped }, 'RAWG fetch complete')
  return { games, screenshots, skipped }
}

export async function saveData(games: GameData[], screenshots: ScreenshotData[]): Promise<void> {
  await fs.mkdir(DATA_DIR, { recursive: true })

  // Save games.json (without screenshots array for cleaner seed data)
  const gamesForSeed = games.map((g) => ({
    name: g.name,
    slug: g.slug,
    aliases: g.aliases,
    release_year: g.release_year,
    developer: g.developer,
    publisher: g.publisher,
    genres: g.genres,
    platforms: g.platforms,
    cover_image_url: g.cover_image_url,
  }))

  await fs.writeFile(path.join(DATA_DIR, 'games.json'), JSON.stringify(gamesForSeed, null, 2))

  // Save screenshots.json
  await fs.writeFile(path.join(DATA_DIR, 'screenshots.json'), JSON.stringify(screenshots, null, 2))

  log.info({ dataDir: DATA_DIR }, 'data saved')
}

export async function downloadAllScreenshots(
  onProgress?: ProgressCallback
): Promise<{ downloaded: number; failed: number }> {
  const screenshotsPath = path.join(DATA_DIR, 'screenshots.json')

  let screenshots: ScreenshotData[]
  try {
    const data = await fs.readFile(screenshotsPath, 'utf-8')
    screenshots = JSON.parse(data) as ScreenshotData[]
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error('No screenshots.json found. Run import-games job first.')
    }
    throw error
  }

  log.info({ count: screenshots.length }, 'starting screenshot download')
  await fs.mkdir(UPLOADS_DIR, { recursive: true })

  let downloaded = 0
  let failed = 0

  for (let i = 0; i < screenshots.length; i++) {
    const screenshot = screenshots[i]!
    onProgress?.(i + 1, screenshots.length, `Downloading screenshot ${i + 1}/${screenshots.length}`)

    // Convert /uploads/screenshots/game-slug/file.jpg to absolute path
    const relativePath = screenshot.image_url.replace('/uploads/screenshots/', '')
    const outputPath = path.join(UPLOADS_DIR, relativePath)

    const success = await downloadImage(screenshot.original_url, outputPath)

    if (success) {
      downloaded++
    } else {
      failed++
    }

    // Small delay between downloads
    await sleep(100)
  }

  log.info({ downloaded, failed }, 'screenshot download complete')
  return { downloaded, failed }
}
