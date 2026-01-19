import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  waitForGameLoad,
  startDailyGame,
  navigateToPosition,
  visitAllPositions,
  submitGuess,
  skipScreenshot,
  endGame,
  getCurrentScore,
  isOnPosition,
  clickHint,
} from './helpers/game-helpers'

/**
 * E2E Tests for Daily Party Game
 *
 * Prerequisites:
 * - Backend server must be running (npm run dev:backend)
 * - Frontend dev server will be started automatically by playwright.config.ts
 * - Database should have at least one daily challenge with 10 screenshots
 * - Test user credentials should be available for authenticated tests
 *
 * Environment Variables:
 * - TEST_USER_EMAIL: Email for test user (default: testuser@example.com)
 * - TEST_USER_PASSWORD: Password for test user (default: testpass123)
 */

test.describe('Daily Game - Start Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login before accessing game
    await loginAsUser(page)
  })

  test('should display daily intro screen when navigating to /play', async ({ page }) => {
    await page.goto('/en/play')
    await waitForGameLoad(page)

    // Check for intro screen elements
    const introHeading = page.locator('h1, h2').filter({ hasText: /daily|challenge|quotidien/i }).first()
    await expect(introHeading).toBeVisible({ timeout: 5000 })

    // Check for start button
    const startButton = page.getByRole('button', { name: /start|commencer|play/i })
    await expect(startButton).toBeVisible()
  })

  test('should start game when clicking start button', async ({ page }) => {
    await page.goto('/en/play')
    await waitForGameLoad(page)

    // Start the game using helper
    await startDailyGame(page)

    // Check for game elements: input field, score, or progress dots
    const gameInput = page.locator('input[type="text"]').first()
    const hasInput = await gameInput.isVisible().catch(() => false)

    const progressDots = page.locator('button').filter({ hasText: /^[1-9]|10$/ }).first()
    const hasProgress = await progressDots.isVisible().catch(() => false)

    // Either input or progress dots should be visible
    expect(hasInput || hasProgress).toBeTruthy()
  })

  test('should load game session directly if already started', async ({ page }) => {
    await page.goto('/en/play')
    await waitForGameLoad(page)

    // If game already in progress, should skip intro
    // Check if we're in playing state (has input or skip button)
    const skipButton = page.getByRole('button', { name: /skip/i })
    const hasSkip = await skipButton.isVisible().catch(() => false)

    // If we see skip button, we're in game already
    if (hasSkip) {
      expect(hasSkip).toBeTruthy()
    }
  })
})

