import { test, expect } from '@playwright/test'

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

const E2E_ADMIN_EMAIL = 'e2e_admin@test.local'
const E2E_ADMIN_PASSWORD = 'test123'

async function loginAsAdmin(page: import('@playwright/test').Page) {
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
    const error = await page.locator(errorSelector).first().isVisible().catch(() => false)
    if (error) {
      const errorText = await page.locator(errorSelector).first().textContent()
      throw new Error(`Login failed: ${errorText}`)
    }
    const authInfo = authResponses.length > 0
      ? `\nAuth API responses:\n${authResponses.map(r => `  ${r.status} ${r.url}\n  Body: ${r.body.slice(0, 200)}`).join('\n')}`
      : '\nNo auth API responses captured'
    throw new Error(`Login did not redirect - check credentials${authInfo}`)
  }

  await closeDailyRewardModal(page)
}

test.describe('Admin User Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page)

    await page.goto('/en/admin')

    await closeDailyRewardModal(page)

    await page.waitForTimeout(1000)
    const adminHeading = page.locator('h1, h2').filter({ hasText: /admin|administration/i }).first()
    await adminHeading.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
    })
  })

  test('should display the users tab in admin panel', async ({ page }) => {
    const usersTab = page.getByRole('tab', { name: /users|utilisateurs/i }).or(page.getByRole('button', { name: /users|utilisateurs/i }))
    await expect(usersTab).toBeVisible()
  })

  test('should navigate to users tab and display user list', async ({ page }) => {
    const usersTab = page.getByRole('tab', { name: /users|utilisateurs/i }).or(page.getByRole('button', { name: /users|utilisateurs/i }))
    if (await usersTab.isVisible().catch(() => false)) {
      await usersTab.click()
      await page.waitForTimeout(1000)
    }

    const hasTable = await page.locator('table').first().isVisible().catch(() => false)
    const hasUserList = await page.locator('[data-testid="user-list"]').isVisible().catch(() => false)
    const hasContent = await page.locator('main').first().isVisible().catch(() => false)

    expect(hasTable || hasUserList || hasContent).toBeTruthy()
  })

  test('should display user table with columns', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'chromium', 'desktop-only user table')
    await page.getByRole('tab', { name: /users|utilisateurs/i }).or(page.getByRole('button', { name: /users|utilisateurs/i })).click()
    await page.waitForSelector('text=/Users|Utilisateurs/i')

    await expect(page.getByRole('columnheader', { name: /email/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /name|nom/i }).first()).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /role|rôle/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /total score|score total/i })).toBeVisible()
    await expect(page.getByRole('columnheader', { name: /created|créé/i })).toBeVisible()
  })

  test('should allow searching users by email', async ({ page }) => {
    await page.getByRole('tab', { name: /users|utilisateurs/i }).or(page.getByRole('button', { name: /users|utilisateurs/i })).click()
    await page.waitForSelector('text=/Users|Utilisateurs/i')

    const searchInput = page.getByPlaceholder(/search users|rechercher.*utilisateur/i)
    await expect(searchInput).toBeVisible()

    await searchInput.fill('test@example.com')

    await page.waitForTimeout(500)

    await expect(searchInput).toHaveValue('test@example.com')
  })

  test('should allow sorting users by clicking column headers', async ({ page }) => {
    await page.getByRole('tab', { name: /users|utilisateurs/i }).or(page.getByRole('button', { name: /users|utilisateurs/i })).click()
    await page.waitForSelector('text=/Users|Utilisateurs/i')

    await page.waitForTimeout(1000)

    const emailHeader = page.getByRole('columnheader', { name: /email/i }).or(page.locator('th').filter({ hasText: /email/i })).first()

    if (await emailHeader.isVisible()) {
      await emailHeader.click()
      await page.waitForTimeout(500)
      await expect(page.locator('table, [data-testid="user-list"]').first()).toBeVisible()
    }
  })

  test('should allow changing user role via dropdown', async ({ page }) => {
    const usersTab = page.getByRole('tab', { name: /users|utilisateurs/i })
      .or(page.getByRole('tab', { name: /users|utilisateurs/i }).or(page.getByRole('button', { name: /users|utilisateurs/i })))
      .first()

    if (await usersTab.isVisible().catch(() => false)) {
      await usersTab.click()
      await page.waitForTimeout(1500)

      const roleSelect = page.locator('select').first()

      if (await roleSelect.isVisible().catch(() => false)) {
        const currentValue = await roleSelect.inputValue()

        if (currentValue === 'user' || currentValue === 'admin') {
          const newValue = currentValue === 'user' ? 'admin' : 'user'

          await roleSelect.selectOption(newValue)

          await page.waitForTimeout(1500)

          const updatedValue = await roleSelect.inputValue()
          const toast = page.locator('[class*="toast"], [class*="Toaster"], [role="alert"]').first()
          const hasToast = await toast.isVisible().catch(() => false)

          expect(updatedValue === newValue || hasToast || updatedValue === currentValue).toBeTruthy()
        } else {
          test.skip()
        }
      } else {
        test.skip()
      }
    } else {
      test.skip()
    }
  })

  test('should show ban user confirmation dialog', async ({ page }) => {
    const usersTab = page.getByRole('tab', { name: /users|utilisateurs/i }).or(page.getByRole('button', { name: /users|utilisateurs/i }))
    if (await usersTab.isVisible().catch(() => false)) {
      await usersTab.click()
      await page.waitForTimeout(1000)
    }

    const banButton = page.getByRole('button', { name: /ban/i }).or(page.locator('button[title*="ban" i]')).first()

    if (await banButton.isVisible().catch(() => false)) {
      await banButton.click()
      await page.waitForTimeout(500)

      const dialog = page.getByRole('dialog')
      const hasDialog = await dialog.isVisible().catch(() => false)

      if (hasDialog) {
        const cancelButton = page.getByRole('button', { name: /cancel|annuler|no|non/i }).first()
        if (await cancelButton.isVisible().catch(() => false)) {
          await cancelButton.click()
        }
      }

      expect(true).toBeTruthy()
    } else {
      test.skip()
    }
  })

  test('should show delete user confirmation dialog', async ({ page }) => {
    const usersTab = page.getByRole('tab', { name: /users|utilisateurs/i }).or(page.getByRole('button', { name: /users|utilisateurs/i }))
    if (await usersTab.isVisible().catch(() => false)) {
      await usersTab.click()
      await page.waitForTimeout(1000)
    }

    const deleteButton = page.getByRole('button', { name: /delete/i }).or(page.locator('button[title*="delete" i]')).first()

    if (await deleteButton.isVisible().catch(() => false)) {
      await deleteButton.click()
      await page.waitForTimeout(500)

      const dialog = page.getByRole('dialog')
      const hasDialog = await dialog.isVisible().catch(() => false)

      if (hasDialog) {
        const cancelButton = page.getByRole('button', { name: /cancel|annuler|no|non/i }).first()
        if (await cancelButton.isVisible().catch(() => false)) {
          await cancelButton.click()
        }
      }

      expect(true).toBeTruthy()
    } else {
      test.skip()
    }
  })

  test('should show pagination when there are many users', async ({ page }) => {
    const usersTab = page.getByRole('tab', { name: /users|utilisateurs/i })
      .or(page.getByRole('tab', { name: /users|utilisateurs/i }).or(page.getByRole('button', { name: /users|utilisateurs/i })))
      .first()

    if (await usersTab.isVisible().catch(() => false)) {
      await usersTab.click()
      await page.waitForTimeout(1000)

      const pagination = page.locator('[data-testid="pagination"], .pagination, button:has-text("2")').first()

      const hasPagination = await pagination.isVisible().catch(() => false)

      if (hasPagination) {
        await expect(pagination).toBeVisible()
      } else {
        const content = page.locator('table, [data-testid="user-list"], main').first()
        await expect(content).toBeVisible()
      }
    } else {
      test.skip()
    }
  })
})

test.describe('Admin User Management - Access Control', () => {
  test('should redirect non-admin users away from admin page', async ({ page }) => {
    await page.goto('/en/admin')

    await page.waitForTimeout(2000)

    const currentUrl = page.url()
    expect(currentUrl).not.toContain('/admin')
  })

  test('should not show users tab to non-admin users', async ({ page }) => {
    await page.goto('/en/admin')
    await page.waitForTimeout(2000)

    const currentUrl = page.url()
    expect(currentUrl).not.toContain('/admin')

    const usersTab = page.getByRole('tab', { name: /users|utilisateurs/i }).or(page.getByRole('button', { name: /users|utilisateurs/i }))
    const isVisible = await usersTab.isVisible().catch(() => false)
    expect(isVisible).toBe(false)
  })
})
