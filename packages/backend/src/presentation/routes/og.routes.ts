import { Router } from 'express'
import type { Request, Response } from 'express'
import path from 'path'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { Resvg } from '@resvg/resvg-js'
import { challengeRepository } from '../../infrastructure/repositories/index.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

const WIDTH = 1200
const HEIGHT = 630

// Mirror of game.routes' uploads resolver: map a stored `/uploads/...` URL
// to an absolute path and refuse anything that escapes the uploads dir.
// Duplicated (not imported) to keep this security check local and explicit.
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const uploadsPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'uploads')

function resolveUploadFilePath(imageUrl: string): string | null {
  const relativePath = imageUrl.replace('/uploads/', '')
  const filePath = path.resolve(uploadsPath, relativePath)
  if (filePath !== uploadsPath && !filePath.startsWith(uploadsPath + path.sep)) {
    return null
  }
  return filePath
}

const EXT_MIME: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function todayIso(): string {
  return new Date().toISOString().split('T')[0]!
}

function sanitizeDate(input: unknown): string {
  if (typeof input !== 'string') return todayIso()
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(input)
  if (!match) return todayIso()
  return input
}

function formatDate(iso: string, locale: string): string {
  try {
    const d = new Date(`${iso}T00:00:00Z`)
    return d.toLocaleDateString(locale, {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'UTC',
    })
  } catch {
    return iso
  }
}

/**
 * Load the challenge's first screenshot as a base64 data URI so it can be
 * embedded directly in the OG SVG (resvg has no network access).
 *
 * Guarded to dates <= today: the preview endpoint is deliberately today-only
 * to avoid leaking *future* challenge screenshots, so we apply the same rule
 * here — a crafted `?date=<future>` falls back to the plain gradient card.
 * Fail-soft: any miss returns null and the caller renders the text card.
 */
async function loadDailyScreenshotDataUri(date: string): Promise<string | null> {
  try {
    if (date > todayIso()) return null
    const challenge = await challengeRepository.findByDate(date)
    if (!challenge) return null
    const tier = await challengeRepository.findTierByNumber(challenge.id, 1)
    if (!tier) return null
    const entry = await challengeRepository.findScreenshotAtPosition(tier.id, 1)
    if (!entry) return null

    const ext = path.extname(entry.image_url).toLowerCase()
    const mime = EXT_MIME[ext]
    if (!mime) return null

    const filePath = resolveUploadFilePath(entry.image_url)
    if (!filePath) return null

    const buffer = await readFile(filePath)
    return `data:${mime};base64,${buffer.toString('base64')}`
  } catch (error) {
    logger.warn({ error: String(error), date }, 'og screenshot embed failed, using text card')
    return null
  }
}

