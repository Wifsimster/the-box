/**
 * Steam Screenshot Fetcher CLI Tool
 *
 * Enriches the existing games database with high-quality captures from
 * the Steam Store API. For every game in `data/games.json` it:
 *   1. searches the Steam Store for the best matching app,
 *   2. fetches the app details (which include screenshots),
 *   3. appends the new screenshots to `data/screenshots.json`,
 *   4. records the slug → appid mapping in `data/steam-mapping.json`
 *      so subsequent runs are idempotent.
 *
 * Manual overrides (or known-bad auto-matches) can be placed in
 * `data/steam-overrides.json` as `{ "<game-slug>": <appid|null> }`.
 * A `null` value tells the tool to skip the game (not on Steam).
 *
 * Steam APIs used (no API key required):
 *   - https://store.steampowered.com/api/storesearch
 *   - https://store.steampowered.com/api/appdetails
 *
 * Usage:
 *   npx tsx src/tools/steam-screenshot-fetcher.ts fetch [--screenshots-per-game 5]
 *   npx tsx src/tools/steam-screenshot-fetcher.ts download
 *   npx tsx src/tools/steam-screenshot-fetcher.ts all [--screenshots-per-game 5]
 */

import fs from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT_DIR = path.resolve(__dirname, '..', '..')
const DATA_DIR = path.join(ROOT_DIR, 'data')
const UPLOADS_DIR = path.resolve(ROOT_DIR, '..', '..', 'uploads', 'screenshots')

const GAMES_FILE = path.join(DATA_DIR, 'games.json')
const SCREENSHOTS_FILE = path.join(DATA_DIR, 'screenshots.json')
const MAPPING_FILE = path.join(DATA_DIR, 'steam-mapping.json')
const OVERRIDES_FILE = path.join(DATA_DIR, 'steam-overrides.json')

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GameRecord {
  name: string
  slug: string
  aliases: string[]
  release_year: number | null
  developer: string | null
  publisher: string | null
  genres: string[]
  platforms: string[]
  cover_image_url: string | null
}

interface ScreenshotRecord {
  game_slug: string
  image_url: string
  thumbnail_url: string | null
  original_url: string
  difficulty: 1 | 2 | 3
  source?: 'rawg' | 'steam'
}

interface SteamSearchItem {
  type: string
  name: string
  id: number
}

interface SteamSearchResponse {
  total: number
  items: SteamSearchItem[]
}

interface SteamScreenshot {
  id: number
  path_thumbnail: string
  path_full: string
}

interface SteamAppDetails {
  type?: string
  name?: string
  steam_appid?: number
  screenshots?: SteamScreenshot[]
}

interface SteamMappingEntry {
  appid: number | null
  steam_name: string | null
  matched_at: string
  match_score: number
  screenshots_added: number
}

type SteamMapping = Record<string, SteamMappingEntry>
type SteamOverrides = Record<string, number | null>

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function showProgress(current: number, total: number, message: string): void {
  const percentage = Math.round((current / total) * 100)
  const bar = '='.repeat(Math.round(percentage / 2)) + ' '.repeat(50 - Math.round(percentage / 2))
  process.stdout.write(`\r[${bar}] ${percentage}% (${current}/${total}) ${message.padEnd(60).slice(0, 60)}`)
}

function endProgressLine(): void {
  process.stdout.write('\n')
}

/**
 * Normalise a game title for fuzzy matching: lowercase, strip diacritics,
 * drop punctuation, collapse whitespace, and remove common edition suffixes
 * that differ between RAWG and Steam ("Complete Edition", "GOTY", ...).
 */
function normaliseTitle(title: string): string {
  const stripped = title
    .normalize('NFKD')
    .replace(/\p{Diacritic}+/gu, '')
    .toLowerCase()
    .replace(/[‐-―−]/g, '-') // unify dashes
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return stripped
    .replace(/\b(complete|definitive|legendary|game of the year|goty|deluxe|ultimate|gold|royal|remastered|hd|final cut|enhanced|special)\b.*$/g, '')
    .trim()
}

/**
 * Word-set Jaccard similarity on normalised titles. Returns a value in [0, 1].
 */
