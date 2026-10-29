import { Router } from 'express'
import type { Request, Response } from 'express'
import path from 'path'
import { readFile } from 'fs/promises'
import { fileURLToPath } from 'url'
import { Resvg } from '@resvg/resvg-js'
import { SITE_TAGLINE } from '@the-box/types'
import { challengeRepository } from '../../infrastructure/repositories/index.js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

const WIDTH = 1200
const HEIGHT = 630

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
  const cta = escapeXml(lang === 'fr' ? 'Ouvre la boîte du jour' : "Open today's box")

  if (imageDataUri) {
    const hook = escapeXml(lang === 'fr' ? 'Tu reconnais ce jeu ?' : 'Can you name this game?')
    const tagline = escapeXml(SITE_TAGLINE[lang])
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

  const tagline = escapeXml(SITE_TAGLINE[lang])
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

const GEO_RUN_ROUND_MAX = 2000
const GEO_RUN_MAX_ROUNDS = 10

function geoRunTierColor(score: number): string {
  if (score >= 1500) return '#34d399'
  if (score >= 500) return '#fbbf24'
  return '#f97316'
}

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

router.get('/daily.svg', async (req: Request, res: Response) => {
  const date = sanitizeDate(req.query.date)
  const lang = parseLang(req.query.lang)
  const image = await loadDailyScreenshotDataUri(date)
  const svg = buildDailySvg(date, lang, image)

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.send(svg)
})

router.get('/daily.png', async (req: Request, res: Response) => {
  const date = sanitizeDate(req.query.date)
  const lang = parseLang(req.query.lang)
  const image = await loadDailyScreenshotDataUri(date)
  const svg = buildDailySvg(date, lang, image)

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
    logger.error({ error: String(error), date, lang }, 'og png render failed')
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.send(svg)
  }
})

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
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=300')
    res.send(svg)
  }
})

export default router
