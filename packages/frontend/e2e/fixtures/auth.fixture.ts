import { test as base, expect, type Page } from '@playwright/test'
import { closeDailyRewardModal } from '../helpers/game-helpers'

export const E2E_USER_EMAIL = 'e2e_user@test.local'
export const E2E_USER_PASSWORD = 'test123'

async function loginAsE2EUser(page: Page): Promise<void> {
  const authResponses: { url: string; status: number; body: string }[] = []
  page.on('response', async (response) => {
    if (response.url().includes('/api/auth')) {
      try {
        const body = await response.text().catch(() => 'unable to read body')
        authResponses.push({ url: response.url(), status: response.status(), body })
      } catch {
        authResponses.push({ url: response.url(), status: response.status(), body: 'error reading' })
      }
    }
  })

  await page.goto('/en/login')
  await page.waitForSelector('form')

  const emailInput = page.getByPlaceholder(/you@example.com|email|username/i)
  await emailInput.click()
  await emailInput.fill('')
  await emailInput.fill(E2E_USER_EMAIL)
  await page.waitForTimeout(100)

  const passwordInput = page.locator('input[type="password"]').first()
  await passwordInput.click()
  await passwordInput.fill('')
  await passwordInput.fill(E2E_USER_PASSWORD)
  await page.waitForTimeout(100)

  const loginButton = page.getByRole('button', { name: /^(log ?in|sign in)$/i })
  await loginButton.waitFor({ state: 'visible', timeout: 5000 })
  await page.waitForTimeout(300)
  await loginButton.click()
  await page.waitForTimeout(3000)

  const currentUrl = page.url()
  if (currentUrl.includes('/login')) {
    const errorSelector = '[class*="text-destructive"], [class*="bg-destructive"], [role="alert"]'
    const errorElement = page.locator(errorSelector).first()
    const errorVisible = await errorElement.isVisible().catch(() => false)
    if (errorVisible) {
      const errorText = await errorElement.textContent()
      throw new Error(`E2E login failed: ${errorText}`)
    }
    const authInfo = authResponses.length > 0
      ? `\nAuth API responses:\n${authResponses.map(r => `  ${r.status} ${r.url}\n  Body: ${r.body.slice(0, 200)}`).join('\n')}`
      : '\nNo auth API responses captured'
    throw new Error(`E2E login did not redirect - check credentials and e2e-seed${authInfo}`)
  }

  await closeDailyRewardModal(page)
}

export const test = base.extend<{ authenticatedPage: Page }>({
  authenticatedPage: async ({ page }, use) => {
    await loginAsE2EUser(page)

    // eslint-disable-next-line react-hooks/rules-of-hooks
    await use(page)
  },
})

export { expect }