function titleSimilarity(a: string, b: string): number {
  const wordsA = new Set(normaliseTitle(a).split(' ').filter(Boolean))
  const wordsB = new Set(normaliseTitle(b).split(' ').filter(Boolean))
  if (wordsA.size === 0 || wordsB.size === 0) return 0
  let intersection = 0
  for (const w of wordsA) if (wordsB.has(w)) intersection++
  const union = wordsA.size + wordsB.size - intersection
  return intersection / union
}

async function readJsonIfExists<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(file, 'utf-8')
    return JSON.parse(raw) as T
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback
    throw error
  }
}

// ---------------------------------------------------------------------------
// Steam API client
// ---------------------------------------------------------------------------

class SteamClient {
  private readonly baseUrl = 'https://store.steampowered.com/api'
  private readonly minDelayMs: number
  private lastRequestAt = 0

  constructor(minDelayMs = 1500) {
    this.minDelayMs = minDelayMs
  }

  private async throttle(): Promise<void> {
    const elapsed = Date.now() - this.lastRequestAt
    if (elapsed < this.minDelayMs) await sleep(this.minDelayMs - elapsed)
    this.lastRequestAt = Date.now()
  }

  private async request(url: string, retries = 3): Promise<unknown> {
    for (let attempt = 0; attempt < retries; attempt++) {
      await this.throttle()
      const response = await fetch(url, {
        headers: {
          'user-agent': 'the-box-screenshot-fetcher/1.0 (+https://github.com/wifsimster/the-box)',
          accept: 'application/json',
        },
      })

      if (response.status === 429 || response.status >= 500) {
        const wait = 5000 * (attempt + 1)
        await sleep(wait)
        continue
      }

      if (!response.ok) throw new Error(`Steam API ${response.status} ${response.statusText} for ${url}`)
      const text = await response.text()
      if (!text) return null
      try {
        return JSON.parse(text)
      } catch {
        return null
      }
    }
    throw new Error(`Steam API exhausted retries for ${url}`)
  }

  async search(term: string): Promise<SteamSearchItem[]> {
    const url = `${this.baseUrl}/storesearch?term=${encodeURIComponent(term)}&l=english&cc=US`
    const data = (await this.request(url)) as SteamSearchResponse | null
    if (!data || !Array.isArray(data.items)) return []
    return data.items.filter((i) => i.type === 'app')
  }

  async appDetails(appid: number): Promise<SteamAppDetails | null> {
    const url = `${this.baseUrl}/appdetails?appids=${appid}&cc=us&l=en`
    const data = (await this.request(url)) as Record<string, { success: boolean; data?: SteamAppDetails }> | null
    const entry = data?.[String(appid)]
    if (!entry || !entry.success || !entry.data) return null
    return entry.data
  }
}

// ---------------------------------------------------------------------------
// Matching
// ---------------------------------------------------------------------------

interface MatchResult {
  appid: number | null
  steamName: string | null
  score: number
}

