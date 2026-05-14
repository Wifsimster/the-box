import { Router } from 'express'
import type { Request, Response } from 'express'
import { Resvg } from '@resvg/resvg-js'
import { logger } from '../../infrastructure/logger/logger.js'

const router = Router()

const WIDTH = 1200
const HEIGHT = 630

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function sanitizeDate(input: unknown): string {
  if (typeof input !== 'string') return new Date().toISOString().split('T')[0]!
  const match = /^\d{4}-\d{2}-\d{2}$/.exec(input)
  if (!match) return new Date().toISOString().split('T')[0]!
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

function buildDailySvg(date: string, lang: 'fr' | 'en'): string {
  const locale = lang === 'en' ? 'en-US' : 'fr-FR'
  const readable = escapeXml(formatDate(date, locale))
  const tagline = escapeXml(
    lang === 'fr'
      ? "Devinez le jeu à partir d'une capture d'écran."
      : 'Guess the game from a screenshot.'
  )
  const brand = escapeXml('THE BOX')
  const cta = escapeXml(
    lang === 'fr' ? 'Joue le défi du jour' : 'Play today’s challenge'
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

/**
 * SVG variant — kept for Discord/Slack which render SVG previews fine.
 * Twitter, WhatsApp, iMessage and LinkedIn reject SVG og:images, so the
 * canonical preview URL is the PNG below.
 */
router.get('/daily.svg', (req: Request, res: Response) => {
  const date = sanitizeDate(req.query.date)
  const lang = parseLang(req.query.lang)
  const svg = buildDailySvg(date, lang)

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
router.get('/daily.png', (req: Request, res: Response) => {
  const date = sanitizeDate(req.query.date)
  const lang = parseLang(req.query.lang)
  const svg = buildDailySvg(date, lang)

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

export default router
