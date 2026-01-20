import { Page, expect } from '@playwright/test'

/**
 * Test helpers for daily game E2E tests
 */

/**
 * Close the Daily Reward modal if it appears
 */
export async function closeDailyRewardModal(page: Page) {
  // Wait a moment for modal to potentially appear
  await page.waitForTimeout(500)

  // Check if Daily Reward modal is visible
  const closeButton = page.locator('button').filter({ hasText: /close/i })
  const claimButton = page.getByRole('button', { name: /claim/i })

  // Try to close the modal - first try claim, then close
  if (await claimButton.isVisible().catch(() => false)) {
    await claimButton.click()
    await page.waitForTimeout(500)
  }

  // If there's still a close button, click it
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click()
    await page.waitForTimeout(500)
  }

  // Also check for dialog close button (X button)
  const dialogCloseButton = page.locator('[role="dialog"] button[aria-label*="close"], [role="dialog"] button:has(svg)').first()
  if (await dialogCloseButton.isVisible().catch(() => false)) {
    await dialogCloseButton.click()
    await page.waitForTimeout(500)
  }
}

/**
 * Login as a regular user
 */
export async function loginAsUser(page: Page) {
  await page.goto('/en/login')
  await page.waitForSelector('form')

  const userEmail = process.env.TEST_USER_EMAIL || 'testuser@example.com'
  const userPassword = process.env.TEST_USER_PASSWORD || 'testpass123'

  await page.getByPlaceholder(/you@example.com|email/i).fill(userEmail)
  const passwordInput = page.locator('input[type="password"]').first()
  await passwordInput.fill(userPassword)

  // Wait for login button to be enabled (form validation)
  const loginButton = page.getByRole('button', { name: /login|sign in/i })
  await loginButton.waitFor({ state: 'visible', timeout: 5000 })
  await expect(loginButton).toBeEnabled({ timeout: 5000 })

  await loginButton.click()
  await page.waitForTimeout(2000)

  const currentUrl = page.url()
  if (currentUrl.includes('/login')) {
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
      throw new Error(`Login failed: ${errorText}`)
    }
    throw new Error('Login did not redirect - check credentials')
  }

  // Close Daily Reward modal if it appears after login
  await closeDailyRewardModal(page)
}

/**
 * Login as an admin user
 */
export async function loginAsAdmin(page: Page) {
  await page.goto('/en/login')
  await page.waitForSelector('form')

  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'admin@example.com'
  const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123'

  await page.getByPlaceholder(/you@example.com|email/i).fill(adminEmail)
  const passwordInput = page.locator('input[type="password"]').first()
  await passwordInput.fill(adminPassword)

  // Wait for login button to be enabled (form validation)
  const loginButton = page.getByRole('button', { name: /login|sign in/i })
  await loginButton.waitFor({ state: 'visible', timeout: 5000 })
  await expect(loginButton).toBeEnabled({ timeout: 5000 })

  await loginButton.click()
  await page.waitForTimeout(2000)

  const currentUrl = page.url()
  if (currentUrl.includes('/login')) {
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
      throw new Error(`Login failed: ${errorText}`)
    }
    throw new Error('Login did not redirect - check credentials')
  }

  // Close Daily Reward modal if it appears after login
  await closeDailyRewardModal(page)
}

/**
 * Wait for the game to load (intro or playing state)
 */
export async function waitForGameLoad(page: Page) {
  await page.waitForSelector('h1, h2, [role="progressbar"]', { timeout: 10000 })
}

/**
 * Start the daily game if on intro screen
 */
export async function startDailyGame(page: Page) {
  const startButton = page.getByRole('button', { name: /start|commencer|play/i })
  const hasStartButton = await startButton.isVisible().catch(() => false)

  if (hasStartButton) {
    await startButton.click()
    await page.waitForTimeout(2000)
  }
}

/**
 * Navigate to a specific position in the game
 */
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

/**
 * Visit all positions to enable end game button
 */
export async function visitAllPositions(page: Page) {
  for (let i = 1; i <= 10; i++) {
    await navigateToPosition(page, i)
  }
}

/**
 * Submit a guess for the current screenshot
 */
export async function submitGuess(page: Page, gameName: string) {
  const gameInput = page.locator('input[type="text"]').first()
  await expect(gameInput).toBeVisible()

  await gameInput.fill(gameName)

  const submitButton = page.getByRole('button', { name: /submit|send|envoyer/i })
  await submitButton.click()

  // Wait for result
  await page.waitForTimeout(2000)
}

/**
 * Skip the current screenshot
 */
export async function skipScreenshot(page: Page) {
  const skipButton = page.getByRole('button', { name: /skip/i })
  await expect(skipButton).toBeVisible()

  await skipButton.click()
  await page.waitForTimeout(1000)
}

/**
 * End the game (must have visited all positions first)
 */
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

/**
 * Get the current score from the game
 */
export async function getCurrentScore(page: Page): Promise<number> {
  // Try to find score display
  const scoreText = await page
    .locator('text=/^\\d{1,4}$/')
    .first()
    .textContent()
    .catch(() => '0')

  return parseInt(scoreText || '0', 10)
}

/**
 * Check if currently on a specific position
 */
export async function isOnPosition(page: Page, position: number): Promise<boolean> {
  const activeDot = page.locator('button[class*="ring"]').first()
  const activeText = await activeDot.textContent().catch(() => '0')

  return parseInt(activeText || '0', 10) === position
}

/**
 * Click a hint button (year or publisher)
 */
export async function clickHint(page: Page, hintType: 'year' | 'publisher') {
  let hintButton

  if (hintType === 'year') {
    hintButton = page
      .locator('button')
      .filter({ hasText: /year|année|calendar/i })
      .or(page.locator('button svg[class*="calendar"]').locator('..'))
      .first()
  } else {
    hintButton = page
      .locator('button')
      .filter({ hasText: /publisher|éditeur|building/i })
      .or(page.locator('button svg[class*="building"]').locator('..'))
      .first()
  }

  await expect(hintButton).toBeVisible()
  await hintButton.click()
  await page.waitForTimeout(500)
}

/**
 * Register a new test user
 */
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

  // Check if registration succeeded
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

/**
 * Logout the current user
 */
export async function logout(page: Page) {
  // Look for logout button in header or menu
  const logoutButton = page
    .getByRole('button', { name: /logout|sign out|déconnexion/i })
    .or(page.getByRole('link', { name: /logout|sign out|déconnexion/i }))

  if (await logoutButton.isVisible().catch(() => false)) {
    await logoutButton.click()
    await page.waitForTimeout(2000)
  } else {
    // Try opening a menu first (mobile menu or user menu)
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
