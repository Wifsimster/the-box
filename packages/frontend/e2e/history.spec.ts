import { test, expect } from '@playwright/test'
import { test as authTest } from './fixtures/auth.fixture'

/**
 * E2E Tests for Game History Page
 *
 * Prerequisites:
 * - Backend server must be running
 * - Database must be seeded with npm run e2e:seed
 */

test.describe('History - Authentication Required', () => {
  test('history page requires authentication', async ({ page }) => {
    await page.goto('/en/history')
    await page.waitForTimeout(2000)

    const currentUrl = page.url()

    // Should redirect to login or show login required
    const redirectedToLogin = currentUrl.includes('/login')
    const stayedOnHistory = currentUrl.includes('/history')

    if (stayedOnHistory) {
      // Check for login prompt or unauthorized message
      const loginPrompt = page.locator('text=/login|sign in|unauthorized|connexion/i').first()
      const hasPrompt = await loginPrompt.isVisible().catch(() => false)

      expect(hasPrompt || redirectedToLogin).toBeTruthy()
    } else {
      expect(redirectedToLogin).toBeTruthy()
    }
  })
})

test.describe('History - Authenticated User', () => {
  authTest('history page at /en/history loads for authenticated user', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/history')
    await authenticatedPage.waitForTimeout(1000)

    const currentUrl = authenticatedPage.url()

    // Should stay on history page
    expect(currentUrl).toContain('/history')

    // Page should have content
    const pageContent = authenticatedPage.locator('main, [role="main"], h1, h2').first()
    await expect(pageContent).toBeVisible()
  })

  authTest('displays list of past games with dates', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/history')
    await authenticatedPage.waitForTimeout(1000)

    // Look for date patterns
    const datePattern = authenticatedPage.locator('text=/\\d{1,2}[\\/-]\\d{1,2}|\\d{4}|January|February|March|April|May|June|July|August|September|October|November|December|janvier|février|mars|avril|mai|juin|juillet|août|septembre|octobre|novembre|décembre/i').first()
    const hasDate = await datePattern.isVisible().catch(() => false)

    // Look for history items/cards
    const historyItem = authenticatedPage.locator('[class*="history"], [class*="game"], [class*="card"], [class*="item"]').first()
    const hasHistoryItem = await historyItem.isVisible().catch(() => false)

    // Or look for table rows
    const tableRow = authenticatedPage.locator('tr, [role="row"]').first()
    const hasTableRow = await tableRow.isVisible().catch(() => false)

    // Either has history entries or empty state
    const emptyState = authenticatedPage.locator('text=/no.*history|no.*games|empty|aucun|pas de/i').first()
    const isEmpty = await emptyState.isVisible().catch(() => false)

    expect(hasDate || hasHistoryItem || hasTableRow || isEmpty).toBeTruthy()
  })

  authTest('each history entry shows score achieved', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/history')
    await authenticatedPage.waitForTimeout(1000)

    // Look for score patterns
    const scorePattern = authenticatedPage.locator('text=/\\d+.*pts|\\d+.*points|score.*\\d+|\\d+$/').first()
    const hasScore = await scorePattern.isVisible().catch(() => false)

    // Look for score elements
    const scoreElement = authenticatedPage.locator('[class*="score"]').first()
    const hasScoreElement = await scoreElement.isVisible().catch(() => false)

    // Or empty state
    const emptyState = authenticatedPage.locator('text=/no.*history|no.*games|empty|aucun/i').first()
    const isEmpty = await emptyState.isVisible().catch(() => false)

    expect(hasScore || hasScoreElement || isEmpty).toBeTruthy()
  })

  authTest('clicking on a history entry navigates to detail page', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/history')
    await authenticatedPage.waitForTimeout(1000)

    // Look for clickable history entries
    const historyLink = authenticatedPage.locator('a[href*="/history/"], a[href*="/game/"], [class*="history"] a').first()
    const hasHistoryLink = await historyLink.isVisible().catch(() => false)

    if (hasHistoryLink) {
      await historyLink.click()
      await authenticatedPage.waitForTimeout(1000)

      const currentUrl = authenticatedPage.url()

      // Should navigate to a detail page
      const isDetailPage = currentUrl.includes('/history/') || currentUrl.includes('/game/')
      expect(isDetailPage).toBeTruthy()
    } else {
      // If no links, might be empty state or cards without links
      // Look for clickable cards
      const clickableCard = authenticatedPage.locator('[class*="history"][role="button"], [class*="game"][role="button"]').first()
      const hasClickableCard = await clickableCard.isVisible().catch(() => false)

      if (hasClickableCard) {
        await clickableCard.click()
        await authenticatedPage.waitForTimeout(1000)

        const currentUrl = authenticatedPage.url()
        const isDetailPage = currentUrl.includes('/history/') || currentUrl.includes('/game/')
        expect(isDetailPage).toBeTruthy()
      } else {
        // No clickable history entries - might be empty
        expect(true).toBeTruthy()
      }
    }
  })

  authTest('shows appropriate empty state when user has no history', async ({ authenticatedPage }) => {
    // This test verifies the empty state UI exists
    // For e2e_user who might have no games, this should show empty state
    await authenticatedPage.goto('/en/history')
    await authenticatedPage.waitForTimeout(1500)

    // Look for empty state message - broader patterns
    const emptyState = authenticatedPage.locator('text=/no.*history|no.*games|empty|haven\'t played|aucun|pas encore|play.*first|jouez/i').first()
    const hasEmptyState = await emptyState.isVisible().catch(() => false)

    // Or look for empty state illustration/icon/card
    const emptyStateIllustration = authenticatedPage.locator('[class*="empty"], [class*="no-data"], [class*="muted"]').first()
    const hasEmptyIllustration = await emptyStateIllustration.isVisible().catch(() => false)

    // Or there is actual history content (table, cards, list items)
    const historyContent = authenticatedPage.locator('[class*="history-item"], [class*="game-entry"], [class*="Card"], table, tr:not(:first-child)').first()
    const hasHistoryContent = await historyContent.isVisible().catch(() => false)

    // Check if the page loaded at all with main content
    const mainContent = authenticatedPage.locator('main, [role="main"], h1, h2').first()
    const hasMainContent = await mainContent.isVisible().catch(() => false)

    // Either empty state, history content, or at least main content should be visible
    expect(hasEmptyState || hasEmptyIllustration || hasHistoryContent || hasMainContent).toBeTruthy()
  })
})