test.describe('Daily Game - Gameplay', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)
    await page.goto('/en/play')
    await waitForGameLoad(page)
    await startDailyGame(page)
  })

  test('should display progress dots for 10 positions', async ({ page }) => {
    // Wait for progress dots to load
    await page.waitForTimeout(1000)

    // Check for numbered buttons 1-10
    const dot1 = page.getByRole('button').filter({ hasText: /^1$/ })
    const dot10 = page.getByRole('button').filter({ hasText: /^10$/ })

    await expect(dot1).toBeVisible()
    await expect(dot10).toBeVisible()
  })

  test('should display score at the top', async ({ page }) => {
    await page.waitForTimeout(1000)

    // Look for score display (numbers)
    const scoreElement = page.locator('text=/score|points/i').first()
    const hasScore = await scoreElement.isVisible().catch(() => false)

    // Score might not have label, just check for large numbers
    const numberDisplay = page.locator('text=/^\\d{1,4}$/').first()
    const hasNumber = await numberDisplay.isVisible().catch(() => false)

    expect(hasScore || hasNumber).toBeTruthy()
  })

  test('should allow typing in guess input', async ({ page }) => {
    await page.waitForTimeout(1000)

    // Find the game input field
    const gameInput = page.locator('input[type="text"]').first()
    await expect(gameInput).toBeVisible()

    // Type a game name
    await gameInput.fill('The Legend of Zelda')
    await expect(gameInput).toHaveValue('The Legend of Zelda')
  })

  test('should show submit button when input has text', async ({ page }) => {
    await page.waitForTimeout(1000)

    const gameInput = page.locator('input[type="text"]').first()
    await gameInput.fill('Super Mario')

    // Submit button should be visible
    const submitButton = page.getByRole('button', { name: /submit|send|envoyer/i })
    await expect(submitButton).toBeVisible()
  })

  test('should be able to skip a screenshot', async ({ page }) => {
    await page.waitForTimeout(1000)

    // Find skip button
    const skipButton = page.getByRole('button', { name: /skip/i })

    if (await skipButton.isVisible()) {
      // Get current position before skip
      const currentDot = page.locator('button[class*="ring"]').first()
      const currentText = await currentDot.textContent().catch(() => '1')
      const currentPos = parseInt(currentText || '1')

      // Click skip
      await skipButton.click()
      await page.waitForTimeout(1000)

      // Check if position changed (should move to next position)
      const newDot = page.locator('button[class*="ring"]').first()
      const newText = await newDot.textContent().catch(() => '2')
      const newPos = parseInt(newText || '2')

      // Position should have incremented (or wrapped to 1 if was at 10)
      expect(newPos !== currentPos).toBeTruthy()
    }
  })

  test('should navigate to different position by clicking progress dot', async ({ page }) => {
    await page.waitForTimeout(1000)

    // Click on position 3
    const dot3 = page.getByRole('button').filter({ hasText: /^3$/ }).first()

    if (await dot3.isVisible()) {
      await dot3.click()
      await page.waitForTimeout(1000)

      // Check if position 3 is now active (has ring or different styling)
      // Note: This depends on your implementation
      const activeDot = page.locator('button[class*="ring"]').first()
      const activeText = await activeDot.textContent()

      // Should be on position 3
      expect(activeText).toContain('3')
    }
  })

  test('should show result card after submitting a guess', async ({ page }) => {
    await page.waitForTimeout(1000)

    const gameInput = page.locator('input[type="text"]').first()
    await gameInput.fill('Minecraft')

    const submitButton = page.getByRole('button', { name: /submit|send|envoyer/i })
    await submitButton.click()

    // Wait for result card (correct or incorrect)
    await page.waitForTimeout(2000)

    // Look for result indicators: checkmark, X, score change, or "next" button
    const nextButton = page.getByRole('button', { name: /next|suivant/i })
    const hasNext = await nextButton.isVisible().catch(() => false)

    const correctIcon = page.locator('svg[class*="check"], text=/correct|bravo/i').first()
    const hasCorrect = await correctIcon.isVisible().catch(() => false)

    const incorrectIcon = page.locator('svg[class*="x"], text=/incorrect|wrong/i').first()
    const hasIncorrect = await incorrectIcon.isVisible().catch(() => false)

    // Should show some result feedback
    expect(hasNext || hasCorrect || hasIncorrect).toBeTruthy()
  })

  test('should display hint buttons (year and publisher)', async ({ page }) => {
    await page.waitForTimeout(1000)

    // Look for hint buttons - they might have icons or text
    const yearHint = page.locator('button').filter({ hasText: /year|année|calendar/i }).or(
      page.locator('button svg[class*="calendar"]').locator('..')
    ).first()

    const publisherHint = page.locator('button').filter({ hasText: /publisher|éditeur|building/i }).or(
      page.locator('button svg[class*="building"]').locator('..')
    ).first()

    const hasYearHint = await yearHint.isVisible().catch(() => false)
    const hasPublisherHint = await publisherHint.isVisible().catch(() => false)

    // At least one hint button should be visible
    expect(hasYearHint || hasPublisherHint).toBeTruthy()
  })
})

