import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import {
  SITE_CATEGORY as CANONICAL_CATEGORY,
  SITE_NAME as CANONICAL_NAME,
  SITE_TAGLINE as CANONICAL_TAGLINE,
} from '@the-box/types'
import { SITE_CATEGORY, SITE_NAME, SITE_TAGLINE } from './brand'

// The product shipped seven tagline literals for six different promises before
// docs/brand.md existed. Four copies still have to exist — @the-box/types (the
// canonical one, read by the backend's OG cards), src/lib/brand.ts (the types
// package compiles to CommonJS, so Rollup cannot re-export its values),
// index.html and the PWA manifest (both read before types is built). This
// suite is what keeps all four identical, and what stops an eighth variant
// from being written into a component.

const here = path.dirname(fileURLToPath(import.meta.url))
const frontendRoot = path.resolve(here, '../..')
const repoRoot = path.resolve(frontendRoot, '../..')

const read = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf-8')

/** Tagline and category variants retired by docs/brand.md. */
const RETIRED = [
  'Daily Video Game Guessing Challenge',
  'Identify video games from screenshots',
  'Guess the game from a screenshot',
  'Guess video games from screenshots',
  "Devinez le jeu à partir d'une capture d'écran",
  'Devinez des jeux vidéo à partir de screenshots',
]

/** Every file allowed to carry a brand string, literal or not. */
const BRAND_SURFACES = [
  'packages/frontend/index.html',
  'packages/frontend/vite.config.ts',
  'packages/frontend/src/lib/seo.ts',
  'packages/frontend/src/components/RouteSeo.tsx',
  'packages/backend/src/presentation/routes/og.routes.ts',
  'packages/marketing-video/src/scenes/IntroScene.tsx',
]

describe('brand contract', () => {
  test('the frontend copy has not drifted from the canonical constants', () => {
    assert.equal(SITE_NAME, CANONICAL_NAME)
    assert.deepEqual(SITE_TAGLINE, CANONICAL_TAGLINE)
    assert.deepEqual(SITE_CATEGORY, CANONICAL_CATEGORY)
  })

  test('the pre-JS shell serves the canonical category line and tagline', () => {
    const html = read('packages/frontend/index.html')

    assert.match(html, new RegExp(`<title>${escapeRe(SITE_CATEGORY.fr)}</title>`))
    assert.ok(
      html.includes(SITE_TAGLINE.fr),
      'index.html must open its meta description with the canonical tagline',
    )
    assert.ok(html.includes(`og:title" content="${SITE_CATEGORY.fr}"`))
  })

  test('the PWA manifest mirrors the same constants', () => {
    const config = read('packages/frontend/vite.config.ts')

    assert.ok(
      config.includes(`name: '${SITE_CATEGORY.fr}'`),
      'manifest.name must equal SITE_CATEGORY.fr',
    )
    assert.ok(
      config.includes(`description: '${SITE_TAGLINE.fr}'`),
      'manifest.description must equal SITE_TAGLINE.fr',
    )
    assert.ok(config.includes(`short_name: '${SITE_NAME}'`))
  })

  test('no retired tagline variant survives on a brand surface', () => {
    for (const rel of BRAND_SURFACES) {
      const contents = read(rel)
      for (const variant of RETIRED) {
        assert.ok(
          !contents.includes(variant),
          `${rel} still carries the retired tagline "${variant}" — use SITE_TAGLINE / SITE_CATEGORY instead (docs/brand.md)`,
        )
      }
    }
  })

  test('both locales are filled for every brand constant', () => {
    for (const [key, value] of Object.entries({ SITE_TAGLINE, SITE_CATEGORY })) {
      for (const lang of ['fr', 'en'] as const) {
        assert.ok(
          value[lang] && value[lang].trim().length > 0,
          `${key}.${lang} must not be empty`,
        )
      }
    }
  })
})

function escapeRe(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
