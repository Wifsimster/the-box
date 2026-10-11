import { test, expect, type Browser, type Page, type Response } from '@playwright/test'
import { loginAsUser, loginAsAdmin, waitForGameLoad, startDailyGame } from './helpers/game-helpers'
import { runtimeFeatures } from './helpers/features'

/**
 * "Describe the game" — shadow capture with NO player UI.
 *
 * A wrong guess typed in the normal input that looks like a description is
 * judged in the background (BullMQ worker) when the feature is on in Admin →
 * Paramètres. The player sees exactly today's wrong-guess feedback.
 *
 * Run the backend with DESCRIBE_GUESS_JUDGE=stub (deterministic judge, no
 * network): the admin pastes a dummy key here. With
 * DESCRIBE_GUESS_STUB_DELAY_MS=3000 the timing check also shows that a slow
 * judge never slows the guess response.
 *
 * App settings are global and Playwright may run this file for two projects
 * at once, so only the chromium project changes them; the read-only authz
 * test runs everywhere. Serial: the steps share settings and e2e_user's
 * daily session (one position per step).
 */
test.describe.configure({ mode: 'serial', timeout: 120_000 })

const SETTINGS_OWNER_PROJECT = 'chromium'
const DUMMY_KEY = 'e2e-dummy-key-not-real-0000'
const DESCRIPTION = 'un jeu avec un gros carre colore sur un fond violet'
const SEED_TITLES = ['E2E Test Game 1', 'E2E Test Game 2', 'E2E Test Game 3']

async function adminPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: './e2e/consent-storage-state.json' })
  const page = await ctx.newPage()
  await loginAsAdmin(page)
  return page
}

async function capturedRows(admin: Page): Promise<Array<{ guessText: string; description: string; model: string; error: string | null }>> {
  const res = await admin.request.get('/api/admin/describe-guesses?limit=100')
  expect(res.ok()).toBe(true)
  return (await res.json()).data.entries
}

async function setFeature(admin: Page, on: boolean) {
  await admin.goto('/en/admin?tab=settings')
  const toggle = admin.getByRole('switch', { name: /enable "describe the game"/i })
  await expect(toggle).toBeVisible()
  if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', String(on))
}

async function startPlaying(page: Page) {
  await loginAsUser(page)
  await page.goto('/en/play')
  await waitForGameLoad(page)
  await startDailyGame(page)
}

async function goToPosition(page: Page, position: number) {
  const dot = page.getByRole('button', { name: new RegExp(`^Screenshot ${position}\\b`) })
  if (await dot.isEnabled()) await dot.click()
  await expect(page.getByRole('button', { name: new RegExp(`^Screenshot ${position} \\(current\\)`) })).toBeVisible()
}

/** Type in the ONE existing guess input and submit; returns the API response and its duration. */
async function guess(page: Page, text: string): Promise<{ res: Response; ms: number; body: { data: Record<string, unknown> } }> {
  const input = page.getByRole('textbox', { name: /game name/i })
  await expect(input).toBeVisible()
  await input.fill(text)
  const answered = page.waitForResponse((r) => r.url().endsWith('/api/game/guess'))
  const t0 = Date.now()
  await page.getByRole('button', { name: /submit guess/i }).click()
  const res = await answered
  const ms = Date.now() - t0
  return { res, ms, body: await res.json() }
}

