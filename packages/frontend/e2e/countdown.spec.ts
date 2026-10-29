import { test, expect, type Page } from '@playwright/test'
import { loginAsUser, waitForGameLoad, startDailyGame, skipScreenshot } from './helpers/game-helpers'

async function readTimerSeconds(page: Page): Promise<number> {
  const label = await page.getByRole('timer').getAttribute('aria-label')
  const match = label?.match(/(\d+)/)
  return match ? parseInt(match[1]!, 10) : NaN
}

async function startPlayingWithFrozenClock(page: Page) {
  await page.clock.install()
  await page.clock.resume()
  await loginAsUser(page)
  await page.goto('/en/play')
  await waitForGameLoad(page)
  await startDailyGame(page)

  await expect(page.getByRole('timer')).toBeVisible({ timeout: 10000 })

  const pageNow = await page.evaluate(() => Date.now())
  await page.clock.pauseAt(new Date(pageNow + 500))
}

test.describe('Daily Game - Countdown Timer', () => {
  test('shows the countdown near the limit when a round starts', async ({ page }) => {
    await startPlayingWithFrozenClock(page)

    const timer = page.getByRole('timer')
    await expect(timer).toBeVisible()
    await expect(timer).toHaveAttribute('data-state', 'normal')

    const seconds = await readTimerSeconds(page)
    expect(seconds).toBeGreaterThan(30)
    expect(seconds).toBeLessThanOrEqual(45)
  })

  test('ticks down and enters the critical state near zero', async ({ page }) => {
    await startPlayingWithFrozenClock(page)

    const before = await readTimerSeconds(page)
    await page.clock.fastForward(10_000)
    await page.waitForTimeout(150)

    const after = await readTimerSeconds(page)
    expect(after).toBeLessThan(before)
    expect(before - after).toBeGreaterThanOrEqual(8)

    await page.clock.fastForward(Math.max(0, after - 3) * 1000)
    await page.waitForTimeout(150)
    await expect(page.getByRole('timer')).toHaveAttribute('data-state', 'critical')
  })

  test('locks the screenshot as timed-out and advances when time runs out', async ({ page }) => {
    await startPlayingWithFrozenClock(page)

    const remaining = await readTimerSeconds(page)
    await page.clock.fastForward((remaining + 1) * 1000)

    await expect(
      page.getByRole('tab').filter({ hasText: /^1$/ }).first()
    ).toHaveAttribute('aria-label', /timed out/i)

    await expect(page.getByRole('timer')).toBeVisible({ timeout: 10000 })
    await expect
      .poll(async () => readTimerSeconds(page), { timeout: 10000 })
      .toBeGreaterThan(30)
  })

  test('navigating away and back does NOT reset the countdown (exploit closed)', async ({ page }) => {
    await startPlayingWithFrozenClock(page)

    const p1Start = await readTimerSeconds(page)
    expect(p1Start).toBeGreaterThan(5)

    await page.clock.fastForward(15_000)
    await page.waitForTimeout(150)
    const p1Before = await readTimerSeconds(page)
    expect(p1Start - p1Before).toBeGreaterThanOrEqual(13)
    expect(p1Start - p1Before).toBeLessThanOrEqual(17)

    await skipScreenshot(page)
    await expect.poll(async () => readTimerSeconds(page), { timeout: 10000 }).toBeGreaterThan(40)

    await page.getByRole('tab').filter({ hasText: /^1$/ }).first().click()
    await page.waitForTimeout(300)

    const p1After = await readTimerSeconds(page)
    expect(Math.abs(p1After - p1Before)).toBeLessThanOrEqual(2)
    expect(p1After).toBeLessThan(40)

    await page.clock.fastForward(5_000)
    await page.waitForTimeout(150)
    const ticking = await readTimerSeconds(page)
    expect(ticking).toBeLessThan(p1After)

    await page.clock.fastForward((ticking + 1) * 1000)
    await expect(
      page.getByRole('tab').filter({ hasText: /^1$/ }).first()
    ).toHaveAttribute('aria-label', /timed out/i)
  })
})
