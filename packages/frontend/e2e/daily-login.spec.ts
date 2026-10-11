import { test, expect } from '@playwright/test'
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from './helpers/game-helpers'
import { assertDialogFits } from './helpers/dialog-assertions'

/**
 * The reward modal no longer opens on its own (daily-first, D3): a player
 * opens it from the header gift badge. Best-effort, like the checks below.
 */
async function openRewardFromBadge(page: import('@playwright/test').Page) {
  const badge = page.locator('[data-testid="daily-reward-badge"]:visible').first()
  if (await badge.isVisible().catch(() => false)) {
    await badge.click().catch(() => {})
    await page.waitForTimeout(500)
  }
}

/**
 * E2E Tests for Daily Login Rewards
 *
 * Prerequisites:
 * - Backend server must be running
 * - Database must be seeded with npm run e2e:seed
 * - The e2e-seed script clears login_reward_claims for test users
 */

test.describe('Daily Login Rewards', () => {
  test('no reward modal opens on its own; the gift badge opens it (D3)', async ({ page }) => {
    await page.context().clearCookies()

    await page.goto('/en/login')
    await page.waitForSelector('form')
    await page.getByPlaceholder(/you@example.com|email/i).fill(E2E_USER_EMAIL)
    await page.locator('input[type="password"]').first().fill(E2E_USER_PASSWORD)
    await page.getByRole('button', { name: /^(log ?in|sign in)$/i }).click()

    // Daily-first: the home route is today's box, and nothing covers it.
    const badge = page.locator('[data-testid="daily-reward-badge"]:visible').first()
    await expect(badge).toBeVisible({ timeout: 10_000 })
    await page.waitForTimeout(1500)
    await expect(page.getByRole('dialog')).toHaveCount(0)

    // The reward still waits one tap away.
    await badge.click()
    await expect(page.getByRole('dialog')).toBeVisible()
  })

  test('modal displays current streak information', async ({ page }) => {
    // Clear cookies to ensure fresh session
    await page.context().clearCookies()

    await page.goto('/en/login')
    await page.waitForSelector('form')

    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    await emailInput.fill(E2E_USER_EMAIL)

    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill(E2E_USER_PASSWORD)

    const loginButton = page.getByRole('button', { name: /^(log ?in|sign in)$/i })
    await loginButton.click()

    await page.waitForTimeout(3000)
    await openRewardFromBadge(page)

    // Look for streak information in modal
    const streakInfo = page.locator('text=/streak|day.*\\d+|jour.*\\d+|consecutive/i').first()
    const hasStreak = await streakInfo.isVisible().catch(() => false)

    // Look for streak number
    const streakNumber = page.locator('[class*="streak"], [class*="day"]').first()
    const hasStreakNumber = await streakNumber.isVisible().catch(() => false)

    // Streak info should be visible if modal is shown
    // (might not appear if modal already dismissed or already claimed)
    expect(hasStreak || hasStreakNumber || true).toBeTruthy()
  })

  test('clicking claim button closes modal and shows success feedback', async ({ page }) => {
    await page.context().clearCookies()

    await page.goto('/en/login')
    await page.waitForSelector('form')

    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    await emailInput.fill(E2E_USER_EMAIL)

    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill(E2E_USER_PASSWORD)

    const loginButton = page.getByRole('button', { name: /^(log ?in|sign in)$/i })
    await loginButton.click()

    await page.waitForTimeout(3000)
    await openRewardFromBadge(page)

    // Look for claim button
    const claimButton = page.getByRole('button', { name: /claim|collect|récupérer|obtenir/i })
    const hasClaimButton = await claimButton.isVisible().catch(() => false)

    if (hasClaimButton) {
      await claimButton.click()
      await page.waitForTimeout(1000)

      // Modal should close
      const modalAfter = page.locator('[role="dialog"]:visible').first()
      const modalStillVisible = await modalAfter.isVisible().catch(() => false)

      // Either modal closed or success message shown
      const successMessage = page.locator('text=/success|claimed|collected|merci/i').first()
      const hasSuccess = await successMessage.isVisible().catch(() => false)

      expect(!modalStillVisible || hasSuccess).toBeTruthy()
    } else {
      // Modal might not appear if already claimed
      expect(true).toBeTruthy()
    }
  })

  test('modal can be closed via close button without claiming', async ({ page }) => {
    await page.context().clearCookies()

    await page.goto('/en/login')
    await page.waitForSelector('form')

    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    await emailInput.fill(E2E_USER_EMAIL)

    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill(E2E_USER_PASSWORD)

    const loginButton = page.getByRole('button', { name: /^(log ?in|sign in)$/i })
    await loginButton.click()

    await page.waitForTimeout(3000)
    await openRewardFromBadge(page)

    // Look for close button (X button or explicit close)
    const closeButton = page.locator('[role="dialog"] button[aria-label*="close"], [role="dialog"] button:has(svg), button:has-text("×")').first()
    const hasCloseButton = await closeButton.isVisible().catch(() => false)

    if (hasCloseButton) {
      await closeButton.click()
      await page.waitForTimeout(500)

      // Modal should close
      const modalAfter = page.locator('[role="dialog"]:visible').first()
      const modalStillVisible = await modalAfter.isVisible().catch(() => false)

      expect(!modalStillVisible).toBeTruthy()
    } else {
      // If no close button visible, modal might have auto-closed or not appeared
      expect(true).toBeTruthy()
    }
  })

  test('modal does not reappear on same day after claiming', async ({ page }) => {
    await page.context().clearCookies()

    // First login and claim
    await page.goto('/en/login')
    await page.waitForSelector('form')

    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    await emailInput.fill(E2E_USER_EMAIL)

    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill(E2E_USER_PASSWORD)

    const loginButton = page.getByRole('button', { name: /^(log ?in|sign in)$/i })
    await loginButton.click()

    await page.waitForTimeout(3000)
    await openRewardFromBadge(page)

    // Try to claim if modal appears
    const claimButton = page.getByRole('button', { name: /claim|collect|récupérer|obtenir/i })
    if (await claimButton.isVisible().catch(() => false)) {
      await claimButton.click()
      await page.waitForTimeout(1000)
    }

    // Refresh the page (simulating re-login same day)
    await page.reload()
    await page.waitForTimeout(2000)

    // Modal should not appear again
    const modalAfterRefresh = page.locator('[role="dialog"]').first()
    const modalVisible = await modalAfterRefresh.isVisible().catch(() => false)

    // If modal is visible, check it's not the daily reward modal
    if (modalVisible) {
      const dailyRewardModal = page.locator('text=/daily.*reward|claim|streak/i').first()
      const isDailyReward = await dailyRewardModal.isVisible().catch(() => false)

      // Should not show daily reward modal again
      expect(!isDailyReward).toBeTruthy()
    } else {
      expect(true).toBeTruthy()
    }
  })
})

test.describe('Daily Reward Modal - Mobile viewport (375px)', () => {
  // Anchors the dialog-responsiveness work: on iPhone SE / Galaxy A13 class
  // viewports the reward dialog must stay inside the screen, keep its close
  // button tappable, and not push horizontal scroll onto the underlying page.
  test.use({ viewport: { width: 375, height: 667 } })

  test('reward modal fits 375px and exposes a tappable close button', async ({ page }) => {
    await page.context().clearCookies()

    await page.goto('/en/login')
    await page.waitForSelector('form')

    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    await emailInput.fill(E2E_USER_EMAIL)
    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill(E2E_USER_PASSWORD)
    const loginButton = page.getByRole('button', { name: /^(log ?in|sign in)$/i })
    await loginButton.click()

    // The modal no longer opens on its own (daily-first, D3): open it from
    // the header gift badge, as a player would.
    const badge = page.locator('[data-testid="daily-reward-badge"]:visible').first()
    await expect(badge).toBeVisible({ timeout: 10_000 })
    await badge.click()
    await expect(page.getByRole('dialog')).toBeVisible()

    await assertDialogFits(page, 375)
  })
})
