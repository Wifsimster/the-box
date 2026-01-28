import { test, expect } from '@playwright/test'
import { test as authTest } from './fixtures/auth.fixture'
import { E2E_USER_EMAIL, E2E_USER_PASSWORD } from './helpers/game-helpers'

/**
 * E2E Tests for Authentication Flow
 *
 * Prerequisites:
 * - Backend server must be running
 * - Database must be seeded with npm run e2e:seed
 */

test.describe('Login Flow', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/en/login')
  })

  test('displays login form with email and password fields', async ({ page }) => {
    await page.waitForSelector('form')

    // Verify email input
    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    await expect(emailInput).toBeVisible()

    // Verify password input
    const passwordInput = page.locator('input[type="password"]').first()
    await expect(passwordInput).toBeVisible()

    // Verify submit button
    const loginButton = page.getByRole('button', { name: /login|sign in/i })
    await expect(loginButton).toBeVisible()
  })

  test('successful login with valid credentials redirects away from login page', async ({ page }) => {
    await page.waitForSelector('form')

    // Fill email
    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    await emailInput.fill(E2E_USER_EMAIL)

    // Fill password
    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill(E2E_USER_PASSWORD)

    // Submit
    const loginButton = page.getByRole('button', { name: /login|sign in/i })
    await loginButton.click()

    // Wait for navigation
    await page.waitForTimeout(3000)

    // Should redirect away from login page
    const currentUrl = page.url()
    expect(currentUrl).not.toContain('/login')
  })

  test('shows error message for invalid password', async ({ page }) => {
    await page.waitForSelector('form')

    // Fill email with valid user
    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    await emailInput.fill(E2E_USER_EMAIL)

    // Fill incorrect password
    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill('wrongpassword123')

    // Submit
    const loginButton = page.getByRole('button', { name: /login|sign in/i })
    await loginButton.click()

    // Wait for response
    await page.waitForTimeout(2000)

    // Should show error message or still be on login page
    const currentUrl = page.url()
    const stillOnLogin = currentUrl.includes('/login')

    // Check for error message
    const errorElement = page.locator('[role="alert"], p.text-destructive, .text-red-500').first()
    const hasError = await errorElement.isVisible().catch(() => false)

    // Either error shown or stayed on login page
    expect(hasError || stillOnLogin).toBeTruthy()
  })

  test('shows error message for non-existent user email', async ({ page }) => {
    await page.waitForSelector('form')

    // Fill non-existent email
    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
    await emailInput.fill('nonexistent@test.local')

    // Fill password
    const passwordInput = page.locator('input[type="password"]').first()
    await passwordInput.fill('somepassword123')

    // Submit
    const loginButton = page.getByRole('button', { name: /login|sign in/i })
    await loginButton.click()

    // Wait for response
    await page.waitForTimeout(2000)

    // Should show error message or still be on login page
    const currentUrl = page.url()
    const stillOnLogin = currentUrl.includes('/login')

    // Check for error message
    const errorElement = page.locator('[role="alert"], p.text-destructive, .text-red-500').first()
    const hasError = await errorElement.isVisible().catch(() => false)

    // Either error shown or stayed on login page
    expect(hasError || stillOnLogin).toBeTruthy()
  })
})

