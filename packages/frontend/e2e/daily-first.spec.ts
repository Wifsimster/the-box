import { test, expect, type Page } from '@playwright/test'
import { loginAsUser } from './helpers/game-helpers'
import { runtimeFeatures } from './helpers/features'

/**
 * Daily-first home (PR #411 decisions D1–D9).
 *
 * The home route is today's box: the first screenshot shows blurred behind a
 * single button, one tap starts the game in place, and nothing (account
 * gate, guided tour, reward modal) stands in between. The former landing page
 * lives on /about.
 */

const OPEN_BOX = '[data-testid="today-open-box"]'
const GUESS_INPUT = 'input[placeholder="Game name..."]'

/** Fails if any dialog is on screen: the path to the first guess is clear. */
async function expectNoDialog(page: Page) {
  await page.waitForTimeout(1500)
  await expect(page.getByRole('dialog')).toHaveCount(0)
}

test.describe('Daily-first — guest', () => {
  test('one tap opens the blurred box and shows the first screenshot (D1, D2, D8)', async ({ page }) => {
    await page.goto('/en')

    const open = page.locator(OPEN_BOX)
    await expect(open).toBeVisible({ timeout: 15_000 })
    await expect(open).toHaveText(/open today.s box/i)

    // The teaser is today's first screenshot, blurred: the 45 s clock only
    // starts on the tap.
    const preview = page.getByTestId('today-box-preview').locator('img').first()
    await expect(preview).toHaveAttribute('src', '/api/game/preview/image')
    await expect(preview).toHaveClass(/blur-/)
    // Even with reduced motion, which un-blurs other images: the blur here
    // is fairness, not an animation.
    await page.emulateMedia({ reducedMotion: 'reduce' })
    await expect
      .poll(() => preview.evaluate((el) => getComputedStyle(el).filter))
      .toMatch(/blur\((?!0px)/)

    // No guided tour, no account gate, no reward modal.
    await expectNoDialog(page)

    await open.click()

    // Still on the home route: the game runs in place, the guest has a
    // session, and no "create an account" wall came up.
    await expect(page.locator(GUESS_INPUT)).toBeVisible({ timeout: 15_000 })
    await expect(page).toHaveURL(/\/en\/?$/)
    await expect(page.getByRole('dialog')).toHaveCount(0)
  })

  test('/about keeps the former landing page and links back to the box (D7)', async ({ page }) => {
    await page.goto('/en/about')
    await expect(page.getByRole('heading', { level: 1, name: 'One screenshot. One guess.' })).toBeVisible({
      timeout: 15_000,
    })
    await page.getByRole('button', { name: /open today.s box/i }).first().click()
    await expect(page).toHaveURL(/\/en\/?$/)
    await expect(page.locator(OPEN_BOX)).toBeVisible({ timeout: 15_000 })
  })

  test('Results tab lists the daily and monthly rankings only (D9)', async ({ page }) => {
    await page.goto('/en/leaderboard')
    const tabs = page.getByRole('tab')
    await expect(tabs).toHaveCount(2, { timeout: 15_000 })
    await expect(tabs.nth(0)).toHaveText(/daily/i)
    await expect(tabs.nth(1)).toHaveText(/monthly/i)

    // Deep links to the demoted boards still work.
    await page.goto('/en/leaderboard?tab=achievements')
    await expect(page.getByRole('tab')).toHaveCount(3, { timeout: 15_000 })
  })
})

test.describe('Daily-first — navigation', () => {
  test('primary nav is Today + Results; Premium and Panorama are not in it (D4, D5, D9)', async ({ page, isMobile }) => {
    const features = await runtimeFeatures(page.request)
    await page.goto('/en/leaderboard')

    if (isMobile) {
      const bottomNav = page.getByRole('navigation', { name: 'Main navigation' }).last()
      await expect(bottomNav.getByRole('link')).toHaveText([/today/i, /results/i, /profile/i], { timeout: 15_000 })
    } else {
      const primary = page.locator('header').getByRole('navigation', { name: 'Primary navigation' })
      await expect(primary.getByRole('link')).toHaveText([/today/i, /results/i], { timeout: 15_000 })
      // D4: no Premium entry in the desktop top bar.
      await expect(page.locator('header').getByRole('link', { name: /premium/i })).toHaveCount(0)
    }

    // D5: Panorama only where GEOGAMERS_ENABLED is on (footer, drawer).
    const panoramaLinks = page.getByRole('link', { name: /^panorama/i })
    if (features.geogamers) {
      await expect(panoramaLinks.first()).toBeAttached()
    } else {
      await expect(panoramaLinks).toHaveCount(0)
    }
  })
})

test.describe('Daily-first — signed-in player', () => {
  test('lands on the box with no reward modal on top (D3)', async ({ page }) => {
    await loginAsUser(page)
    await page.goto('/en')
    await expectNoDialog(page)

    // Depending on what other specs did with the shared e2e user, today's box
    // is closed, in progress or done; each state is reachable without a modal.
    const closed = page.locator(OPEN_BOX)
    const playing = page.locator(GUESS_INPUT)
    const done = page.getByRole('heading', { name: 'Box opened' })
    await expect(closed.or(playing).or(done).first()).toBeVisible({ timeout: 15_000 })

    // The reward waits behind the header gift badge.
    await expect(page.locator('[data-testid="daily-reward-badge"]:visible').first()).toBeVisible()
  })
})
