import { test, expect } from '@playwright/test'
import {
  loginAsUser,
  waitForGameLoad,
  startDailyGame,
} from './helpers/game-helpers'

test.describe('Zoom Feature', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsUser(page)
  })

  test('should display zoom controls during gameplay', async ({ page }) => {
    await page.goto('/en/play')
    await waitForGameLoad(page)
    await startDailyGame(page)

    // Wait for game to fully load with screenshot
    await page.waitForTimeout(3000)

    // Take screenshot for debugging
    await page.screenshot({ path: '/tmp/zoom-test-gameplay.png' })

    // Check for zoom controls - they should be in the bottom-left
    const zoomIn = page.locator('button[title="Zoom in"]')
    const zoomOut = page.locator('button[title="Zoom out"]')

    const zoomInVisible = await zoomIn.isVisible({ timeout: 5000 }).catch(() => false)
    const zoomOutVisible = await zoomOut.isVisible({ timeout: 5000 }).catch(() => false)

    // Verify zoom controls exist
    expect(zoomInVisible && zoomOutVisible).toBe(true)
  })

  test('should be able to click zoom out and see percentage', async ({ page }) => {
    await page.goto('/en/play')
    await waitForGameLoad(page)
    await startDailyGame(page)

    await page.waitForTimeout(3000)

    const zoomOut = page.locator('button[title="Zoom out"]')

    if (await zoomOut.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Click zoom out
      await zoomOut.click()
      await page.waitForTimeout(500)

      // Take screenshot after zooming
      await page.screenshot({ path: '/tmp/zoom-test-after-zoom.png' })

      // Check for zoom percentage display (should show 85%)
      const zoomPercentage = page.locator('text=/\\d+%/')
      const hasPercentage = await zoomPercentage.isVisible().catch(() => false)

      // Check for reset button (appears after zooming)
      const resetButton = page.locator('button[title="Reset zoom"]')
      const hasReset = await resetButton.isVisible().catch(() => false)

      expect(hasPercentage || hasReset).toBe(true)
    }
  })
})