async function findBestMatch(client: SteamClient, game: GameRecord, threshold: number): Promise<MatchResult> {
  const candidates = new Map<number, SteamSearchItem>()

  // Search by primary name and any aliases.
  const queries = new Set<string>([game.name, ...(game.aliases ?? [])])
  for (const q of queries) {
    if (!q) continue
    const items = await client.search(q)
    for (const item of items) candidates.set(item.id, item)
  }

  if (candidates.size === 0) return { appid: null, steamName: null, score: 0 }

  let best: MatchResult = { appid: null, steamName: null, score: 0 }
  const targetTitles = [game.name, ...(game.aliases ?? [])].filter(Boolean)
  for (const item of candidates.values()) {
    const score = Math.max(...targetTitles.map((t) => titleSimilarity(t, item.name)))
    if (score > best.score) best = { appid: item.id, steamName: item.name, score }
  }

  if (best.score < threshold) return { appid: null, steamName: best.steamName, score: best.score }
  return best
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

interface FetchOptions {
  screenshotsPerGame: number
  matchThreshold: number
  refresh: boolean
}

async function fetchSteamScreenshots(opts: FetchOptions): Promise<void> {
  const games = await readJsonIfExists<GameRecord[]>(GAMES_FILE, [])
  if (games.length === 0) throw new Error(`No games found at ${GAMES_FILE}`)

  const screenshots = await readJsonIfExists<ScreenshotRecord[]>(SCREENSHOTS_FILE, [])
  const mapping = await readJsonIfExists<SteamMapping>(MAPPING_FILE, {})
  const overrides = await readJsonIfExists<SteamOverrides>(OVERRIDES_FILE, {})

  const existingOriginalUrls = new Set(screenshots.map((s) => s.original_url))
  // Continue distributing difficulty round-robin from current count of Steam screenshots.
  let difficultyCounter = screenshots.filter((s) => s.source === 'steam').length

  const client = new SteamClient()
  let processed = 0
  let added = 0
  let skipped = 0
  let unmatched = 0

  console.log(`\nProcessing ${games.length} games against Steam Store...`)

  for (const game of games) {
    processed++
    showProgress(processed, games.length, game.name)

    let appid: number | null = null
    let steamName: string | null = null
    let score = 0

    if (Object.prototype.hasOwnProperty.call(overrides, game.slug)) {
      appid = overrides[game.slug] ?? null
      steamName = appid ? `(override #${appid})` : null
      score = appid ? 1 : 0
    } else if (mapping[game.slug] && !opts.refresh) {
      // Reuse cached mapping (idempotent runs).
      appid = mapping[game.slug]!.appid
      steamName = mapping[game.slug]!.steam_name
      score = mapping[game.slug]!.match_score
    } else {
      const match = await findBestMatch(client, game, opts.matchThreshold)
      appid = match.appid
      steamName = match.steamName
      score = match.score
    }

    if (!appid) {
      mapping[game.slug] = {
        appid: null,
        steam_name: steamName,
        matched_at: new Date().toISOString(),
        match_score: score,
        screenshots_added: 0,
      }
      unmatched++
      continue
    }

    const details = await client.appDetails(appid)
    if (!details || !details.screenshots || details.screenshots.length === 0) {
      mapping[game.slug] = {
        appid,
        steam_name: details?.name ?? steamName,
        matched_at: new Date().toISOString(),
        match_score: score,
        screenshots_added: mapping[game.slug]?.screenshots_added ?? 0,
      }
      skipped++
      continue
    }

    const wanted = details.screenshots.slice(0, opts.screenshotsPerGame)
    let addedForGame = 0
    let index = 1

    // Find existing Steam screenshot count for this game so we keep filenames stable.
    const existingForGame = screenshots.filter((s) => s.game_slug === game.slug && s.source === 'steam').length
    index = existingForGame + 1

    for (const ss of wanted) {
      // Strip cache-busting query string for stable dedupe.
      const canonicalUrl = ss.path_full.split('?')[0]!
      if (existingOriginalUrls.has(canonicalUrl)) continue

      const filename = `steam_${index}.jpg`
      const localPath = `/uploads/screenshots/${game.slug}/${filename}`
      const difficulty = ((difficultyCounter % 3) + 1) as 1 | 2 | 3
      difficultyCounter++

      screenshots.push({
        game_slug: game.slug,
        image_url: localPath,
        thumbnail_url: ss.path_thumbnail.split('?')[0] ?? null,
        original_url: canonicalUrl,
        difficulty,
        source: 'steam',
      })
      existingOriginalUrls.add(canonicalUrl)
      added++
      addedForGame++
      index++
    }

    mapping[game.slug] = {
      appid,
      steam_name: details.name ?? steamName,
      matched_at: new Date().toISOString(),
      match_score: score,
      screenshots_added: (mapping[game.slug]?.screenshots_added ?? 0) + addedForGame,
    }
  }

  endProgressLine()

  // Backfill source field on legacy entries (those without a `source` were RAWG-imported).
  for (const s of screenshots) {
    if (!s.source) s.source = 'rawg'
  }

  await fs.writeFile(SCREENSHOTS_FILE, JSON.stringify(screenshots, null, 2))
  await fs.writeFile(MAPPING_FILE, JSON.stringify(mapping, null, 2))

  console.log(`\nSummary:`)
  console.log(`  Games processed:   ${processed}`)
  console.log(`  Screenshots added: ${added}`)
  console.log(`  Already on file:   ${skipped}`)
  console.log(`  No Steam match:    ${unmatched}`)
  console.log(`  Mapping saved to:  ${path.relative(process.cwd(), MAPPING_FILE)}`)
}

// ---------------------------------------------------------------------------
// Downloader
// ---------------------------------------------------------------------------

async function downloadImage(url: string, outputPath: string, retries = 3): Promise<boolean> {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const response = await fetch(url, { headers: { 'user-agent': 'the-box-screenshot-fetcher/1.0' } })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const buffer = Buffer.from(await response.arrayBuffer())
      await fs.mkdir(path.dirname(outputPath), { recursive: true })
      await fs.writeFile(outputPath, buffer)
      return true
    } catch (error) {
      if (attempt === retries - 1) {
        console.error(`\nFailed to download ${url}: ${error}`)
        return false
      }
      await sleep(1000 * Math.pow(2, attempt))
    }
  }
  return false
}

