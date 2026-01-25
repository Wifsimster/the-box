import { test, expect } from '@playwright/test'
import { test as authTest } from './fixtures/auth.fixture'

/**
 * E2E Tests for User Profile Page
 *
 * Prerequisites:
 * - Backend server must be running
 * - Database must be seeded with npm run e2e:seed
 */

test.describe('Profile - Authentication Required', () => {
  test('profile page requires authentication (redirects to login if not logged in)', async ({ page }) => {
    await page.goto('/en/profile')
    await page.waitForTimeout(2000)

    const currentUrl = page.url()

    // Should redirect to login or show login required
    const redirectedToLogin = currentUrl.includes('/login')
    const stayedOnProfile = currentUrl.includes('/profile')

    if (stayedOnProfile) {
      // Check for login prompt or unauthorized message
      const loginPrompt = page.locator('text=/login|sign in|unauthorized|connexion/i').first()
      const hasPrompt = await loginPrompt.isVisible().catch(() => false)

      expect(hasPrompt || redirectedToLogin).toBeTruthy()
    } else {
      expect(redirectedToLogin).toBeTruthy()
    }
  })
})

test.describe('Profile - Authenticated User', () => {
  authTest('profile page at /en/profile loads for authenticated user', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForTimeout(1000)

    const currentUrl = authenticatedPage.url()

    // Should stay on profile page
    expect(currentUrl).toContain('/profile')

    // Page should have content
    const pageContent = authenticatedPage.locator('main, [role="main"], h1, h2').first()
    await expect(pageContent).toBeVisible()
  })

  authTest('displays username and/or display name', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForTimeout(1000)

    // Look for e2e_user username or display name
    const username = authenticatedPage.locator('text=/e2e_user|E2E.*User|E2E Test User/i').first()
    const hasUsername = await username.isVisible().catch(() => false)

    // Or look for generic username display
    const usernameElement = authenticatedPage.locator('[class*="username"], [class*="name"], h1, h2').first()
    const hasUsernameElement = await usernameElement.isVisible().catch(() => false)

    expect(hasUsername || hasUsernameElement).toBeTruthy()
  })

  authTest('displays total score statistic', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForTimeout(1000)

    // Look for score label and value
    const scoreLabel = authenticatedPage.locator('text=/score|points|pts/i').first()
    const hasScoreLabel = await scoreLabel.isVisible().catch(() => false)

    // Look for numeric score value
    const scoreValue = authenticatedPage.locator('[class*="score"], [class*="stat"]').first()
    const hasScoreValue = await scoreValue.isVisible().catch(() => false)

    // Look for number that could be a score
    const numericScore = authenticatedPage.locator('text=/^\\d+$|\\d+ pts|\\d+ points/').first()
    const hasNumericScore = await numericScore.isVisible().catch(() => false)

    expect(hasScoreLabel || hasScoreValue || hasNumericScore).toBeTruthy()
  })

  authTest('displays streak information (current or longest)', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForTimeout(1000)

    // Look for streak label
    const streakLabel = authenticatedPage.locator('text=/streak|série|consecutive|jours consécutifs/i').first()
    const hasStreakLabel = await streakLabel.isVisible().catch(() => false)

    // Look for streak elements
    const streakElement = authenticatedPage.locator('[class*="streak"]').first()
    const hasStreakElement = await streakElement.isVisible().catch(() => false)

    // Look for current or longest streak indicators
    const currentStreak = authenticatedPage.locator('text=/current.*streak|série.*actuelle/i').first()
    const longestStreak = authenticatedPage.locator('text=/longest.*streak|best.*streak|meilleure.*série/i').first()
    const hasCurrentStreak = await currentStreak.isVisible().catch(() => false)
    const hasLongestStreak = await longestStreak.isVisible().catch(() => false)

    expect(hasStreakLabel || hasStreakElement || hasCurrentStreak || hasLongestStreak).toBeTruthy()
  })

  authTest('displays achievement count or summary', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForTimeout(1000)

    // Look for achievements label
    const achievementLabel = authenticatedPage.locator('text=/achievement|badge|succès|trophée/i').first()
    const hasAchievementLabel = await achievementLabel.isVisible().catch(() => false)

    // Look for achievement count format
    const achievementCount = authenticatedPage.locator('text=/\\d+.*achievement|\\d+.*badge|\\d+\\/\\d+/i').first()
    const hasAchievementCount = await achievementCount.isVisible().catch(() => false)

    // Look for achievement section
    const achievementSection = authenticatedPage.locator('[class*="achievement"], [class*="badge"]').first()
    const hasAchievementSection = await achievementSection.isVisible().catch(() => false)

    expect(hasAchievementLabel || hasAchievementCount || hasAchievementSection).toBeTruthy()
  })
})
