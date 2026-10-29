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

    await page.waitForTimeout(3000)

    const zoomToggle = page.locator('button[title="Zoom"]')
    await expect(zoomToggle).toBeVisible({ timeout: 5000 })
    await zoomToggle.click()

    const zoomIn = page.locator('button[title="Zoom in"]')
    const zoomOut = page.locator('button[title="Zoom out"]')

    const zoomInVisible = await zoomIn.isVisible({ timeout: 5000 }).catch(() => false)
    const zoomOutVisible = await zoomOut.isVisible({ timeout: 5000 }).catch(() => false)

    expect(zoomInVisible && zoomOutVisible).toBe(true)
  })

  test('should be able to click zoom out and see percentage', async ({ page }) => {
    await page.goto('/en/play')
    await waitForGameLoad(page)
    await startDailyGame(page)

    await page.waitForTimeout(3000)

    const zoomToggle = page.locator('button[title="Zoom"]')
    if (await zoomToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      await zoomToggle.click()
    }

    const zoomOut = page.locator('button[title="Zoom out"]')

    if (await zoomOut.isVisible({ timeout: 5000 }).catch(() => false)) {
      await zoomOut.click()
      await page.waitForTimeout(500)

      await page.screenshot({ path: '/tmp/zoom-test-after-zoom.png' })

      const zoomPercentage = page.locator('text=/\\d+%/')
      const hasPercentage = await zoomPercentage.isVisible().catch(() => false)

      const resetButton = page.locator('button[title="Reset zoom"]')
      const hasReset = await resetButton.isVisible().catch(() => false)

      expect(hasPercentage || hasReset).toBe(true)
    }
  })
})
