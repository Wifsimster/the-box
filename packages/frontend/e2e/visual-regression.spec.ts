/**
 * Visual Regression Baselines (Sprint 0 of shadcn migration)
 *
 * Captures screenshot baselines for the surfaces most likely to drift during
 * the shadcn migration. Runs during CI after each migration PR; breaks loud
 * when token values or component variants shift.
 *
 * First run: `npm run test:e2e:visual:update` to establish baselines.
 * Subsequent runs: `npm run test:e2e:visual` (diffs against committed PNGs).
 *
 * Guard rails:
 * - `maxDiffPixelRatio: 0.01` (1%) tolerates font-rendering jitter across
 *   environments without hiding token regressions.
 * - Animations are disabled to keep snapshots deterministic.
 * - Viewport is fixed to 1280×720 desktop — mobile snapshots are a future
 *   addition once Sprint 1 touches responsive primitives.
 */
import { test as authTest } from './fixtures/auth.fixture'
import { test as base, expect } from '@playwright/test'

// These baselines are captured at a fixed 1280×720 desktop viewport and stored
// per-platform as *-chromium-linux.png. They are meaningless under the Mobile
// Chrome project (which would demand its own baselines), so skip them there.
base.beforeEach(({}, testInfo) => {
  base.skip(
    testInfo.project.name !== 'chromium',
    'Visual baselines are desktop chromium @1280×720 only.',
  )
})
authTest.beforeEach(({}, testInfo) => {
  authTest.skip(
    testInfo.project.name !== 'chromium',
    'Visual baselines are desktop chromium @1280×720 only.',
  )
})

const VIEWPORT = { width: 1280, height: 720 }
const SNAPSHOT_OPTIONS = {
  maxDiffPixelRatio: 0.01,
  animations: 'disabled' as const,
  // Mask volatile regions (countdowns, timestamps, rotating avatars) as they
  // surface during migrations. Empty by default.
  mask: [] as Array<import('@playwright/test').Locator>,
}

async function prepare(page: import('@playwright/test').Page) {
  await page.setViewportSize(VIEWPORT)
  // Force reduced-motion so skeletons and hover glows don't flicker between
  // runs. Our index.css honours the preference globally.
  await page.emulateMedia({ reducedMotion: 'reduce' })
}

// Web fonts load asynchronously; screenshotting before they swap in renders
// text in the fallback face and produces large pixel diffs that flake the
// baseline. Wait for the font set to settle before every capture.
async function settle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
  // Wait for the web fonts to load AND for the resulting reflow to paint —
  // fonts.ready can resolve a frame before the layout settles, which shifted
  // the (vertically-centered) login card ~16px between runs and flaked the
  // diff. The double rAF guarantees a painted frame after the font swap.
  await page.evaluate(
    () =>
      document.fonts.ready.then(
        () =>
          new Promise<void>((resolve) =>
            requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
          ),
      ),
  )
  await page.waitForTimeout(250)
}

base.describe('visual regression — public surfaces', () => {
  base('Home @ 1280×720', async ({ page }) => {
    await prepare(page)
    await page.goto('/en')
    await settle(page)
    await expect(page).toHaveScreenshot('home.png', SNAPSHOT_OPTIONS)
  })

  base('Login @ 1280×720', async ({ page }) => {
    await prepare(page)
    await page.goto('/en/login')
    await page.waitForSelector('form')
    await settle(page)
    await expect(page).toHaveScreenshot('login.png', SNAPSHOT_OPTIONS)
  })

  base('Leaderboard @ 1280×720', async ({ page }) => {
    await prepare(page)
    await page.goto('/en/leaderboard')
    await settle(page)
    await expect(page).toHaveScreenshot('leaderboard.png', SNAPSHOT_OPTIONS)
  })
})

authTest.describe('visual regression — authenticated surfaces', () => {
  authTest('Profile @ 1280×720', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize(VIEWPORT)
    await authenticatedPage.emulateMedia({ reducedMotion: 'reduce' })
    await authenticatedPage.goto('/en/profile')
    await settle(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot('profile.png', SNAPSHOT_OPTIONS)
  })

  // Game surface: capture the intro screen rather than an in-progress position,
  // since in-game state (screenshot, timer, score) is not deterministic enough
  // for pixel diffing. Sprint 1 may add mid-game snapshots with masking once
  // ResultCard/TierIntro migrate to shadcn Card and stabilise.
  authTest('Game intro @ 1280×720', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize(VIEWPORT)
    await authenticatedPage.emulateMedia({ reducedMotion: 'reduce' })
    await authenticatedPage.goto('/en/play')
    await settle(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot('game-intro.png', SNAPSHOT_OPTIONS)
  })
})
