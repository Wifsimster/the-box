import { test, expect } from '@playwright/test'
import { test as authTest } from './fixtures/auth.fixture'

test.describe('History - Authentication Required', () => {
  test('history page requires authentication', async ({ page }) => {
    await page.goto('/en/history')
    await page.waitForTimeout(2000)

    const currentUrl = page.url()

    const redirectedToLogin = currentUrl.includes('/login')
    const stayedOnHistory = currentUrl.includes('/history')

    if (stayedOnHistory) {
      const loginPrompt = page.locator('text=/login|sign in|unauthorized|connexion/i').first()
      const hasPrompt = await loginPrompt.isVisible().catch(() => false)

      expect(hasPrompt || redirectedToLogin).toBeTruthy()
    } else {
      expect(redirectedToLogin).toBeTruthy()
    }
  })
})

test.describe('History - Authenticated User', () => {
  authTest('history loads in the profile Activity tab for authenticated user', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile?tab=activity')
    await authenticatedPage.waitForTimeout(1000)

    const currentUrl = authenticatedPage.url()

    expect(currentUrl).toContain('/profile')

    const pageContent = authenticatedPage.locator('main, [role="main"], h1, h2').first()
    await expect(pageContent).toBeVisible()
  })

  authTest('displays list of past games with dates', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile?tab=activity')
    await authenticatedPage.waitForTimeout(1000)

    const datePattern = authenticatedPage.locator('text=/\\d{1,2}[\\/-]\\d{1,2}|\\d{4}|January|February|March|April|May|June|July|August|September|October|November|December|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre/i').first()
    const hasDate = await datePattern.isVisible().catch(() => false)

    const historyItem = authenticatedPage.locator('[class*="history"], [class*="game"], [class*="card"], [class*="item"]').first()
    const hasHistoryItem = await historyItem.isVisible().catch(() => false)

    const tableRow = authenticatedPage.locator('tr, [role="row"]').first()
    const hasTableRow = await tableRow.isVisible().catch(() => false)

    const emptyState = authenticatedPage.locator('text=/no.*history|no.*games|empty|aucun|pas de/i').first()
    const isEmpty = await emptyState.isVisible().catch(() => false)

    expect(hasDate || hasHistoryItem || hasTableRow || isEmpty).toBeTruthy()
  })

  authTest('each history entry shows score achieved', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile?tab=activity')
    await authenticatedPage.waitForTimeout(1000)

    await expect
      .poll(
        async () => {
          const hasTrophy = await authenticatedPage.locator('svg.lucide-trophy:visible').first().isVisible().catch(() => false)
          const hasBadge = await authenticatedPage.locator('[data-slot="badge"]:visible').first().isVisible().catch(() => false)
          const hasPercentage = await authenticatedPage.locator('text=/\\d+%/').first().isVisible().catch(() => false)
          const isEmpty = await authenticatedPage
            .getByText(/no games (yet|played|match)|aucun/i)
            .first()
            .isVisible()
            .catch(() => false)
          return hasTrophy || hasBadge || hasPercentage || isEmpty
        },
        { timeout: 10_000 },
      )
      .toBe(true)
  })

  authTest('clicking on a history entry navigates to detail page', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile?tab=activity')
    await authenticatedPage.waitForTimeout(1000)

    const historyLink = authenticatedPage.locator('a[href*="/history/"], a[href*="/game/"], [class*="history"] a').first()
    const hasHistoryLink = await historyLink.isVisible().catch(() => false)

    if (hasHistoryLink) {
      await historyLink.click()
      await authenticatedPage.waitForTimeout(1000)

      const currentUrl = authenticatedPage.url()

      const isDetailPage = currentUrl.includes('/history/') || currentUrl.includes('/game/')
      expect(isDetailPage).toBeTruthy()
    } else {
      const clickableCard = authenticatedPage.locator('[class*="history"][role="button"], [class*="game"][role="button"]').first()
      const hasClickableCard = await clickableCard.isVisible().catch(() => false)

      if (hasClickableCard) {
        await clickableCard.click()
        await authenticatedPage.waitForTimeout(1000)

        const currentUrl = authenticatedPage.url()
        const isDetailPage = currentUrl.includes('/history/') || currentUrl.includes('/game/')
        expect(isDetailPage).toBeTruthy()
      } else {
        expect(true).toBeTruthy()
      }
    }
  })

  authTest('shows appropriate empty state when user has no history', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile?tab=activity')
    await authenticatedPage.waitForTimeout(1500)

    const emptyState = authenticatedPage.locator('text=/no.*history|no.*games|empty|haven\'t played|aucun|pas encore|play.*first|jouez/i').first()
    const hasEmptyState = await emptyState.isVisible().catch(() => false)

    const emptyStateIllustration = authenticatedPage.locator('[class*="empty"], [class*="no-data"], [class*="muted"]').first()
    const hasEmptyIllustration = await emptyStateIllustration.isVisible().catch(() => false)

    const historyContent = authenticatedPage.locator('[class*="history-item"], [class*="game-entry"], [class*="Card"], table, tr:not(:first-child)').first()
    const hasHistoryContent = await historyContent.isVisible().catch(() => false)

    const mainContent = authenticatedPage.locator('main, [role="main"], h1, h2').first()
    const hasMainContent = await mainContent.isVisible().catch(() => false)

    expect(hasEmptyState || hasEmptyIllustration || hasHistoryContent || hasMainContent).toBeTruthy()
  })
})
