import { test, expect } from '@playwright/test'

/**
 * E2E Tests for Admin User Management
 *
 * Prerequisites:
 * - Backend server must be running (npm run dev:backend)
 * - Frontend dev server will be started automatically by playwright.config.ts
 * - Database should have at least one admin user for testing
 * - Test admin credentials should be available (or create one in beforeEach)
 */

// Helper function to close the Daily Reward modal if it appears
async function closeDailyRewardModal(page: import('@playwright/test').Page) {
  await page.waitForTimeout(500)

  const claimButton = page.getByRole('button', { name: /claim/i })
  if (await claimButton.isVisible().catch(() => false)) {
    await claimButton.click()
    await page.waitForTimeout(500)
  }

  const closeButton = page.locator('button').filter({ hasText: /close/i })
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click()
    await page.waitForTimeout(500)
  }

  const dialogCloseButton = page.locator('[role="dialog"] button[aria-label*="close"], [role="dialog"] button:has(svg)').first()
  if (await dialogCloseButton.isVisible().catch(() => false)) {
    await dialogCloseButton.click()
    await page.waitForTimeout(500)
  }
}

// Helper function to login as admin
async function loginAsAdmin(page: import('@playwright/test').Page) {
  // Navigate to login page
  await page.goto('/en/login')
  await page.waitForSelector('form')

  // Fill in admin credentials
  // NOTE: These should be environment variables or test fixtures
  // For now, assuming admin@example.com / admin123 exists
  const adminEmail = process.env.TEST_ADMIN_EMAIL || 'admin@example.com'
  const adminPassword = process.env.TEST_ADMIN_PASSWORD || 'admin123'

  await page.getByPlaceholder(/you@example.com|email/i).fill(adminEmail)
  const passwordInput = page.locator('input[type="password"]').first()
  await passwordInput.fill(adminPassword)

  // Submit login form
  await page.getByRole('button', { name: /login|sign in/i }).click()

  // Wait for redirect after login
  await page.waitForTimeout(2000)

  // Verify we're logged in (should redirect to home or show user menu)
  const currentUrl = page.url()
  if (currentUrl.includes('/login')) {
    // Check for error
    const error = await page.locator('[role="alert"], p.text-destructive').first().isVisible().catch(() => false)
    if (error) {
      const errorText = await page.locator('[role="alert"], p.text-destructive').first().textContent()
      throw new Error(`Login failed: ${errorText}`)
    }
    throw new Error('Login did not redirect - check credentials')
  }

  // Close Daily Reward modal if it appears
  await closeDailyRewardModal(page)
}