async function downloadSteamScreenshots(): Promise<void> {
  const screenshots = await readJsonIfExists<ScreenshotRecord[]>(SCREENSHOTS_FILE, [])
  const steamShots = screenshots.filter((s) => s.source === 'steam')
  if (steamShots.length === 0) {
    console.log('No Steam screenshots to download. Run "fetch" first.')
    return
  }

  console.log(`Downloading ${steamShots.length} Steam screenshots...`)
  await fs.mkdir(UPLOADS_DIR, { recursive: true })

  let downloaded = 0
  let failed = 0
  let skipped = 0

  for (let i = 0; i < steamShots.length; i++) {
    const ss = steamShots[i]!
    showProgress(i + 1, steamShots.length, ss.game_slug)

    const relative = ss.image_url.replace('/uploads/screenshots/', '')
    const outputPath = path.join(UPLOADS_DIR, relative)

    try {
      await fs.access(outputPath)
      skipped++
      continue
    } catch {
      // not present, download
    }

    const ok = await downloadImage(ss.original_url, outputPath)
    if (ok) downloaded++
    else failed++
    await sleep(150)
  }

  endProgressLine()
  console.log(`\nDownloaded: ${downloaded}, Already present: ${skipped}, Failed: ${failed}`)
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseFlags(argv: string[]): Record<string, string> {
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i]!
    if (!token.startsWith('--')) continue
    const key = token.replace(/^--/, '')
    const next = argv[i + 1]
    if (next && !next.startsWith('--')) {
      flags[key] = next
      i++
    } else {
      flags[key] = 'true'
    }
  }
  return flags
}

async function main(): Promise<void> {
  const args = process.argv.slice(2)
  const command = args[0] ?? 'help'
  const flags = parseFlags(args.slice(1))

  const opts: FetchOptions = {
    screenshotsPerGame: parseInt(flags['screenshots-per-game'] ?? '5', 10),
    matchThreshold: parseFloat(flags['match-threshold'] ?? '0.5'),
    refresh: flags['refresh'] === 'true',
  }

  switch (command) {
    case 'fetch':
      await fetchSteamScreenshots(opts)
      break
    case 'download':
      await downloadSteamScreenshots()
      break
    case 'all':
      await fetchSteamScreenshots(opts)
      await downloadSteamScreenshots()
      break
    default:
      console.log(`
Steam Screenshot Fetcher

Usage:
  npx tsx src/tools/steam-screenshot-fetcher.ts <command> [flags]

Commands:
  fetch     Search Steam for each game in data/games.json and append
            their screenshots to data/screenshots.json
  download  Download every Steam-sourced screenshot referenced by
            data/screenshots.json into uploads/screenshots/<slug>/
  all       fetch + download

Flags:
  --screenshots-per-game <n>   Max screenshots per game (default 5)
  --match-threshold <0..1>     Min name-similarity to accept (default 0.5)
  --refresh                    Re-run search for games already mapped

Files:
  data/games.json              Source list of games (input)
  data/screenshots.json        Screenshot index (input + output)
  data/steam-mapping.json      slug -> Steam appid cache (output)
  data/steam-overrides.json    slug -> appid (manual override, optional)
`)
  }
}

main().catch((error) => {
  console.error('Error:', error)
  process.exit(1)
})
