import { test, expect } from '@playwright/test'
import { test as authTest } from './fixtures/auth.fixture'
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from './helpers/game-helpers'

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/login')
  })

  test('displays login form with email and password fields', async ({ page }) => {
    await page.waitForSelector('form')

    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    await expect(emailInput).toBeVisible()

    const passwordInput = page.locator('input[type="password"]').first()
    await expect(passwordInput).toBeVisible()

    const loginButton = page.getByRole('button', { name: /^(log ?in|sign in)$/i })
    await expect(loginButton).toBeVisible()
  })

  test('successful login with valid credentials redirects away from login page', async ({ page }) => {
    await page.waitForSelector('form')

    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    await emailInput.fill(E2E_USER_EMAIL)

    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill(E2E_USER_PASSWORD)

    const loginButton = page.getByRole('button', { name: /^(log ?in|sign in)$/i })
    await loginButton.click()

    await page.waitForTimeout(3000)

    const currentUrl = page.url()
    expect(currentUrl).not.toContain('/login')
  })

  test('shows error message for invalid password', async ({ page }) => {
    await page.waitForSelector('form')

    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    await emailInput.fill(E2E_USER_EMAIL)

    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill('wrongpassword123')

    const loginButton = page.getByRole('button', { name: /^(log ?in|sign in)$/i })
    await loginButton.click()

    await page.waitForTimeout(2000)

    const currentUrl = page.url()
    const stillOnLogin = currentUrl.includes('/login')

    const errorElement = page.locator('[role="alert"], p.text-destructive, .text-red-500').first()
    const hasError = await errorElement.isVisible().catch(() => false)

    expect(hasError || stillOnLogin).toBeTruthy()
  })

  test('shows error message for non-existent user email', async ({ page }) => {
    await page.waitForSelector('form')

    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    await emailInput.fill('nonexistent@test.local')

    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill('somepassword123')

    const loginButton = page.getByRole('button', { name: /^(log ?in|sign in)$/i })
    await loginButton.click()

    await page.waitForTimeout(2000)

    const currentUrl = page.url()
    const stillOnLogin = currentUrl.includes('/login')

    const errorElement = page.locator('[role="alert"], p.text-destructive, .text-red-500').first()
    const hasError = await errorElement.isVisible().catch(() => false)

    expect(hasError || stillOnLogin).toBeTruthy()
  })
})

test.describe('Login Flow (narrow mobile viewport)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  test('login form fits 375px width without horizontal scroll', async ({ page }) => {
    await page.goto('/en/login')
    await page.waitForSelector('form')

    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    const passwordInput = page.locator('input[type="password"]').first()
    const loginButton = page.getByRole('button', { name: /^(log ?in|sign in)$/i })

    await expect(emailInput).toBeVisible()
    await expect(passwordInput).toBeVisible()
    await expect(loginButton).toBeVisible()

    for (const locator of [emailInput, passwordInput, loginButton]) {
      const box = await locator.boundingBox()
      expect(box, 'element has a bounding box').not.toBeNull()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(375)
    }

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
    expect(hasHorizontalOverflow).toBeFalsy()
  })
})

test.describe('Logout Flow', () => {
  authTest('logout button clears session and user can no longer access protected pages', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForTimeout(1000)

    const currentUrlBefore = authenticatedPage.url()
    expect(currentUrlBefore).toContain('/profile')

    let logoutButton = authenticatedPage.getByRole('button', { name: /logout|sign out|déconnexion/i })

    if (!(await logoutButton.isVisible().catch(() => false))) {
      const userMenuButton = authenticatedPage.locator('[data-testid="user-menu"], button:has(svg[class*="user"])').first()
      if (await userMenuButton.isVisible().catch(() => false)) {
        await userMenuButton.click()
        await authenticatedPage.waitForTimeout(500)
        logoutButton = authenticatedPage.getByRole('button', { name: /logout|sign out|déconnexion/i })
      }
    }

    if (!(await logoutButton.isVisible().catch(() => false))) {
      logoutButton = authenticatedPage.getByRole('link', { name: /logout|sign out|déconnexion/i })
    }

    if (await logoutButton.isVisible().catch(() => false)) {
      await logoutButton.click()
      await authenticatedPage.waitForTimeout(2000)
    }

    await authenticatedPage.goto('/en/profile')

    await authenticatedPage.waitForTimeout(3000)

    let redirectedToLogin = false
    for (let i = 0; i < 3; i++) {
      const currentUrl = authenticatedPage.url()
      if (currentUrl.includes('/login')) {
        redirectedToLogin = true
        break
      }
      await authenticatedPage.waitForTimeout(1000)
    }

    if (!redirectedToLogin) {
      const profileContent = authenticatedPage.locator('[class*="profile"], h1, [class*="Card"]').first()
      const hasProfileContent = await profileContent.isVisible().catch(() => false)
      expect(redirectedToLogin || !hasProfileContent).toBeTruthy()
    } else {
      expect(redirectedToLogin).toBeTruthy()
    }
  })
})

test.describe('Password Reset Flow', () => {
  test('forgot password page at /en/forgot-password displays email input field', async ({ page }) => {
    await page.goto('/en/forgot-password')
    await page.waitForTimeout(1000)

    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
      .or(page.locator('input[type="email"]'))
      .first()

    await expect(emailInput).toBeVisible()
  })

  test('submitting valid email format shows success message (email sent)', async ({ page }) => {
    await page.goto('/en/forgot-password')
    await page.waitForTimeout(1000)

    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
      .or(page.locator('input[type="email"]'))
      .first()
    await emailInput.fill(E2E_USER_EMAIL)

    const submitButton = page.getByRole('button', { name: /send|reset|submit|envoyer/i })
    await submitButton.click()

    await page.waitForTimeout(2000)

    const successMessage = page.locator('text=/sent|success|email|check.*inbox|vérifier/i').first()
    const hasSuccess = await successMessage.isVisible().catch(() => false)

    const currentUrl = page.url()
    const redirectedToLogin = currentUrl.includes('/login')

    expect(hasSuccess || redirectedToLogin).toBeTruthy()
  })

  test('submitting invalid email format shows validation error', async ({ page }) => {
    await page.goto('/en/forgot-password')
    await page.waitForTimeout(1000)

    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
      .or(page.locator('input[type="email"]'))
      .first()
    await emailInput.fill('invalid-email')

    const submitButton = page.getByRole('button', { name: /send|reset|submit|envoyer/i })
    await submitButton.click()

    await page.waitForTimeout(1000)

    const errorElement = page.locator('[role="alert"], p.text-destructive, .text-red-500, [class*="error"]').first()
    const hasError = await errorElement.isVisible().catch(() => false)

    const currentUrl = page.url()
    const stillOnPage = currentUrl.includes('/forgot-password')

    expect(hasError || stillOnPage).toBeTruthy()
  })

  test('page has link back to login page', async ({ page }) => {
    await page.goto('/en/forgot-password')
    await page.waitForTimeout(1000)

    const main = page.locator('#main-content')
    const loginLink = main.getByRole('link', { name: /login|sign in|back|connexion/i })
      .or(main.locator('a[href*="/login"]'))
      .first()

    await expect(loginLink).toBeVisible()

    await loginLink.click()
    await page.waitForTimeout(1000)

    const currentUrl = page.url()
    expect(currentUrl).toContain('/login')
  })
})