function buildDailySvg(date: string, lang: 'fr' | 'en', imageDataUri: string | null): string {
  const locale = lang === 'en' ? 'en-US' : 'fr-FR'
  const readable = escapeXml(formatDate(date, locale))
  const brand = escapeXml('THE BOX')
  const cta = escapeXml(lang === 'fr' ? 'Joue le défi du jour' : 'Play today’s challenge')

  // With a screenshot: a YouTube-thumbnail-style card — the actual (blurred)
  // game still under a dark scrim, with a "Can you name it?" hook. The blur
  // keeps it intriguing rather than a spoiler. Without one: the original
  // gradient text card.
  if (imageDataUri) {
    const hook = escapeXml(lang === 'fr' ? 'Tu reconnais ce jeu ?' : 'Can you name this game?')
    const tagline = escapeXml(
      lang === 'fr' ? 'Une capture. Un jeu à deviner.' : 'One screenshot. One guess.'
    )
    return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#a855f7" />
      <stop offset="50%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>
    <linearGradient id="scrim" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#0a0a0f" stop-opacity="0.55" />
      <stop offset="55%" stop-color="#0a0a0f" stop-opacity="0.65" />
      <stop offset="100%" stop-color="#0a0a0f" stop-opacity="0.92" />
    </linearGradient>
    <filter id="blur" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="14" />
    </filter>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="#0a0a0f"/>
  <image href="${imageDataUri}" x="0" y="0" width="${WIDTH}" height="${HEIGHT}"
         preserveAspectRatio="xMidYMid slice" filter="url(#blur)"/>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#scrim)"/>
  <text x="80" y="120" font-family="sans-serif"
        font-size="40" font-weight="700" fill="url(#accent)" letter-spacing="4">${brand}</text>
  <text x="80" y="330" font-family="sans-serif"
        font-size="84" font-weight="800" fill="#ffffff">${hook}</text>
  <text x="80" y="400" font-family="sans-serif"
        font-size="32" font-weight="400" fill="#cbd5e1">${tagline}</text>
  <rect x="80" y="470" width="400" height="72" rx="36" fill="url(#accent)"/>
  <text x="280" y="517" font-family="sans-serif"
        font-size="28" font-weight="700" fill="#0a0a0f" text-anchor="middle">${cta}</text>
  <text x="1120" y="560" font-family="sans-serif"
        font-size="24" font-weight="400" fill="#94a3b8" text-anchor="end">${readable}</text>
</svg>`
  }

  const tagline = escapeXml(
    lang === 'fr'
      ? "Devinez le jeu à partir d'une capture d'écran."
      : 'Guess the game from a screenshot.'
  )
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a0f" />
      <stop offset="100%" stop-color="#1a0b2e" />
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#a855f7" />
      <stop offset="50%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="200" cy="120" r="180" fill="#a855f7" opacity="0.15"/>
  <circle cx="1050" cy="520" r="220" fill="#06b6d4" opacity="0.12"/>
  <text x="80" y="140" font-family="sans-serif"
        font-size="48" font-weight="700" fill="url(#accent)" letter-spacing="4">${brand}</text>
  <text x="80" y="320" font-family="sans-serif"
        font-size="72" font-weight="800" fill="#ffffff">${readable}</text>
  <text x="80" y="400" font-family="sans-serif"
        font-size="32" font-weight="400" fill="#cbd5e1">${tagline}</text>
  <rect x="80" y="480" width="380" height="72" rx="36" fill="url(#accent)"/>
  <text x="270" y="527" font-family="sans-serif"
        font-size="28" font-weight="700" fill="#0a0a0f" text-anchor="middle">${cta}</text>
</svg>`
}

function parseLang(input: unknown): 'fr' | 'en' {
  return typeof input === 'string' && input === 'en' ? 'en' : 'fr'
}

// ---------------------------------------------------------------------------
// Geo free-play run recap card
// ---------------------------------------------------------------------------

// Per-round maximum from the geo scoring curve (docs/geo-mode.md).
const GEO_RUN_ROUND_MAX = 2000
// Hard cap on shared rounds — the client plays 5, but keep a margin so a
// longer future run length doesn't 400 old links.
const GEO_RUN_MAX_ROUNDS = 10

// Tier colors mirror the frontend --score-high/mid/low tokens and its
// band thresholds (frontend lib/geo-score-tiers.ts).
function geoRunTierColor(score: number): string {
  if (score >= 1500) return '#34d399'
  if (score >= 500) return '#fbbf24'
  return '#f97316'
}

/**
 * Parse the `scores` query ("840,392,1361") into per-round integers.
 * Returns null on anything malformed so the route can 400 instead of
 * rendering a card for garbage. Values are clamped to the scoring
 * range rather than rejected — a stale client with a different max
 * should degrade, not break.
 */
export function parseGeoRunScores(input: unknown): number[] | null {
  if (typeof input !== 'string' || input.length === 0) return null
  const parts = input.split(',')
  if (parts.length === 0 || parts.length > GEO_RUN_MAX_ROUNDS) return null
  const scores: number[] = []
  for (const part of parts) {
    if (!/^\d{1,4}$/.test(part)) return null
    scores.push(Math.min(GEO_RUN_ROUND_MAX, Number.parseInt(part, 10)))
  }
  return scores
}

function buildGeoRunSvg(scores: number[], lang: 'fr' | 'en'): string {
  const locale = lang === 'en' ? 'en-US' : 'fr-FR'
  const total = scores.reduce((sum, s) => sum + s, 0)
  const max = scores.length * GEO_RUN_ROUND_MAX
  const brand = escapeXml('THE BOX')
  const title = escapeXml(lang === 'fr' ? 'Run Géo terminé !' : 'Geo run complete!')
  const cta = escapeXml(lang === 'fr' ? 'Fais mieux !' : 'Beat my run!')
  const totalText = escapeXml(
    `${total.toLocaleString(locale)} / ${max.toLocaleString(locale)}`
  )
  const totalColor = geoRunTierColor(total / scores.length)

  // One dot per round, tier-colored, with the round score underneath.
  const dotGap = 110
  const dotsStart = 80
  const dots = scores
    .map((score, i) => {
      const cx = dotsStart + i * dotGap + 14
      return `
  <circle cx="${cx}" cy="430" r="14" fill="${geoRunTierColor(score)}"/>
  <text x="${cx}" y="478" font-family="sans-serif" font-size="24" font-weight="400"
        fill="#94a3b8" text-anchor="middle">${escapeXml(score.toLocaleString(locale))}</text>`
    })
    .join('')

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a0f" />
      <stop offset="100%" stop-color="#0b2530" />
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#a855f7" />
      <stop offset="50%" stop-color="#ec4899" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>
  </defs>
  <rect width="${WIDTH}" height="${HEIGHT}" fill="url(#bg)"/>
  <circle cx="1020" cy="120" r="200" fill="#06b6d4" opacity="0.12"/>
  <circle cx="180" cy="560" r="180" fill="#a855f7" opacity="0.12"/>
  <text x="80" y="120" font-family="sans-serif"
        font-size="40" font-weight="700" fill="url(#accent)" letter-spacing="4">${brand}</text>
  <text x="80" y="230" font-family="sans-serif"
        font-size="64" font-weight="800" fill="#ffffff">${title}</text>
  <text x="80" y="350" font-family="sans-serif"
        font-size="88" font-weight="800" fill="${totalColor}">${totalText}</text>
  ${dots}
  <rect x="80" y="520" width="320" height="72" rx="36" fill="url(#accent)"/>
  <text x="240" y="567" font-family="sans-serif"
        font-size="28" font-weight="700" fill="#0a0a0f" text-anchor="middle">${cta}</text>
  <text x="1120" y="560" font-family="sans-serif"
        font-size="26" font-weight="400" fill="#94a3b8" text-anchor="end">${escapeXml(
          lang === 'fr' ? 'Mode Géo — run libre' : 'Geo mode — free run'
        )}</text>
</svg>`
}

/**
 * SVG variant — kept for Discord/Slack which render SVG previews fine.
 * Twitter, WhatsApp, iMessage and LinkedIn reject SVG og:images, so the
 * canonical preview URL is the PNG below.
 */
router.get('/daily.svg', async (req: Request, res: Response) => {
  const date = sanitizeDate(req.query.date)
  const lang = parseLang(req.query.lang)
  const image = await loadDailyScreenshotDataUri(date)
  const svg = buildDailySvg(date, lang, image)

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.send(svg)
})

/**
 * PNG variant — required by Twitter / WhatsApp / iMessage / LinkedIn link
 * previews, which silently drop SVG og:images. Rasterised on-demand from
 * the same SVG template via resvg-js. The challenge for a given UTC date
 * is immutable, so a one-day cache is safe.
 */
router.get('/daily.png', async (req: Request, res: Response) => {
  const date = sanitizeDate(req.query.date)
  const lang = parseLang(req.query.lang)
  const image = await loadDailyScreenshotDataUri(date)
  const svg = buildDailySvg(date, lang, image)

  try {
    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: WIDTH },
      font: {
        // Alpine production images install `font-dejavu`; macOS/Linux dev
        // boxes have their own sans-serif fallbacks. Either way resvg picks
        // a sans face from fontconfig.
        loadSystemFonts: true,
        defaultFontFamily: 'DejaVu Sans',
      },
    }).render().asPng()

    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
    res.send(png)
  } catch (error) {
    logger.error({ error: String(error), date, lang }, 'og png render failed')
    // Fall back to SVG so the share preview is still something, not 500.
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.send(svg)
  }
})

/**
 * Geo run recap card. Query: `scores` (comma-separated per-round ints,
 * clamped to 0..2000, at most 10) + `lang`. Everything is derived from
 * the query, so the response is immutable per URL — long cache is safe.
 * SVG variant for Discord/Slack, PNG for the platforms that reject SVG.
 */
router.get('/geo-run.svg', (req: Request, res: Response) => {
  const scores = parseGeoRunScores(req.query.scores)
  if (!scores) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_SCORES', message: 'scores must be 1-10 comma-separated integers' },
    })
    return
  }
  const svg = buildGeoRunSvg(scores, parseLang(req.query.lang))
  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
  res.send(svg)
})

router.get('/geo-run.png', (req: Request, res: Response) => {
  const scores = parseGeoRunScores(req.query.scores)
  if (!scores) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_SCORES', message: 'scores must be 1-10 comma-separated integers' },
    })
    return
  }
  const lang = parseLang(req.query.lang)
  const svg = buildGeoRunSvg(scores, lang)
  try {
    const png = new Resvg(svg, {
      fitTo: { mode: 'width', value: WIDTH },
      font: {
        loadSystemFonts: true,
        defaultFontFamily: 'DejaVu Sans',
      },
    }).render().asPng()
    res.setHeader('Content-Type', 'image/png')
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
    res.send(png)
  } catch (error) {
    logger.error({ error: String(error), lang }, 'og geo-run png render failed')
    // Fall back to SVG so the share preview is still something, not 500.
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.send(svg)
  }
})

export default router
