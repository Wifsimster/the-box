/**
 * Authenticated User Fixture
 *
 * Provides a page already logged in as the E2E test user.
 * Uses Playwright's test.extend() pattern for fixture reuse.
 *
 * Usage:
 *   import { test, expect } from './fixtures/auth.fixture'
 *   test('my authenticated test', async ({ authenticatedPage }) => {
 *     // authenticatedPage is already logged in
 *   })
 */

import { test as base, expect, type Page } from '@playwright/test'
import { closeDailyRewardModal } from '../helpers/game-helpers'

// E2E Test User Credentials (must match e2e-seed.ts)
export const E2E_USER_EMAIL = 'e2e_user@test.local'
export const E2E_USER_PASSWORD = 'test123'

/**
 * Log in as the standard E2E test user
 */
async function loginAsE2EUser(page: Page): Promise<void> {
  await page.goto('/en/login')
  await page.waitForSelector('form')

  // Fill email
  const emailInput = page.getByPlaceholder(/you@example.com|email|username/i)
  await emailInput.click()
  await emailInput.fill('')
  await emailInput.fill(E2E_USER_EMAIL)
  await page.waitForTimeout(100)

  // Fill password
  const passwordInput = page.locator('input[type="password"]').first()
  await passwordInput.click()
  await passwordInput.fill('')
  await passwordInput.fill(E2E_USER_PASSWORD)
  await page.waitForTimeout(100)

  // Submit
  const loginButton = page.getByRole('button', { name: /login|sign in/i })
  await loginButton.waitFor({ state: 'visible', timeout: 5000 })
  await page.waitForTimeout(300)
  await loginButton.click()
  await page.waitForTimeout(3000)

  // Verify login succeeded
  const currentUrl = page.url()
  if (currentUrl.includes('/login')) {
    const errorElement = page.locator('[role="alert"], p.text-destructive').first()
    const errorVisible = await errorElement.isVisible().catch(() => false)
    if (errorVisible) {
      const errorText = await errorElement.textContent()
      throw new Error(`E2E login failed: ${errorText}`)
    }
    throw new Error('E2E login did not redirect - check credentials and e2e-seed')
  }

  // Close Daily Reward modal if it appears
  await closeDailyRewardModal(page)
}

// Extend the base test with authenticated fixture
export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    // Log in before the test
    await loginAsE2EUser(page)

    // Provide the authenticated page to the test
    await use(page)
  },
})

export { expect }