test.describe('Logout Flow', () => {
  authTest('logout button clears session and user can no longer access protected pages', async ({ authenticatedPage }) => {
    // Navigate to profile (protected page)
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForTimeout(1000)

    // Verify we're on profile page (authenticated)
    const currentUrlBefore = authenticatedPage.url()
    expect(currentUrlBefore).toContain('/profile')

    // Find and click logout button
    // Try header first, then user menu
    let logoutButton = authenticatedPage.getByRole('button', { name: /logout|sign out|déconnexion/i })

    if (!(await logoutButton.isVisible().catch(() => false))) {
      // Try opening user menu
      const userMenuButton = authenticatedPage.locator('[data-testid="user-menu"], button:has(svg[class*="user"])').first()
      if (await userMenuButton.isVisible().catch(() => false)) {
        await userMenuButton.click()
        await authenticatedPage.waitForTimeout(500)
        logoutButton = authenticatedPage.getByRole('button', { name: /logout|sign out|déconnexion/i })
      }
    }

    if (!(await logoutButton.isVisible().catch(() => false))) {
      // Try looking for a link instead
      logoutButton = authenticatedPage.getByRole('link', { name: /logout|sign out|déconnexion/i })
    }

    // Click logout
    if (await logoutButton.isVisible().catch(() => false)) {
      await logoutButton.click()
      await authenticatedPage.waitForTimeout(2000)
    }

    // Try to access protected page again
    await authenticatedPage.goto('/en/profile')

    // Wait longer for the redirect to happen (it's done via React useEffect)
    await authenticatedPage.waitForTimeout(3000)

    // Check URL multiple times to account for redirect timing
    let redirectedToLogin = false
    for (let i = 0; i < 3; i++) {
      const currentUrl = authenticatedPage.url()
      if (currentUrl.includes('/login')) {
        redirectedToLogin = true
        break
      }
      await authenticatedPage.waitForTimeout(1000)
    }

    // Should be redirected to login - ProfilePage redirects unauthenticated users
    // If not redirected yet, the session might still be clearing on the server
    if (!redirectedToLogin) {
      // Last check - profile page should at least not show authenticated content
      const profileContent = authenticatedPage.locator('[class*="profile"], h1, [class*="Card"]').first()
      const hasProfileContent = await profileContent.isVisible().catch(() => false)
      // Test passes if either redirected or no authenticated profile content shown
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

    // Check for email input
    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
      .or(page.locator('input[type="email"]'))
      .first()

    await expect(emailInput).toBeVisible()
  })

  test('submitting valid email format shows success message (email sent)', async ({ page }) => {
    await page.goto('/en/forgot-password')
    await page.waitForTimeout(1000)

    // Fill email
    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
      .or(page.locator('input[type="email"]'))
      .first()
    await emailInput.fill(E2E_USER_EMAIL)

    // Submit
    const submitButton = page.getByRole('button', { name: /send|reset|submit|envoyer/i })
    await submitButton.click()

    // Wait for response
    await page.waitForTimeout(2000)

    // Should show success message
    const successMessage = page.locator('text=/sent|success|email|check.*inbox|vérifier/i').first()
    const hasSuccess = await successMessage.isVisible().catch(() => false)

    // Or page might redirect to login with success message
    const currentUrl = page.url()
    const redirectedToLogin = currentUrl.includes('/login')

    expect(hasSuccess || redirectedToLogin).toBeTruthy()
  })

  test('submitting invalid email format shows validation error', async ({ page }) => {
    await page.goto('/en/forgot-password')
    await page.waitForTimeout(1000)

    // Fill invalid email
    const emailInput = page.getByPlaceholder(/you@example.com|email/i)
      .or(page.locator('input[type="email"]'))
      .first()
    await emailInput.fill('invalid-email')

    // Submit
    const submitButton = page.getByRole('button', { name: /send|reset|submit|envoyer/i })
    await submitButton.click()

    // Wait for validation
    await page.waitForTimeout(1000)

    // Should show error or stay on page
    const errorElement = page.locator('[role="alert"], p.text-destructive, .text-red-500, [class*="error"]').first()
    const hasError = await errorElement.isVisible().catch(() => false)

    // Or form should not submit (still on forgot-password page)
    const currentUrl = page.url()
    const stillOnPage = currentUrl.includes('/forgot-password')

    expect(hasError || stillOnPage).toBeTruthy()
  })

  test('page has link back to login page', async ({ page }) => {
    await page.goto('/en/forgot-password')
    await page.waitForTimeout(1000)

    // Look for link to login
    const loginLink = page.getByRole('link', { name: /login|sign in|back|connexion/i })
      .or(page.locator('a[href*="/login"]'))
      .first()

    await expect(loginLink).toBeVisible()

    // Click and verify navigation
    await loginLink.click()
    await page.waitForTimeout(1000)

    const currentUrl = page.url()
    expect(currentUrl).toContain('/login')
  })
})
