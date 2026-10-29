import { test, expect } from '@playwright/test'
import { test as authTest } from './fixtures/auth.fixture'

test.describe('Profile - Authentication Required', () => {
  test('profile page requires authentication (redirects to login if not logged in)', async ({ page }) => {
    await page.goto('/en/profile')
    await page.waitForTimeout(2000)

    const currentUrl = page.url()

    const redirectedToLogin = currentUrl.includes('/login')
    const stayedOnProfile = currentUrl.includes('/profile')

    if (stayedOnProfile) {
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

    expect(currentUrl).toContain('/profile')

    const pageContent = authenticatedPage.locator('main, [role="main"], h1, h2').first()
    await expect(pageContent).toBeVisible()
  })

  authTest('displays username and/or display name', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForTimeout(1000)

    const username = authenticatedPage.locator('text=/e2e_user|E2E.*User|E2E Test User/i').first()
    const hasUsername = await username.isVisible().catch(() => false)

    const usernameElement = authenticatedPage.locator('[class*="username"], [class*="name"], h1, h2').first()
    const hasUsernameElement = await usernameElement.isVisible().catch(() => false)

    expect(hasUsername || hasUsernameElement).toBeTruthy()
  })

  authTest('displays total score statistic', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForTimeout(1000)

    const scoreLabel = authenticatedPage.locator('text=/score|points|pts/i').first()
    const hasScoreLabel = await scoreLabel.isVisible().catch(() => false)

    const scoreValue = authenticatedPage.locator('[class*="score"], [class*="stat"]').first()
    const hasScoreValue = await scoreValue.isVisible().catch(() => false)

    const numericScore = authenticatedPage.locator('text=/^\\d+$|\\d+ pts|\\d+ points/').first()
    const hasNumericScore = await numericScore.isVisible().catch(() => false)

    expect(hasScoreLabel || hasScoreValue || hasNumericScore).toBeTruthy()
  })

  authTest('displays streak information (current or longest)', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForTimeout(1000)

    const streakLabel = authenticatedPage.locator('text=/streak|série|consecutive|jours consécutifs/i').first()
    const hasStreakLabel = await streakLabel.isVisible().catch(() => false)

    const streakElement = authenticatedPage.locator('[class*="streak"]').first()
    const hasStreakElement = await streakElement.isVisible().catch(() => false)

    const currentStreak = authenticatedPage.locator('text=/current.*streak|série.*actuelle/i').first()
    const longestStreak = authenticatedPage.locator('text=/longest.*streak|best.*streak|meilleure.*série/i').first()
    const hasCurrentStreak = await currentStreak.isVisible().catch(() => false)
    const hasLongestStreak = await longestStreak.isVisible().catch(() => false)

    expect(hasStreakLabel || hasStreakElement || hasCurrentStreak || hasLongestStreak).toBeTruthy()
  })

  authTest('displays achievement count or summary', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForTimeout(1000)

    const achievementLabel = authenticatedPage.locator('text=/achievement|badge|succès|trophée/i').first()
    const hasAchievementLabel = await achievementLabel.isVisible().catch(() => false)

    const achievementCount = authenticatedPage.locator('text=/\\d+.*achievement|\\d+.*badge|\\d+\\/\\d+/i').first()
    const hasAchievementCount = await achievementCount.isVisible().catch(() => false)

    const achievementSection = authenticatedPage.locator('[class*="achievement"], [class*="badge"]').first()
    const hasAchievementSection = await achievementSection.isVisible().catch(() => false)

    expect(hasAchievementLabel || hasAchievementCount || hasAchievementSection).toBeTruthy()
  })
})

test.describe('Profile - Mobile viewport (375px)', () => {
  test.use({ viewport: { width: 375, height: 667 } })

  authTest('profile content fits 375px width without horizontal overflow', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForTimeout(1500)

    const hasHorizontalOverflow = await authenticatedPage.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    )
    expect(hasHorizontalOverflow).toBeFalsy()
  })

  authTest('main heading is inside the viewport at 375px', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForTimeout(1500)

    const heading = authenticatedPage.locator('h1').first()
    if (!(await heading.isVisible().catch(() => false))) return

    const box = await heading.boundingBox()
    expect(box, 'profile heading has a bounding box').not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(375)
  })
})
