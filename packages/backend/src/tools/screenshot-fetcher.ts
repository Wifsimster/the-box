/**
 * Screenshot Fetcher CLI Tool
 *
 * Fetches game data and screenshots from RAWG API
 * and saves them locally for seeding the database.
 *
 * Usage:
 *   npx tsx src/tools/screenshot-fetcher.ts fetch --games 200 --screenshots-per-game 3
 *   npx tsx src/tools/screenshot-fetcher.ts download
 *   npx tsx src/tools/screenshot-fetcher.ts all --games 200 --screenshots-per-game 3
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'
import dotenv from 'dotenv'

// Load environment variables
dotenv.config()

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..', '..')
const DATA_DIR = path.join(ROOT_DIR, 'data')
const UPLOADS_DIR = path.resolve(ROOT_DIR, '..', '..', 'uploads', 'screenshots')

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
interface GameData {
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

interface ScreenshotData {
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
      console.log(`Rate limit reached. Waiting ${Math.round(waitTime / 1000)}s...`)
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
        console.log('Rate limited by RAWG. Waiting 60s...')
        await sleep(60000)
        return this.fetch(endpoint, params)
      }
      throw new Error(`RAWG API error: ${response.status} ${response.statusText}`)
    }

    return response.json() as Promise<T>
  }

  async fetchGames(page: number, pageSize: number = 40): Promise<RAWGPaginatedResponse<RAWGGame>> {
    return this.fetch<RAWGPaginatedResponse<RAWGGame>>('/games', {
      page,
      page_size: pageSize,
      ordering: '-rating',
      metacritic: '70,100', // Only well-rated games
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

function showProgress(current: number, total: number, message: string): void {
  const percentage = Math.round((current / total) * 100)
  const bar = '='.repeat(Math.round(percentage / 2)) + ' '.repeat(50 - Math.round(percentage / 2))
  process.stdout.write(`\r[${bar}] ${percentage}% (${current}/${total}) ${message}`)
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
        console.error(`\nFailed to download ${url}: ${error}`)
        return false
      }
      await sleep(1000 * Math.pow(2, attempt)) // Exponential backoff
    }
  }
  return false
}

// Main functions
async function fetchGamesFromRAWG(
  targetCount: number,
  screenshotsPerGame: number
): Promise<{ games: GameData[]; screenshots: ScreenshotData[] }> {
  const apiKey = process.env['RAWG_API_KEY']
  if (!apiKey) {
    throw new Error('RAWG_API_KEY environment variable is required')
  }

  const client = new RAWGClient(apiKey)
  const games: GameData[] = []
  const screenshots: ScreenshotData[] = []
  let page = 1
  let screenshotIndex = 0

  console.log(`Fetching ${targetCount} games from RAWG API...`)

  while (games.length < targetCount) {
    showProgress(games.length, targetCount, `Fetching page ${page}...`)

    const response = await client.fetchGames(page)

    for (const rawGame of response.results) {
      if (games.length >= targetCount) break

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
      showProgress(games.length, targetCount, `Added: ${rawGame.name}`)
    }

    if (!response.next) {
      console.log('\nReached end of RAWG results')
      break
    }
    page++
  }

  console.log(`\nFetched ${games.length} games with ${screenshots.length} screenshots`)
  return { games, screenshots }
}

async function saveData(games: GameData[], screenshots: ScreenshotData[]): Promise<void> {
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

  console.log(`Saved data to ${DATA_DIR}`)
}

async function downloadAllScreenshots(): Promise<void> {
  const screenshotsPath = path.join(DATA_DIR, 'screenshots.json')

  try {
    const data = await fs.readFile(screenshotsPath, 'utf-8')
    const screenshots: ScreenshotData[] = JSON.parse(data)

    console.log(`Downloading ${screenshots.length} screenshots...`)
    await fs.mkdir(UPLOADS_DIR, { recursive: true })

    let downloaded = 0
    let failed = 0

    for (let i = 0; i < screenshots.length; i++) {
      const screenshot = screenshots[i]!
      showProgress(i + 1, screenshots.length, `Downloading...`)

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

    console.log(`\nDownloaded ${downloaded} screenshots, ${failed} failed`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      console.error('No screenshots.json found. Run "fetch" command first.')
    } else {
      throw error
    }
  }
}

// CLI
async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0]

  // Parse flags
  const flags: Record<string, string> = {}
  for (let i = 1; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, '')
    const value = args[i + 1]
    if (key && value) {
      flags[key] = value
    }
  }

  const targetGames = parseInt(flags['games'] || '200')
  const screenshotsPerGame = parseInt(flags['screenshots-per-game'] || '3')

  switch (command) {
    case 'fetch': {
      console.log(`\nFetching ${targetGames} games with ${screenshotsPerGame} screenshots each...`)
      const { games, screenshots } = await fetchGamesFromRAWG(targetGames, screenshotsPerGame)
      await saveData(games, screenshots)
      break
    }

    case 'download': {
      console.log('\nDownloading screenshots...')
      await downloadAllScreenshots()
      break
    }

    case 'all': {
      console.log(`\nRunning full pipeline: ${targetGames} games, ${screenshotsPerGame} screenshots each...`)
      const { games, screenshots } = await fetchGamesFromRAWG(targetGames, screenshotsPerGame)
      await saveData(games, screenshots)
      console.log('\nStarting downloads...')
      await downloadAllScreenshots()
      break
    }

    default:
      console.log(`
Screenshot Fetcher CLI

Usage:
  npx tsx src/tools/screenshot-fetcher.ts <command> [options]

Commands:
  fetch     Fetch game data and screenshots from RAWG API
  download  Download screenshots to local storage
  all       Run fetch + download

Options:
  --games <number>               Number of games to fetch (default: 200)
  --screenshots-per-game <number> Screenshots per game (default: 3)

Examples:
  npx tsx src/tools/screenshot-fetcher.ts fetch --games 200 --screenshots-per-game 3
  npx tsx src/tools/screenshot-fetcher.ts download
  npx tsx src/tools/screenshot-fetcher.ts all --games 50 --screenshots-per-game 5

Environment:
  RAWG_API_KEY  Your RAWG API key (required for fetch)
                Get one at: https://rawg.io/apidocs
`)
  }
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