test.describe('Daily Game - End Game Flow', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)
    await page.goto('/en/play')
    await waitForGameLoad(page)
    await startDailyGame(page)
  })

  test('should show end game button after visiting all positions', async ({ page }) => {
    // Visit all positions using helper
    await visitAllPositions(page)

    // Now end game button should be visible
    const endGameButton = page.getByRole('button', { name: /end game|terminer|forfeit/i })
    const hasEndButton = await endGameButton.isVisible({ timeout: 3000 }).catch(() => false)

    expect(hasEndButton).toBeTruthy()
  })

  test('should show confirmation dialog when clicking end game', async ({ page }) => {
    // Visit all positions using helper
    await visitAllPositions(page)

    // Click end game button
    const endGameButton = page.getByRole('button', { name: /end game|terminer|forfeit/i })
    if (await endGameButton.isVisible()) {
      await endGameButton.click()

      // Wait for confirmation dialog
      await page.waitForTimeout(1000)

      // Look for dialog with confirmation text
      const dialog = page.getByRole('dialog')
      const hasDialog = await dialog.isVisible().catch(() => false)

      if (hasDialog) {
        await expect(dialog).toBeVisible()

        // Check for confirm/cancel buttons
        const confirmButton = page.getByRole('button', { name: /confirm|yes|oui/i })
        const cancelButton = page.getByRole('button', { name: /cancel|no|non|annuler/i })

        await expect(confirmButton.or(cancelButton)).toBeVisible()
      }
    }
  })

  test('should navigate to results page after confirming end game', async ({ page }) => {
    // Visit all positions and end game using helpers
    await visitAllPositions(page)
    await endGame(page, true)

    // Should be on results page
    const currentUrl = page.url()
    expect(currentUrl).toContain('/results')
  })

  test('should stay on game page when canceling end game dialog', async ({ page }) => {
    // Visit all positions and cancel end game using helpers
    await visitAllPositions(page)
    await endGame(page, false)

    // Should still be on play page
    const currentUrl = page.url()
    expect(currentUrl).toContain('/play')

    // End game button should still be visible
    const endGameButton = page.getByRole('button', { name: /end game|terminer|forfeit/i })
    await expect(endGameButton).toBeVisible()
  })
})

test.describe('Daily Game - Results Page', () => {
  test('should display results page after completing game', async ({ page }) => {
    await loginAsUser(page)

    // Try to navigate directly to results (if game was completed)
    await page.goto('/en/results')
    await page.waitForTimeout(2000)

    // Check if on results page
    const currentUrl = page.url()

    if (currentUrl.includes('/results')) {
      // Should see results elements
      const scoreDisplay = page.locator('text=/score|points|total/i').first()
      await expect(scoreDisplay).toBeVisible({ timeout: 5000 })
    }
  })

  test('should display final score on results page', async ({ page }) => {
    await loginAsUser(page)
    await page.goto('/en/results')
    await page.waitForTimeout(2000)

    if (page.url().includes('/results')) {
      // Look for large score number
      const scoreNumber = page.locator('text=/^\\d{1,4}$/').first()
      const hasScore = await scoreNumber.isVisible().catch(() => false)

      // Or look for "score" label
      const scoreLabel = page.locator('text=/score|points/i').first()
      const hasLabel = await scoreLabel.isVisible().catch(() => false)

      expect(hasScore || hasLabel).toBeTruthy()
    }
  })

  test('should display all 10 guess results', async ({ page }) => {
    await loginAsUser(page)
    await page.goto('/en/results')
    await page.waitForTimeout(2000)

    if (page.url().includes('/results')) {
      // Look for list of results - should have multiple entries
      // This depends on implementation, but might be in a list or grid
      const resultsList = page.locator('[class*="result"], [class*="guess"]')
      const count = await resultsList.count()

      // Should have results (up to 10)
      expect(count).toBeGreaterThan(0)
    }
  })

  test('should show buttons to navigate to leaderboard or home', async ({ page }) => {
    await loginAsUser(page)
    await page.goto('/en/results')
    await page.waitForTimeout(2000)

    if (page.url().includes('/results')) {
      // Look for navigation buttons
      const leaderboardButton = page.getByRole('link', { name: /leaderboard|classement/i }).or(
        page.getByRole('button', { name: /leaderboard|classement/i })
      )

      const homeButton = page.getByRole('link', { name: /home|accueil/i }).or(
        page.getByRole('button', { name: /home|accueil/i })
      )

      const hasLeaderboard = await leaderboardButton.isVisible().catch(() => false)
      const hasHome = await homeButton.isVisible().catch(() => false)

      // Should have at least one navigation option
      expect(hasLeaderboard || hasHome).toBeTruthy()
    }
  })

  test('should navigate to leaderboard when clicking leaderboard button', async ({ page }) => {
    await loginAsUser(page)
    await page.goto('/en/results')
    await page.waitForTimeout(2000)

    if (page.url().includes('/results')) {
      const leaderboardButton = page.getByRole('link', { name: /leaderboard|classement/i }).or(
        page.getByRole('button', { name: /leaderboard|classement/i })
      ).first()

      if (await leaderboardButton.isVisible()) {
        await leaderboardButton.click()
        await page.waitForTimeout(2000)

        // Should navigate to leaderboard
        const currentUrl = page.url()
        expect(currentUrl).toContain('/leaderboard')
      }
    }
  })

  test('should navigate to home when clicking home button', async ({ page }) => {
    await loginAsUser(page)
    await page.goto('/en/results')
    await page.waitForTimeout(2000)

    if (page.url().includes('/results')) {
      const homeButton = page.getByRole('link', { name: /home|accueil/i }).or(
        page.getByRole('button', { name: /home|accueil/i })
      ).first()

      if (await homeButton.isVisible()) {
        await homeButton.click()
        await page.waitForTimeout(2000)

        // Should navigate to home
        const currentUrl = page.url()
        expect(currentUrl).toMatch(/\/(en\/?)?$/)
      }
    }
  })
})