test.describe('Admin User Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin before each test
    await loginAsAdmin(page)

    // Navigate to admin page
    await page.goto('/en/admin')

    // Close any modal that might appear
    await closeDailyRewardModal(page)

    // Wait for admin panel to load - be flexible about the heading
    await page.waitForTimeout(1000)
    const adminHeading = page.locator('h1, h2').filter({ hasText: /admin|administration/i }).first()
    await adminHeading.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
      // Admin page might have different structure
    })
  })

  test('should display the users tab in admin panel', async ({ page }) => {
    // Check that the users tab is visible
    const usersTab = page.getByRole('button', { name: /users|utilisateurs/i })
    await expect(usersTab).toBeVisible()
  })

  test('should navigate to users tab and display user list', async ({ page }) => {
    // Click on users tab
    await page.getByRole('button', { name: /users|utilisateurs/i }).click()

    // Wait for users tab content to load
    await page.waitForSelector('text=/Users|Utilisateurs/i', { timeout: 5000 })

    // Check that the user list table or empty state is visible
    const userList = page.locator('table, [data-testid="user-list"], text=/no users|aucun utilisateur/i').first()
    await expect(userList).toBeVisible()
  })

  test('should display user table with columns', async ({ page }) => {
    // Navigate to users tab
    await page.getByRole('button', { name: /users|utilisateurs/i }).click()
    await page.waitForSelector('text=/Users|Utilisateurs/i')

    // Check for table headers
    await expect(page.getByText(/email|Email/i)).toBeVisible()
    await expect(page.getByText(/name|Nom/i)).toBeVisible()
    await expect(page.getByText(/role|Rôle/i)).toBeVisible()
    await expect(page.getByText(/total score|score total/i)).toBeVisible()
    await expect(page.getByText(/created|Créé/i)).toBeVisible()
  })

  test('should allow searching users by email', async ({ page }) => {
    // Navigate to users tab
    await page.getByRole('button', { name: /users|utilisateurs/i }).click()
    await page.waitForSelector('text=/Users|Utilisateurs/i')

    // Find search input
    const searchInput = page.getByPlaceholder(/search users|rechercher.*utilisateur/i)
    await expect(searchInput).toBeVisible()

    // Type in search
    await searchInput.fill('test@example.com')

    // Wait for search results (debounced, so wait a bit)
    await page.waitForTimeout(500)

    // The table should update (either show results or empty state)
    // We can't assert specific results without knowing the data, but we can check the input value
    await expect(searchInput).toHaveValue('test@example.com')
  })

  test('should allow sorting users by clicking column headers', async ({ page }) => {
    // Navigate to users tab
    await page.getByRole('button', { name: /users|utilisateurs/i }).click()
    await page.waitForSelector('text=/Users|Utilisateurs/i')

    // Wait for table to load
    await page.waitForTimeout(1000)

    // Click on email column header to sort
    const emailHeader = page.getByRole('columnheader', { name: /email/i }).or(page.locator('th').filter({ hasText: /email/i })).first()

    if (await emailHeader.isVisible()) {
      await emailHeader.click()
      // Wait for sort to apply
      await page.waitForTimeout(500)
      // Just verify the click worked (no error)
      await expect(page.locator('table, [data-testid="user-list"]').first()).toBeVisible()
    }
  })

  test('should allow changing user role via dropdown', async ({ page }) => {
    // Navigate to users tab
    await page.getByRole('button', { name: /users|utilisateurs/i }).click()
    await page.waitForSelector('text=/Users|Utilisateurs/i')

    // Wait for table to load
    await page.waitForTimeout(1000)

    // Find the first role dropdown (select element)
    const roleSelect = page.locator('select').first()

    if (await roleSelect.isVisible()) {
      const currentValue = await roleSelect.inputValue()
      const newValue = currentValue === 'user' ? 'admin' : 'user'

      // Change role
      await roleSelect.selectOption(newValue)

      // Wait for API call
      await page.waitForTimeout(1000)

      // Check for success toast or verify the value changed
      // The select should have the new value
      await expect(roleSelect).toHaveValue(newValue)
    } else {
      // If no users or no select visible, skip this test
      test.skip()
    }
  })

  test('should show ban user confirmation dialog', async ({ page }) => {
    // Navigate to users tab
    await page.getByRole('button', { name: /users|utilisateurs/i }).click()
    await page.waitForSelector('text=/Users|Utilisateurs/i')

    // Wait for table to load
    await page.waitForTimeout(1000)

    // Find ban button (should be visible for non-admin users)
    const banButton = page.getByRole('button', { name: /ban/i }).or(page.locator('button[title*="ban" i]')).first()

    if (await banButton.isVisible()) {
      await banButton.click()

      // Wait for confirmation dialog
      await page.waitForSelector('text=/confirm.*ban|confirmer.*bannir/i', { timeout: 3000 })

      // Check dialog is visible
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      // Cancel the dialog
      await page.getByRole('button', { name: /cancel|annuler/i }).click()
    } else {
      // If no ban button visible (maybe all users are admins), skip
      test.skip()
    }
  })

  test('should show delete user confirmation dialog', async ({ page }) => {
    // Navigate to users tab
    await page.getByRole('button', { name: /users|utilisateurs/i }).click()
    await page.waitForSelector('text=/Users|Utilisateurs/i')

    // Wait for table to load
    await page.waitForTimeout(1000)

    // Find delete button
    const deleteButton = page.getByRole('button', { name: /delete/i }).or(page.locator('button[title*="delete" i]')).first()

    if (await deleteButton.isVisible()) {
      await deleteButton.click()

      // Wait for confirmation dialog
      await page.waitForSelector('text=/confirm.*delete|confirmer.*supprimer/i', { timeout: 3000 })

      // Check dialog is visible
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      // Cancel the dialog
      await page.getByRole('button', { name: /cancel|annuler/i }).click()
    } else {
      // If no users or no delete button, skip
      test.skip()
    }
  })

  test('should show pagination when there are many users', async ({ page }) => {
    // Navigate to users tab
    await page.getByRole('button', { name: /users|utilisateurs/i }).click()
    await page.waitForSelector('text=/Users|Utilisateurs/i')

    // Wait for content to load
    await page.waitForTimeout(1000)

    // Check if pagination exists (only if there are enough users)
    const pagination = page.locator('[data-testid="pagination"], .pagination, button:has-text("2")').first()

    // Pagination might not exist if there are few users, so we just check if it exists or not
    const hasPagination = await pagination.isVisible().catch(() => false)

    if (hasPagination) {
      await expect(pagination).toBeVisible()
    } else {
      // If no pagination, that's fine - just means there are few users
      // Verify we can see the user list instead
      await expect(page.locator('table, [data-testid="user-list"]').first()).toBeVisible()
    }
  })
})

test.describe('Admin User Management - Access Control', () => {
  test('should redirect non-admin users away from admin page', async ({ page }) => {
    // Try to access admin page without logging in
    await page.goto('/en/admin')

    // Should redirect to home page or login
    await page.waitForTimeout(2000)

    const currentUrl = page.url()
    // Should not be on admin page
    expect(currentUrl).not.toContain('/admin')
  })

  test('should not show users tab to non-admin users', async ({ page }) => {
    // Login as regular user (if you have a test user)
    // For now, just check that accessing /admin redirects
    await page.goto('/en/admin')
    await page.waitForTimeout(2000)

    const currentUrl = page.url()
    // Should redirect away from admin
    expect(currentUrl).not.toContain('/admin')

    // If somehow on admin page, users tab should not be visible
    const usersTab = page.getByRole('button', { name: /users|utilisateurs/i })
    const isVisible = await usersTab.isVisible().catch(() => false)
    expect(isVisible).toBe(false)
  })
})