test.describe('Describe the game (shadow capture, no player UI)', () => {
  test('admin settings API: 401 anonymous, 403 for a non-admin', async ({ page, request }) => {
    expect((await request.get('/api/admin/settings', { failOnStatusCode: false })).status()).toBe(401)
    await loginAsUser(page)
    const res = await page.request.put('/api/admin/settings/describeGuess.enabled', {
      data: { value: true },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(403)
  })

  test('off: a wrong description gets the normal wrong feedback and nothing is stored', async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== SETTINGS_OWNER_PROJECT, 'changes global app settings')
    const admin = await adminPage(browser)
    for (const key of ['describeGuess.enabled', 'describeGuess.anthropicApiKey']) {
      expect((await admin.request.put(`/api/admin/settings/${key}`, { data: { value: null } })).ok()).toBe(true)
    }
    const before = (await capturedRows(admin)).length

    expect((await runtimeFeatures(page.request)).describeGuess).toBe(false)
    await startPlaying(page)
    await goToPosition(page, 2)
    const { body } = await guess(page, DESCRIPTION)
    expect(body.data.isCorrect).toBe(false)
    await expect(page.getByText('Incorrect guess. Try again.').first()).toBeVisible()

    await page.waitForTimeout(3000) // give a (wrongly) enqueued job time to land
    expect((await capturedRows(admin)).length).toBe(before)
    // The old describe route is gone.
    expect((await page.request.post('/api/game/describe', { data: {}, failOnStatusCode: false })).status()).toBe(404)
    await admin.context().close()
  })

  test('on: a wrong description gets the normal feedback, as fast as a wrong title, and a row is stored', async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== SETTINGS_OWNER_PROJECT, 'changes global app settings')
    const admin = await adminPage(browser)
    await admin.goto('/en/admin?tab=settings')
    await admin.getByTestId('secret-input-describeGuess.anthropicApiKey').fill(DUMMY_KEY)
    await admin.getByTestId('secret-save-describeGuess.anthropicApiKey').click()
    await expect(admin.getByTestId('secret-status-describeGuess.anthropicApiKey')).toContainText('e2e…0000')
    await setFeature(admin, true)
    const before = (await capturedRows(admin)).length

    await startPlaying(page)
    // No new UI anywhere on the game screen.
    await expect(page.getByText(/describe the game/i)).toHaveCount(0)

    await goToPosition(page, 3)
    const titleGuess = await guess(page, 'zelda') // short wrong title: never sent to the judge
    await goToPosition(page, 4)
    const descGuess = await guess(page, DESCRIPTION)

    // Same wrong-guess answer shape and feedback as a short wrong title.
    expect(descGuess.body.data.isCorrect).toBe(false)
    expect(Object.keys(descGuess.body.data).sort()).toEqual(Object.keys(titleGuess.body.data).sort())
    await expect(page.getByText('Incorrect guess. Try again.').first()).toBeVisible()
    await expect(page.getByText(/describe the game/i)).toHaveCount(0)
    testInfo.annotations.push({ type: 'timing', description: `wrong title ${Math.round(titleGuess.ms)} ms, description ${Math.round(descGuess.ms)} ms` })
    // Comparable to a wrong title, and far below a slow judge's latency.
    expect(descGuess.ms).toBeLessThan(Math.max(1500, titleGuess.ms * 3))

    // Captured off the request path: the row is claimed ('pending') then
    // completed by the worker. Poll the admin list until the verdict lands.
    await expect.poll(async () => (await capturedRows(admin)).length, { timeout: 15_000 }).toBe(before + 1)
    await expect.poll(async () => (await capturedRows(admin))[0]!.error, { timeout: 15_000 }).toBeNull()
    const row = (await capturedRows(admin))[0]!
    expect(row.guessText).toBe(DESCRIPTION)
    expect(row.description).toBe(DESCRIPTION)
    expect(row.model).toBe('stub')
    expect(row.error).toBeNull()
    await admin.context().close()
  })

  test('on: a correct title, and wrong catalogue titles, are never judged', async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== SETTINGS_OWNER_PROJECT, 'changes global app settings')
    const admin = await adminPage(browser)
    const before = (await capturedRows(admin)).length
    expect((await runtimeFeatures(page.request)).describeGuess).toBe(true)

    await startPlaying(page)
    await goToPosition(page, 5)
    // The seed titles are ≥15 chars and 4 words (description-shaped), but they
    // are catalogue titles: the wrong ones are skipped by the worker, the
    // right one never leaves the guess route.
    let solved = false
    for (const title of SEED_TITLES) {
      const { body } = await guess(page, title)
      if (body.data.isCorrect) {
        solved = true
        break
      }
    }
    expect(solved).toBe(true)
    await page.waitForTimeout(3000)
    expect((await capturedRows(admin)).length).toBe(before)
    await admin.context().close()
  })

  test('off again from Paramètres: no capture', async ({ page, browser }, testInfo) => {
    test.skip(testInfo.project.name !== SETTINGS_OWNER_PROJECT, 'changes global app settings')
    const admin = await adminPage(browser)
    await setFeature(admin, false)
    const before = (await capturedRows(admin)).length

    await startPlaying(page)
    await goToPosition(page, 6)
    const { body } = await guess(page, DESCRIPTION)
    expect(body.data.isCorrect).toBe(false)
    await page.waitForTimeout(3000)
    expect((await capturedRows(admin)).length).toBe(before)
    await admin.context().close()
  })
})
