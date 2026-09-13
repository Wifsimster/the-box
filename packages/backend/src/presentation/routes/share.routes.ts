/**
 * Social share shells.
 *
 * Serves the SPA's index.html with per-share OpenGraph/Twitter meta patched
 * into the raw HTML — preview bots don't run JS, so client-side tags are
 * invisible to them, and a static logo would make every shared link look
 * identical in a timeline.
 *
 * Extracted from `index.ts`, which was both the process entrypoint and the
 * place three HTML-templating helpers lived.
 */
import express, { Router } from 'express'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { env } from '../../config/env.js'
import { logger } from '../../infrastructure/logger/logger.js'
import { parseGeoRunScores } from './og.routes.js'

/** Where the built SPA lives, relative to this compiled module. */
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const frontendPath = path.resolve(__dirname, '..', '..', '..', '..', '..', 'packages', 'frontend', 'dist')

const router = Router()

// Share routes: serve index.html with per-challenge OG meta tags injected so
// link previews are unique per shared day (defeats static-logo preview caching).
function buildShareMeta(req: express.Request): { title: string; description: string; imageUrl: string; pageUrl: string } {
  const dateParam = typeof req.query.date === 'string' ? req.query.date : ''
  const isoMatch = /^\d{4}-\d{2}-\d{2}$/.test(dateParam)
  const date = isoMatch ? dateParam : new Date().toISOString().split('T')[0]!
  const lang = (req.params.lang === 'en' ? 'en' : 'fr')
  const locale = lang === 'en' ? 'en-US' : 'fr-FR'
  const readable = new Date(`${date}T00:00:00Z`).toLocaleDateString(locale, {
    year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
  })
  const title = lang === 'en'
    ? `The Box — ${readable} challenge`
    : `The Box — défi du ${readable}`
  const description = lang === 'en'
    ? 'Can you beat my score on today\u2019s screenshot challenge?'
    : 'Arriveras-tu \u00e0 battre mon score sur le d\u00e9fi du jour ?'
  const base = env.API_URL.replace(/\/$/, '')
  const imageUrl = `${base}/api/og/daily.png?date=${encodeURIComponent(date)}&lang=${lang}`
  const pageUrl = `${base}/share/daily?date=${encodeURIComponent(date)}&lang=${lang}`
  return { title, description, imageUrl, pageUrl }
}

function escapeHtmlAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// Serve the SPA shell with the given OG/Twitter meta patched in — link
// preview bots don't run JS, so the tags must be in the raw HTML.
function serveShareShell(
  res: express.Response,
  next: express.NextFunction,
  meta: { title: string; description: string; imageUrl: string; pageUrl: string },
): void {
  try {
    const html = fs.readFileSync(path.join(frontendPath, 'index.html'), 'utf-8')
    const patched = html
      .replace(/(<meta property="og:title"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.title)}$2`)
      .replace(/(<meta property="og:description"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.description)}$2`)
      .replace(/(<meta property="og:image"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.imageUrl)}$2`)
      .replace(/(<meta property="og:url"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.pageUrl)}$2`)
      .replace(/(<meta name="twitter:title"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.title)}$2`)
      .replace(/(<meta name="twitter:description"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.description)}$2`)
      .replace(/(<meta name="twitter:image"[^>]*content=")[^"]*(")/, `$1${escapeHtmlAttr(meta.imageUrl)}$2`)
    res.setHeader('Content-Type', 'text/html; charset=utf-8')
    res.setHeader('Cache-Control', 'public, max-age=600')
    res.send(patched)
  } catch (error) {
    logger.warn({ error: String(error) }, 'share meta injection failed, falling back to SPA')
    next()
  }
}

router.get('/share/daily', (req, res, next) => {
  serveShareShell(res, next, buildShareMeta(req))
})

// Geo free-play run recap share. Scores travel in the URL (runs are
// client-side only — nothing is stored server-side), the OG image is
// derived from the same query by /api/og/geo-run.png.
router.get('/share/geo-run', (req, res, next) => {
  const scores = parseGeoRunScores(req.query.scores)
  if (!scores) {
    // Malformed link: fall through to the SPA shell with default meta
    // rather than 400ing a human click.
    next()
    return
  }
  const lang = req.query.lang === 'en' ? 'en' : 'fr'
  const total = scores.reduce((sum, s) => sum + s, 0)
  const max = scores.length * 2000
  const locale = lang === 'en' ? 'en-US' : 'fr-FR'
  const totalText = `${total.toLocaleString(locale)} / ${max.toLocaleString(locale)}`
  const base = env.API_URL.replace(/\/$/, '')
  const query = `scores=${encodeURIComponent(scores.join(','))}&lang=${lang}`
  serveShareShell(res, next, {
    title: lang === 'en' ? `The Box — Geo run: ${totalText}` : `The Box — Run Géo : ${totalText}`,
    description:
      lang === 'en'
        ? `Can you beat my ${scores.length}-round screenshot-location run?`
        : `Peux-tu battre mon run de ${scores.length} captures à localiser ?`,
    imageUrl: `${base}/api/og/geo-run.png?${query}`,
    pageUrl: `${base}/share/geo-run?${query}`,
  })
})

export default router
