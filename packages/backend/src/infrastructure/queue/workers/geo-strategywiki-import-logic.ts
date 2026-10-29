import { queueLogger } from '../../logger/logger.js'
import {
  geoIngestFailureRepository,
  geoMapRepository,
} from '../../repositories/index.js'
import { tombstoneRetryAfter } from '../../../domain/services/geo-metadata.service.js'

const log = queueLogger.child({ worker: 'geo-strategywiki-import' })

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (compatible; the-box-geo-importer/1.0; +https://github.com/Wifsimster/the-box)'
const STRATEGYWIKI_API = 'https://strategywiki.org/w/api.php'
const STRATEGYWIKI_LICENSE = 'CC-BY-SA-3.0'
const MIN_IMAGE_DIMENSION = 600
const MIN_IMAGE_AREA = 600_000

function strategyWikiHeaders(ua: string): Record<string, string> {
  return {
    'User-Agent': ua,
    Accept: 'application/json, */*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  }
}

export interface ImportStrategyWikiMapInput {
  gameId: number
  gameName: string
  slug: string
  userAgent?: string
}

export interface ImportStrategyWikiMapResult {
  imported: boolean
  geoMapId?: number
  reason?: string
}

interface OpenSearchResponse {
  0?: string
  1?: string[]
  2?: string[]
  3?: string[]
}

interface ImagesResponse {
  query?: {
    pages?: Record<
      string,
      {
        title?: string
        images?: Array<{ title: string }>
        missing?: ''
      }
    >
  }
}

interface ImageInfoResponse {
  query?: {
    pages?: Record<
      string,
      {
        title?: string
        imageinfo?: Array<{
          url: string
          width: number
          height: number
          mime?: string
          extmetadata?: {
            LicenseShortName?: { value?: string }
            Artist?: { value?: string }
          }
        }>
        missing?: ''
      }
    >
  }
}

export async function importStrategyWikiMap(
  input: ImportStrategyWikiMapInput,
): Promise<ImportStrategyWikiMapResult> {
  const { gameId, gameName, slug } = input
  const ua = input.userAgent ?? DEFAULT_USER_AGENT

  const existing = await geoMapRepository.findBySourceAndGameId(gameId, 'strategywiki')
  if (existing) {
    return {
      imported: false,
      geoMapId: existing.id,
      reason: 'strategywiki map already imported',
    }
  }

  log.info({ gameId, gameName }, 'looking up strategywiki page')

  let pageTitle: string | null
  try {
    pageTitle = await resolveStrategyWikiTitle(gameName, ua)
  } catch (err) {
    await tombstone(gameId, `opensearch failed: ${String(err)}`)
    return { imported: false, reason: 'opensearch failed' }
  }
  if (!pageTitle) {
    await tombstone(gameId, 'no strategywiki page for game')
    return { imported: false, reason: 'no strategywiki page' }
  }

  let candidateFiles: string[]
  try {
    candidateFiles = await listCandidateFiles(pageTitle, ua)
  } catch (err) {
    await tombstone(gameId, `images list failed: ${String(err)}`)
    return { imported: false, reason: 'images list failed' }
  }
  if (candidateFiles.length === 0) {
    await tombstone(gameId, `no map-like files on ${pageTitle}`)
    return { imported: false, reason: 'no map files' }
  }

  let resolved: ResolvedFile | null
  try {
    resolved = await pickBestImage(candidateFiles, gameName, slug, ua)
  } catch (err) {
    await tombstone(gameId, `imageinfo failed: ${String(err)}`)
    return { imported: false, reason: 'imageinfo failed' }
  }
  if (!resolved) {
    await tombstone(gameId, 'no image cleared validation thresholds')
    return { imported: false, reason: 'no image passed validation' }
  }

  const map = await geoMapRepository.create({
    gameId,
    source: 'strategywiki',
    sourceUrl: `https://strategywiki.org/wiki/${encodeURIComponent(pageTitle)}`,
    imageUrl: resolved.url,
    widthPx: resolved.width,
    heightPx: resolved.height,
    license: resolved.license || STRATEGYWIKI_LICENSE,
    attribution: `StrategyWiki — ${pageTitle}${resolved.artist ? ` (${resolved.artist})` : ''}`,
  })

  await geoIngestFailureRepository.clear(gameId, 'strategywiki')
  log.info({ gameId, mapId: map.id, file: resolved.title }, 'imported strategywiki map')
  return { imported: true, geoMapId: map.id }
}

interface ResolvedFile {
  title: string
  url: string
  width: number
  height: number
  license: string
  artist: string | null
  score: number
}

async function resolveStrategyWikiTitle(
  gameName: string,
  ua: string,
): Promise<string | null> {
  const url =
    `${STRATEGYWIKI_API}?action=opensearch&format=json&namespace=0` +
    `&limit=5&search=${encodeURIComponent(gameName)}`
  const res = await fetch(url, { headers: strategyWikiHeaders(ua) })
  if (!res.ok) throw new Error(`opensearch ${res.status}`)
  const body = (await res.json()) as OpenSearchResponse
  const titles = body[1] ?? []
  const target = normalize(gameName)
  return (
    titles.find((t) => normalize(t) === target) ??
    titles.find((t) => normalize(t).startsWith(target)) ??
    titles[0] ??
    null
  )
}

async function listCandidateFiles(pageTitle: string, ua: string): Promise<string[]> {
  const titles = `${pageTitle}|${pageTitle}/Maps`
  const url =
    `${STRATEGYWIKI_API}?action=query&format=json&prop=images&imlimit=200` +
    `&titles=${encodeURIComponent(titles)}`
  const res = await fetch(url, { headers: strategyWikiHeaders(ua) })
  if (!res.ok) throw new Error(`prop=images ${res.status}`)
  const body = (await res.json()) as ImagesResponse
  const out = new Set<string>()
  for (const page of Object.values(body.query?.pages ?? {})) {
    if (page.missing !== undefined) continue
    for (const img of page.images ?? []) {
      if (img.title) out.add(img.title)
    }
  }
  return [...out].filter(looksLikeMapFile)
}

const MAP_FILENAME_RE = /(map|maps|world|overworld|atlas|continent)/i
const NEGATIVE_FILENAME_RE = /(icon|logo|button|hud|portrait|cover|box|wiki)/i

function looksLikeMapFile(title: string): boolean {
  if (NEGATIVE_FILENAME_RE.test(title)) return false
  if (!MAP_FILENAME_RE.test(title)) return false
  return /\.(png|jpe?g|webp)$/i.test(title)
}

async function pickBestImage(
  files: string[],
  gameName: string,
  slug: string,
  ua: string,
): Promise<ResolvedFile | null> {
  const titles = files.slice(0, 50).join('|')
  const url =
    `${STRATEGYWIKI_API}?action=query&format=json&prop=imageinfo` +
    `&iiprop=url|size|mime|extmetadata&iiurlwidth=2048` +
    `&titles=${encodeURIComponent(titles)}`
  const res = await fetch(url, { headers: strategyWikiHeaders(ua) })
  if (!res.ok) throw new Error(`imageinfo ${res.status}`)
  const body = (await res.json()) as ImageInfoResponse

  let best: ResolvedFile | null = null
  for (const page of Object.values(body.query?.pages ?? {})) {
    const info = page.imageinfo?.[0]
    if (!page.title || !info) continue
    if (info.width < MIN_IMAGE_DIMENSION || info.height < MIN_IMAGE_DIMENSION) continue
    if (info.width * info.height < MIN_IMAGE_AREA) continue

    const score = scoreFile(page.title, info.width, info.height, gameName, slug)
    if (best && score <= best.score) continue
    best = {
      title: page.title,
      url: info.url,
      width: info.width,
      height: info.height,
      license: info.extmetadata?.LicenseShortName?.value ?? '',
      artist: info.extmetadata?.Artist?.value ?? null,
      score,
    }
  }
  return best
}

function scoreFile(
  fileTitle: string,
  width: number,
  height: number,
  gameName: string,
  slug: string,
): number {
  let score = 0
  const lower = fileTitle.toLowerCase()
  const nameToken = normalize(gameName).split(' ').filter((t) => t.length >= 3)
  for (const tok of nameToken) {
    if (lower.includes(tok)) score += 10
  }
  if (lower.includes(slug.replace(/-/g, '_'))) score += 8
  if (/world[_\s-]?map/.test(lower)) score += 30
  if (/overworld/.test(lower)) score += 20
  if (/atlas/.test(lower)) score += 15
  if (/_map\b/.test(lower) || /_maps\b/.test(lower)) score += 5

  const ar = width / height
  if (ar >= 0.6 && ar <= 2.4) score += 10
  else score -= 15

  score += Math.min(20, Math.log10(width * height) * 2)
  return score
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

async function tombstone(gameId: number, reason: string): Promise<void> {
  const attempt =
    (await geoIngestFailureRepository.getAttemptCount(gameId, 'strategywiki')) + 1
  await geoIngestFailureRepository.record({
    gameId,
    source: 'strategywiki',
    reason,
    retryAfter: tombstoneRetryAfter(attempt),
  })
}
