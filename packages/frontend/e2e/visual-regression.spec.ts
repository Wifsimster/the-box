import { test as authTest } from './fixtures/auth.fixture'
import { test as base, expect } from '@playwright/test'

// eslint-disable-next-line no-empty-pattern
base.beforeEach(({}, testInfo) => {
  base.skip(
    testInfo.project.name !== 'chromium',
    'Visual baselines are desktop chromium @1280×720 only.',
  )
})
// eslint-disable-next-line no-empty-pattern
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
  mask: [] as Array<import('@playwright/test').Locator>,
}

async function prepare(page: import('@playwright/test').Page) {
  await page.setViewportSize(VIEWPORT)
  await page.emulateMedia({ reducedMotion: 'reduce' })
}

async function settle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle')
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

  authTest('Game intro @ 1280×720', async ({ authenticatedPage }) => {
    await authenticatedPage.setViewportSize(VIEWPORT)
    await authenticatedPage.emulateMedia({ reducedMotion: 'reduce' })
    await authenticatedPage.goto('/en/play')
    await settle(authenticatedPage)
    await expect(authenticatedPage).toHaveScreenshot('game-intro.png', SNAPSHOT_OPTIONS)
  })
})
