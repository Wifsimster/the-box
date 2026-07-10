/**
 * Geo vision-localization accuracy study (issue #331, phase 5).
 *
 * Before agent_vision pins are allowed to vote (even downweighted), we have to
 * know whether the model can actually localize a screenshot on a game map. This
 * offline harness samples promoted metas (known ground truth), asks a vision
 * model to place each screenshot on its map, and scores the predictions against
 * the enable bar (`domain/services/geo-vision-eval.service.ts`).
 *
 * It does NOT flip any flag — it prints the numbers a human signs off on before
 * setting GEO_AGENT_VISION_ENABLED=true. Exits non-zero if the bar isn't met so
 * a pipeline can gate on it.
 *
 * Usage (from packages/backend):
 *   ANTHROPIC_API_KEY=... npm run eval:geo-vision            # 50 samples
 *   ANTHROPIC_API_KEY=... npm run eval:geo-vision -- 30      # N samples
 *   GEO_VISION_EVAL_MODEL=<model-id> ... npm run eval:geo-vision
 *
 * Requires DB access (samples ground truth) and an Anthropic API key. The model
 * is configurable via GEO_VISION_EVAL_MODEL; it must be vision-capable.
 */
import Anthropic from '@anthropic-ai/sdk'
import type { GeoPoint } from '@the-box/types'
import { db } from '../src/infrastructure/database/connection.js'
import {
  parseVisionPoint,
  summarizeVisionEval,
  VISION_ENABLE_MAX_MEDIAN_DISTANCE,
  VISION_ENABLE_MIN_WITHIN_RADIUS,
  type VisionEvalSample,
} from '../src/domain/services/geo-vision-eval.service.js'

// Configurable so an operator can point the study at whichever vision-capable
// model they intend to run in production. Kept out of source as a literal.
const MODEL = process.env['GEO_VISION_EVAL_MODEL'] || 'claude-sonnet-5'

const PROMPT =
  'You are given two images: first the FULL MAP of a video game, then a SCREENSHOT ' +
  'captured somewhere in that game world. Estimate where on the map the screenshot ' +
  'was taken. Reply with ONLY a JSON object {"x": <0..1>, "y": <0..1>} where x is the ' +
  'horizontal fraction from the left (0) to right (1) edge of the map image and y the ' +
  'vertical fraction from the top (0) to bottom (1). No prose, no code fences.'

type MediaType = 'image/png' | 'image/jpeg' | 'image/gif' | 'image/webp'

interface GroundTruthRow {
  canonical_x: number
  canonical_y: number
  screenshot_url: string
  map_url: string
  radius: number
}

async function fetchImage(url: string): Promise<{ data: string; mediaType: MediaType } | null> {
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    const ct = (res.headers.get('content-type') || '').toLowerCase()
    const mediaType: MediaType = ct.includes('png')
      ? 'image/png'
      : ct.includes('webp')
        ? 'image/webp'
        : ct.includes('gif')
          ? 'image/gif'
          : 'image/jpeg'
    return { data: buf.toString('base64'), mediaType }
  } catch {
    return null
  }
}

async function localize(
  client: Anthropic,
  map: { data: string; mediaType: MediaType },
  shot: { data: string; mediaType: MediaType },
): Promise<GeoPoint | null> {
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 200,
    messages: [
      {
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image', source: { type: 'base64', media_type: map.mediaType, data: map.data } },
          { type: 'image', source: { type: 'base64', media_type: shot.mediaType, data: shot.data } },
        ],
      },
    ],
  })
  const text = resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
  return parseVisionPoint(text)
}

async function main(): Promise<void> {
  const sampleSize = Math.max(1, Number(process.argv[2]) || 50)
  if (!process.env['ANTHROPIC_API_KEY']) {
    console.error('ANTHROPIC_API_KEY is not set — cannot run the vision study.')
    process.exitCode = 2
    return
  }

  const result = await db.raw<{ rows: GroundTruthRow[] }>(
    `
    SELECT
      m.canonical_x,
      m.canonical_y,
      c.image_url AS screenshot_url,
      map.image_url AS map_url,
      COALESCE(map.consensus_radius, 0.03) AS radius
    FROM geo_screenshot_meta m
    JOIN geo_screenshot_candidate c ON c.id = m.geo_screenshot_candidate_id
    JOIN geo_map map ON map.id = m.geo_map_id
    WHERE c.is_active = true
      AND map.image_url IS NOT NULL
      AND c.image_url IS NOT NULL
    ORDER BY RANDOM()
    LIMIT ?
    `,
    [sampleSize],
  )
  const rows = (result as unknown as { rows: GroundTruthRow[] }).rows

  if (rows.length === 0) {
    console.error('No promoted metas with a flat map image found — nothing to evaluate.')
    process.exitCode = 1
    return
  }

  console.log(`Model: ${MODEL} · sampling ${rows.length} promoted metas\n`)

  const client = new Anthropic()
  const samples: VisionEvalSample[] = []
  let failures = 0

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    process.stdout.write(`[${i + 1}/${rows.length}] `)
    const [mapImg, shotImg] = await Promise.all([
      fetchImage(row.map_url),
      fetchImage(row.screenshot_url),
    ])
    if (!mapImg || !shotImg) {
      failures++
      console.log('image fetch failed')
      continue
    }
    let predicted: GeoPoint | null = null
    try {
      predicted = await localize(client, mapImg, shotImg)
    } catch (err) {
      console.log(`vision error: ${String(err)}`)
    }
    if (!predicted) {
      failures++
      console.log('no usable localization')
      continue
    }
    samples.push({
      predicted,
      truth: { x: Number(row.canonical_x), y: Number(row.canonical_y) },
      radius: Number(row.radius),
    })
    console.log(`ok (${predicted.x.toFixed(2)}, ${predicted.y.toFixed(2)})`)
  }

  const summary = summarizeVisionEval(samples)
  const attempts = samples.length + failures
  const usableRate = attempts > 0 ? samples.length / attempts : 0

  // The gate is conservative: the geometric bar must pass on the usable
  // predictions AND the model must actually produce a usable answer most of
  // the time (a model that fails to localize half the screenshots is not
  // trustworthy even if its hits are good).
  const verdict = summary.pass && usableRate >= 0.8

  console.log('\n──────── vision localization study ────────')
  console.log(`samples (usable):        ${summary.count}`)
  console.log(`fetch/parse failures:    ${failures}`)
  console.log(`usable rate:             ${(usableRate * 100).toFixed(1)}%  (need ≥ 80%)`)
  console.log(
    `within consensus radius: ${(summary.withinRadiusPct * 100).toFixed(1)}%  (need ≥ ${(VISION_ENABLE_MIN_WITHIN_RADIUS * 100).toFixed(0)}%)`,
  )
  console.log(
    `median normalized dist:  ${summary.medianNormalizedDistance.toFixed(3)}  (need < ${VISION_ENABLE_MAX_MEDIAN_DISTANCE})`,
  )
  console.log(`within 0.1 normalized:   ${(summary.within01Pct * 100).toFixed(1)}%`)
  console.log(`\nVERDICT: ${verdict ? 'PASS ✅ — vision is good enough to enable as a downweighted voter' : 'FAIL ❌ — keep GEO_AGENT_VISION_ENABLED=false (structured-only)'}`)
  console.log('Publish these numbers in the PR that enables GEO_AGENT_VISION_ENABLED.\n')

  process.exitCode = verdict ? 0 : 1
}

main()
  .catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
  .finally(() => {
    void db.destroy()
  })
