/**
 * Admin User Fixture
 *
 * Provides a page already logged in as the E2E admin user.
 * Uses Playwright's test.extend() pattern for fixture reuse.
 *
 * Usage:
 *   import { test, expect } from './fixtures/admin.fixture'
 *   test('my admin test', async ({ adminPage }) => {
 *     // adminPage is already logged in as admin
 *   })
 */

import { test as base, expect, type Page } from '@playwright/test'
import { closeDailyRewardModal } from '../helpers/game-helpers'

// E2E Admin User Credentials (must match e2e-seed.ts)
export const E2E_ADMIN_EMAIL = 'e2e_admin@test.local'
export const E2E_ADMIN_PASSWORD = 'test123'

/**
 * Log in as the E2E admin user
 */
async function loginAsE2EAdmin(page: Page): Promise<void> {
  await page.goto('/en/login')
  await page.waitForSelector('form')

  // Fill email
  const emailInput = page.getByPlaceholder(/you@example.com|email|username/i)
  await emailInput.click()
  await emailInput.fill('')
  await emailInput.fill(E2E_ADMIN_EMAIL)
  await page.waitForTimeout(100)

  // Fill password
  const passwordInput = page.locator('input[type="password"]').first()
  await passwordInput.click()
  await passwordInput.fill('')
  await passwordInput.fill(E2E_ADMIN_PASSWORD)
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
      throw new Error(`E2E admin login failed: ${errorText}`)
    }
    throw new Error('E2E admin login did not redirect - check credentials and e2e-seed')
  }

  // Close Daily Reward modal if it appears
  await closeDailyRewardModal(page)
}

// Extend the base test with admin fixture
export const test = base.extend<{ adminPage: Page }>({
  adminPage: async ({ page }, use) => {
    // Log in as admin before the test
    await loginAsE2EAdmin(page)

    // Provide the admin page to the test
    await use(page)
  },
})

export { expect }
