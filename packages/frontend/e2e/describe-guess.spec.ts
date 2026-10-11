import { test, expect, type Page } from '@playwright/test'
import { loginAsUser, waitForGameLoad, startDailyGame, getCurrentScore } from './helpers/game-helpers'
import { runtimeFeatures } from './helpers/features'

/**
 * "Describe the game" — shadow mode.
 *
 * Off by default: needs DESCRIBE_GUESS_ENABLED=true AND ANTHROPIC_API_KEY on
 * the backend. The flag-on test is meant for a backend started with
 * DESCRIBE_GUESS_JUDGE=stub (deterministic judge, no network call); it skips
 * itself when the server reports the feature off, and vice versa.
 */

/** One wrong title attempt through the real input; waits for the API answer. */
async function wrongGuess(page: Page) {
  const input = page.getByRole('textbox', { name: /game name/i })
  await expect(input).toBeVisible()
  await input.fill('Definitely Not A Game')
  const answered = page.waitForResponse((r) => r.url().endsWith('/api/game/guess'))
  await page.getByRole('button', { name: /submit guess/i }).click()
  const res = await answered
  expect((await res.json()).data.isCorrect).toBe(false)
}

async function startPlaying(page: Page) {
  await loginAsUser(page)
  await page.goto('/en/play')
  await waitForGameLoad(page)
  await startDailyGame(page)
}

/**
 * One description per screenshot, and both Playwright projects share
 * e2e_user's daily session: each project takes its own position.
 */
async function goToOwnPosition(page: Page, position: number) {
  const dot = page.getByRole('button', { name: new RegExp(`^Screenshot ${position}\\b`) })
  if (await dot.isEnabled()) await dot.click()
  await expect(page.getByRole('button', { name: new RegExp(`^Screenshot ${position} \\(current\\)`) })).toBeVisible()
}

test.describe('Describe the game (shadow mode)', () => {
  test('feature off: no entry after a wrong guess, and the route 404s', async ({ page }) => {
    const features = await runtimeFeatures(page.request)
    test.skip(features.describeGuess, 'describe-guess is enabled on this backend')

    await startPlaying(page)
    await wrongGuess(page)

    await expect(page.getByTestId('describe-game-open')).toHaveCount(0)
    const res = await page.request.post('/api/game/describe', {
      data: { tierSessionId: 'x', screenshotId: 1, position: 1, description: 'a long enough description', locale: 'en' },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(404)
  })

  test('feature on: describe after a wrong guess, acknowledged, score unchanged', async ({ page }, testInfo) => {
    const features = await runtimeFeatures(page.request)
    test.skip(!features.describeGuess, 'describe-guess is disabled on this backend')

    await startPlaying(page)
    await goToOwnPosition(page, testInfo.project.name.includes('Mobile') ? 3 : 2)

    // Hidden before any title attempt: no extra tap on the main flow.
    await expect(page.getByTestId('describe-game-open')).toHaveCount(0)

    await wrongGuess(page)
    const scoreBefore = await getCurrentScore(page)

    const entry = page.getByTestId('describe-game-open')
    await expect(entry).toBeVisible()
    await expect(entry).toContainText(/describe the game/i)
    await expect(entry).toContainText(/beta/i)
    await entry.click()

    const form = page.getByTestId('describe-game-form')
    await expect(form).toBeVisible()
    await expect(form).toContainText(/no points/i)
    const textarea = form.getByRole('textbox')
    await expect(textarea).toBeFocused()

    const submit = page.getByTestId('describe-game-submit')
    await textarea.fill('too short')
    await expect(submit).toBeDisabled()

    await textarea.fill('a test game with a placeholder screenshot and nothing else to see')
    const responsePromise = page.waitForResponse((r) => r.url().endsWith('/api/game/describe'))
    await submit.click()
    const response = await responsePromise
    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { recorded: true } })

    await expect(page.getByTestId('describe-game-ack')).toBeVisible()
    await expect(page.getByTestId('describe-game-ack')).toContainText(/doesn't change your score/i)
    await expect(page.getByTestId('describe-game-open')).toHaveCount(0)
    expect(await getCurrentScore(page)).toBe(scoreBefore)
  })
})