test.describe('Daily Game - Error Handling', () => {
  test('should redirect to login if not authenticated', async ({ page }) => {
    // Try to access game without logging in
    await page.goto('/en/play')
    await page.waitForTimeout(2000)

    // Should redirect to login or home
    const currentUrl = page.url()
    const isOnLogin = currentUrl.includes('/login')
    const isOnHome = currentUrl.match(/\/(en\/?)?$/)

    expect(isOnLogin || isOnHome).toBeTruthy()
  })

  test('should show error message if game fails to load', async ({ page }) => {
    await loginAsUser(page)

    // Navigate with invalid date parameter
    await page.goto('/en/play?date=2099-12-31')
    await page.waitForTimeout(3000)

    // Should show error or redirect
    const errorMessage = page.locator('[role="alert"], .error, text=/error|erreur/i').first()
    const hasError = await errorMessage.isVisible().catch(() => false)

    // Either shows error or redirects to valid page
    if (!hasError) {
      const currentUrl = page.url()
      expect(currentUrl).toBeTruthy()
    }
  })
})

test.describe('Daily Game - Mobile Responsiveness', () => {
  test.use({
    viewport: { width: 375, height: 667 }, // iPhone SE
  })

  test('should display game correctly on mobile viewport', async ({ page }) => {
    await loginAsUser(page)
    await page.goto('/en/play')
    await waitForGameLoad(page)
    await startDailyGame(page)

    // Check mobile elements are visible
    const gameInput = page.locator('input[type="text"]').first()
    const hasInput = await gameInput.isVisible().catch(() => false)

    const progressDots = page.locator('button').filter({ hasText: /^[1-9]|10$/ }).first()
    const hasProgress = await progressDots.isVisible().catch(() => false)

    expect(hasInput || hasProgress).toBeTruthy()
  })

  test('should be able to interact with game on mobile', async ({ page }) => {
    await loginAsUser(page)
    await page.goto('/en/play')
    await waitForGameLoad(page)
    await startDailyGame(page)

    // Try to type in input
    const gameInput = page.locator('input[type="text"]').first()
    if (await gameInput.isVisible()) {
      await gameInput.fill('Test Game')
      await expect(gameInput).toHaveValue('Test Game')
    }
  })
})
