import { test, expect, type Page } from '@playwright/test'
import { loginAsUser, waitForGameLoad, startDailyGame, skipScreenshot } from './helpers/game-helpers'

/**
 * E2E for the per-screenshot 45s countdown timer.
 *
 * Determinism: we drive the browser's clock with `page.clock` so a 45s flow
 * runs in milliseconds. The clock is installed BEFORE navigation (so it
 * controls the timer's interval), left running in real time during login/start
 * so framer-motion entrances complete, then frozen with `pauseAt` for exact
 * `fastForward` control.
 */

/** Parse the seconds out of the timer's accessible name ("Time remaining: N seconds"). */
async function readTimerSeconds(page: Page): Promise<number> {
  const label = await page.getByRole('timer').getAttribute('aria-label')
  const match = label?.match(/(\d+)/)
  return match ? parseInt(match[1]!, 10) : NaN
}

/** Log in, start the daily game, then freeze the clock with the timer live. */
async function startPlayingWithFrozenClock(page: Page) {
  await page.clock.install()
  await page.clock.resume() // real time during load → animations settle
  await loginAsUser(page)
  await page.goto('/en/play')
  await waitForGameLoad(page)
  await startDailyGame(page)

  await expect(page.getByRole('timer')).toBeVisible({ timeout: 10000 })

  // Freeze for deterministic fast-forwarding. pauseAt() internally
  // fast-forwards to the given instant, which throws "Cannot fast-forward to
  // the past" if the fake clock has already advanced past it between the
  // evaluate() round-trip and the pauseAt() call. Pause a small step in the
  // future so the target is always ahead of the clock; the ~0.5s costs one
  // tick off the 45s budget, well within every assertion's tolerance.
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
    await page.waitForTimeout(150) // let React flush the tick

    const after = await readTimerSeconds(page)
    expect(after).toBeLessThan(before)
    expect(before - after).toBeGreaterThanOrEqual(8)

    // Push into the final few seconds → critical band.
    await page.clock.fastForward(Math.max(0, after - 3) * 1000)
    await page.waitForTimeout(150)
    await expect(page.getByRole('timer')).toHaveAttribute('data-state', 'critical')
  })

  test('locks the screenshot as timed-out and advances when time runs out', async ({ page }) => {
    await startPlayingWithFrozenClock(page)

    const remaining = await readTimerSeconds(page)
    // Cross the limit (with a small margin) so the timeout fires exactly once.
    await page.clock.fastForward((remaining + 1) * 1000)

    // The position the player ran out of time on is locked as a permanent miss.
    await expect(
      page.getByRole('tab').filter({ hasText: /^1$/ }).first()
    ).toHaveAttribute('aria-label', /timed out/i)

    // …and the round re-arms on the next position (timer back near full).
    await expect(page.getByRole('timer')).toBeVisible({ timeout: 10000 })
    await expect
      .poll(async () => readTimerSeconds(page), { timeout: 10000 })
      .toBeGreaterThan(30)
  })

  test('navigating away and back does NOT reset the countdown (exploit closed)', async ({ page }) => {
    await startPlayingWithFrozenClock(page)

    // Baseline the timer at the moment we froze the clock. Asserting deltas
    // from this value (instead of an assumed pristine 45s) keeps the test
    // robust to however much real time the login/start flow burned before the
    // freeze.
    const p1Start = await readTimerSeconds(page)
    expect(p1Start).toBeGreaterThan(5) // sanity: a live countdown is running

    // Spend ~15s on position 1 → the budget drops by ~15s.
    await page.clock.fastForward(15_000)
    await page.waitForTimeout(150)
    const p1Before = await readTimerSeconds(page)
    expect(p1Start - p1Before).toBeGreaterThanOrEqual(13)
    expect(p1Start - p1Before).toBeLessThanOrEqual(17)

    // Skip to position 2 (banks the elapsed time into position 1) — its own
    // budget is fresh, so it reads clearly higher than position 1's remainder.
    await skipScreenshot(page)
    await expect.poll(async () => readTimerSeconds(page), { timeout: 10000 }).toBeGreaterThan(40)

    // Navigate back to position 1 (skipped → revisitable).
    await page.getByRole('tab').filter({ hasText: /^1$/ }).first().click()
    await page.waitForTimeout(300)

    // Exploit check: the timer RESUMES at the banked remainder — close to
    // p1Before — and is NOT reset to the full 45s budget.
    const p1After = await readTimerSeconds(page)
    expect(Math.abs(p1After - p1Before)).toBeLessThanOrEqual(2)
    expect(p1After).toBeLessThan(40)

    // …and it keeps ticking DOWN from the resumed value.
    await page.clock.fastForward(5_000)
    await page.waitForTimeout(150)
    const ticking = await readTimerSeconds(page)
    expect(ticking).toBeLessThan(p1After)

    // Exhausting the remaining budget still times the position out — the
    // round-trip didn't buy extra time.
    await page.clock.fastForward((ticking + 1) * 1000)
    await expect(
      page.getByRole('tab').filter({ hasText: /^1$/ }).first()
    ).toHaveAttribute('aria-label', /timed out/i)
  })
})
