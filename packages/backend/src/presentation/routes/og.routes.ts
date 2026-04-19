import { Router } from 'express'
import type { Request, Response } from 'express'

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

/**
 * Dynamic Open Graph SVG per daily challenge.
 * Content-Type image/svg+xml so share previews differ day-to-day
 * (defeats Facebook/Discord caching on a single static logo).
 */
router.get('/daily.svg', (req: Request, res: Response) => {
  const date = sanitizeDate(req.query.date)
  const locale = typeof req.query.lang === 'string' && req.query.lang === 'en' ? 'en-US' : 'fr-FR'
  const readable = escapeXml(formatDate(date, locale))
  const tagline = escapeXml(
    locale.startsWith('fr')
      ? "Devinez le jeu à partir d'une capture panoramique."
      : 'Guess the game from a panoramic screenshot.'
  )
  const brand = escapeXml('THE BOX')
  const cta = escapeXml(
    locale.startsWith('fr')
      ? 'Joue le défi du jour'
      : 'Play today\u2019s challenge'
  )

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
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
  <text x="80" y="140" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="48" font-weight="700" fill="url(#accent)" letter-spacing="4">${brand}</text>
  <text x="80" y="320" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="72" font-weight="800" fill="#ffffff">${readable}</text>
  <text x="80" y="400" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="32" font-weight="400" fill="#cbd5e1">${tagline}</text>
  <rect x="80" y="480" width="380" height="72" rx="36" fill="url(#accent)"/>
  <text x="270" y="527" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
        font-size="28" font-weight="700" fill="#0a0a0f" text-anchor="middle">${cta}</text>
</svg>`

  res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8')
  res.setHeader('Cache-Control', 'public, max-age=3600')
  res.send(svg)
})

export default router
