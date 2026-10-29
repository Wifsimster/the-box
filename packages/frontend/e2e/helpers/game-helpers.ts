import { Page, expect } from '@playwright/test'

export const E2E_USER_EMAIL = 'e2e_user@test.local'
export const E2E_USER_PASSWORD = 'test123'
export const E2E_ADMIN_EMAIL = 'e2e_admin@test.local'
export const E2E_ADMIN_PASSWORD = 'test123'

export async function closeDailyRewardModal(page: Page) {
  await page.waitForTimeout(500)

  const claimButton = page.getByRole('button', { name: /claim/i }).first()
  if (await claimButton.isVisible().catch(() => false)) {
    await claimButton.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
  }

  const closeButton = page.locator('button').filter({ hasText: /close/i }).first()
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
  }

  const dialogCloseButton = page.locator('[role="dialog"] button[aria-label*="close"], [role="dialog"] button:has(svg)').first()
  if (await dialogCloseButton.isVisible().catch(() => false)) {
    await dialogCloseButton.click({ timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(500)
  }

  await page.keyboard.press('Escape').catch(() => {})
}

export async function loginAsUser(page: Page) {
  await page.goto('/en/login')
  await page.waitForSelector('form')

  const userEmail = process.env.TEST_USER_EMAIL || E2E_USER_EMAIL
  const userPassword = process.env.TEST_USER_PASSWORD || E2E_USER_PASSWORD

  const emailInput = page.getByPlaceholder(/you@example.com|email|username/i)
  await emailInput.click()
  await emailInput.fill('')
  await emailInput.fill(userEmail)
  await page.waitForTimeout(100)

  const passwordInput = page.locator('input[type="password"]').first()
  await passwordInput.click()
  await passwordInput.fill('')
  await passwordInput.fill(userPassword)
  await page.waitForTimeout(100)

  const loginButton = page.getByRole('button', { name: /^(log ?in|sign in)$/i })
  await loginButton.waitFor({ state: 'visible', timeout: 5000 })

  await page.waitForTimeout(300)

  await loginButton.click()
  await page.waitForTimeout(3000)

  const currentUrl = page.url()
  if (currentUrl.includes('/login')) {
    const errorSelector = '[class*="text-destructive"], [class*="bg-destructive"], [role="alert"]'
    const error = await page
      .locator(errorSelector)
      .first()
      .isVisible()
      .catch(() => false)
    if (error) {
      const errorText = await page
        .locator(errorSelector)
        .first()
        .textContent()
      throw new Error(`Login failed: ${errorText}`)
    }
    throw new Error('Login did not redirect - check credentials')
  }

  await closeDailyRewardModal(page)
}

export async function loginAsAdmin(page: Page) {
  await page.goto('/en/login')
  await page.waitForSelector('form')

  const adminEmail = process.env.TEST_ADMIN_EMAIL || E2E_ADMIN_EMAIL
  const adminPassword = process.env.TEST_ADMIN_PASSWORD || E2E_ADMIN_PASSWORD

  const emailInput = page.getByPlaceholder(/you@example.com|email|username/i)
  await emailInput.click()
  await emailInput.fill('')
  await emailInput.fill(adminEmail)
  await page.waitForTimeout(100)

  const passwordInput = page.locator('input[type="password"]').first()
  await passwordInput.click()
  await passwordInput.fill('')
  await passwordInput.fill(adminPassword)
  await page.waitForTimeout(100)

  const loginButton = page.getByRole('button', { name: /^(log ?in|sign in)$/i })
  await loginButton.waitFor({ state: 'visible', timeout: 5000 })

  await page.waitForTimeout(300)

  await loginButton.click()
  await page.waitForTimeout(3000)

  const currentUrl = page.url()
  if (currentUrl.includes('/login')) {
    const errorSelector = '[class*="text-destructive"], [class*="bg-destructive"], [role="alert"]'
    const error = await page
      .locator(errorSelector)
      .first()
      .isVisible()
      .catch(() => false)
    if (error) {
      const errorText = await page
        .locator(errorSelector)
        .first()
        .textContent()
      throw new Error(`Login failed: ${errorText}`)
    }
    throw new Error('Login did not redirect - check credentials')
  }

  await closeDailyRewardModal(page)
}

export async function waitForGameLoad(page: Page) {
  await page.waitForTimeout(1000)

  await closeDailyRewardModal(page)

  const gameLoaded = await Promise.race([
    page.waitForSelector('h1, h2', { timeout: 10000 }).then(() => true).catch(() => false),
    page.waitForSelector('input[type="text"]', { timeout: 10000 }).then(() => true).catch(() => false),
    page.waitForSelector('button:has-text("1")', { timeout: 10000 }).then(() => true).catch(() => false),
  ])

  if (!gameLoaded) {
    await closeDailyRewardModal(page)
  }
}

export async function startDailyGame(page: Page) {
  await closeDailyRewardModal(page)

  const startButton = page.getByTestId('today-open-box')
  const hasStartButton = await startButton.isVisible().catch(() => false)

  if (hasStartButton) {
    await startButton.click()
    await page.waitForTimeout(2000)
    await closeDailyRewardModal(page)
  }
}

export async function navigateToPosition(page: Page, position: number) {
  if (position < 1 || position > 10) {
    throw new Error('Position must be between 1 and 10')
  }

  const dot = page
    .getByRole('button')
    .filter({ hasText: new RegExp(`^${position}$`) })
    .first()

  if (await dot.isVisible()) {
    await dot.click()
    await page.waitForTimeout(500)
  } else {
    throw new Error(`Position ${position} dot not visible`)
  }
}

export async function visitAllPositions(page: Page) {
  for (let i = 1; i <= 10; i++) {
    await navigateToPosition(page, i)
  }
}

export async function submitGuess(page: Page, gameName: string) {
  const gameInput = page.locator('input[type="text"]').first()
  await expect(gameInput).toBeVisible()

  await gameInput.fill(gameName)

  const submitButton = page.getByRole('button', { name: /submit|send|envoyer/i })
  await submitButton.click()

  await page.waitForTimeout(2000)
}

export async function skipScreenshot(page: Page) {
  const skipButton = page.getByRole('button', { name: /skip/i })
  await expect(skipButton).toBeVisible()

  await skipButton.click()
  await page.waitForTimeout(1000)
}

export async function endGame(page: Page, confirm: boolean = true) {
  const endGameButton = page.getByRole('button', { name: /end game|terminer|forfeit/i })
  await expect(endGameButton).toBeVisible({ timeout: 5000 })

  await endGameButton.click()
  await page.waitForTimeout(1000)

  if (confirm) {
    const confirmButton = page.getByRole('button', { name: /confirm|yes|oui/i }).last()
    await confirmButton.click()
    await page.waitForTimeout(3000)
  } else {
    const cancelButton = page.getByRole('button', { name: /cancel|annuler/i }).first()
    await cancelButton.click()
    await page.waitForTimeout(1000)
  }
}

export async function getCurrentScore(page: Page): Promise<number> {
  const scoreText = await page
    .locator('text=/^\\d{1,4}$/')
    .first()
    .textContent()
    .catch(() => '0')

  return parseInt(scoreText || '0', 10)
}

export async function isOnPosition(page: Page, position: number): Promise<boolean> {
  const activeDot = page.locator('button[class*="ring"]').first()
  const activeText = await activeDot.textContent().catch(() => '0')

  return parseInt(activeText || '0', 10) === position
}

export async function revealLetter(page: Page) {
  const revealButton = page.locator('[data-testid=letter-reveal-button]')
  await expect(revealButton).toBeVisible()
  await revealButton.click()
  await page.waitForTimeout(500)
}

export async function registerTestUser(
  page: Page,
  username?: string,
  email?: string,
  password?: string
) {
  const timestamp = Date.now()
  const testUsername = username || `testuser${timestamp}`
  const testEmail = email || `testuser${timestamp}@example.com`
  const testPassword = password || 'TestPass123!'

  await page.goto('/en/register')
  await page.waitForSelector('form')

  await page.getByPlaceholder(/your_username/i).fill(testUsername)
  await page.getByPlaceholder(/you@example.com/i).fill(testEmail)

  const passwordInputs = page.locator('input[type="password"]')
  await passwordInputs.first().fill(testPassword)
  await passwordInputs.nth(1).fill(testPassword)

  await page.getByRole('button', { name: /register|sign up|create account/i }).click()
  await page.waitForTimeout(3000)

  const currentUrl = page.url()
  if (currentUrl.includes('/register')) {
    const error = await page
      .locator('[role="alert"], p.text-destructive')
      .first()
      .isVisible()
      .catch(() => false)
    if (error) {
      const errorText = await page
        .locator('[role="alert"], p.text-destructive')
        .first()
        .textContent()
      throw new Error(`Registration failed: ${errorText}`)
    }
  }

  return { username: testUsername, email: testEmail, password: testPassword }
}

export async function logout(page: Page) {
  const logoutButton = page
    .getByRole('button', { name: /logout|sign out|déconnexion/i })
    .or(page.getByRole('link', { name: /logout|sign out|déconnexion/i }))

  if (await logoutButton.isVisible().catch(() => false)) {
    await logoutButton.click()
    await page.waitForTimeout(2000)
  } else {
    const menuButton = page.getByRole('button', { name: /menu/i })
    if (await menuButton.isVisible().catch(() => false)) {
      await menuButton.click()
      await page.waitForTimeout(500)

      const logoutInMenu = page.getByRole('button', { name: /logout|sign out|déconnexion/i })
      if (await logoutInMenu.isVisible().catch(() => false)) {
        await logoutInMenu.click()
        await page.waitForTimeout(2000)
      }
    }
  }
}
