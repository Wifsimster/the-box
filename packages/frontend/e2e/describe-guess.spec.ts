import { test, expect, type Browser, type Page } from '@playwright/test'
import { loginAsUser, loginAsAdmin, waitForGameLoad, startDailyGame, getCurrentScore } from './helpers/game-helpers'
import { runtimeFeatures } from './helpers/features'

/**
 * "Describe the game" — shadow mode, configured in Admin → Paramètres.
 *
 * The backend should run with DESCRIBE_GUESS_JUDGE=stub (deterministic judge,
 * no network call): an admin pastes a dummy key here, so without the stub a
 * submit would try the real API with that key and only store "no verdict".
 *
 * Serial: the steps share the app settings and e2e_user's daily session.
 * Each Playwright project uses its own screenshot positions.
 */
test.describe.configure({ mode: 'serial' })

const DUMMY_KEY = 'e2e-dummy-key-not-real-0000'

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

async function goToPosition(page: Page, position: number) {
  const dot = page.getByRole('button', { name: new RegExp(`^Screenshot ${position}\\b`) })
  if (await dot.isEnabled()) await dot.click()
  await expect(page.getByRole('button', { name: new RegExp(`^Screenshot ${position} \\(current\\)`) })).toBeVisible()
}

/** Positions per project so both projects can run on one daily session. */
function positions(projectName: string) {
  return projectName.includes('Mobile') ? { describe: 3, off: 5 } : { describe: 2, off: 4 }
}

async function adminPage(browser: Browser): Promise<Page> {
  const ctx = await browser.newContext({ storageState: './e2e/consent-storage-state.json' })
  const page = await ctx.newPage()
  await loginAsAdmin(page)
  return page
}

/** Reset through the admin API (setup only; the UI path is tested below). */
async function resetSettings(page: Page) {
  for (const key of ['describeGuess.enabled', 'describeGuess.anthropicApiKey']) {
    const res = await page.request.put(`/api/admin/settings/${key}`, { data: { value: null } })
    expect(res.ok()).toBe(true)
  }
}

test.describe('Describe the game (shadow mode)', () => {
  test('admin settings API: 401 anonymous, 403 for a non-admin', async ({ page, request }) => {
    expect((await request.get('/api/admin/settings', { failOnStatusCode: false })).status()).toBe(401)
    await loginAsUser(page)
    const res = await page.request.put('/api/admin/settings/describeGuess.enabled', {
      data: { value: true },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(403)
  })

  test('off by default: no entry after a wrong guess, and the route 404s', async ({ page, browser }) => {
    const admin = await adminPage(browser)
    await resetSettings(admin)
    await admin.context().close()

    expect((await runtimeFeatures(page.request)).describeGuess).toBe(false)
    await startPlaying(page)
    await wrongGuess(page)

    await expect(page.getByTestId('describe-game-open')).toHaveCount(0)
    const res = await page.request.post('/api/game/describe', {
      data: { tierSessionId: 'x', screenshotId: 1, position: 1, description: 'a long enough description', locale: 'en' },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(404)
  })

  test('admin pastes a key and enables it in Paramètres; the player can describe, score unchanged', async ({ page, browser }, testInfo) => {
    const admin = await adminPage(browser)
    await admin.goto('/en/admin?tab=settings')
    const group = admin.getByTestId('settings-group-describeGuess')
    await expect(group).toBeVisible()
    await expect(admin.getByTestId('settings-status-describeGuess')).toContainText(/off/i)

    // Paste the key: stored, masked, never echoed.
    await admin.getByTestId('secret-input-describeGuess.anthropicApiKey').fill(DUMMY_KEY)
    const saved = admin.waitForResponse((r) => r.url().includes('/api/admin/settings/describeGuess.anthropicApiKey'))
    await admin.getByTestId('secret-save-describeGuess.anthropicApiKey').click()
    const savedRes = await saved
    expect(savedRes.status()).toBe(200)
    expect(await savedRes.text()).not.toContain(DUMMY_KEY)
    await expect(admin.getByTestId('secret-status-describeGuess.anthropicApiKey')).toContainText('e2e…0000')
    await expect(admin.getByTestId('secret-input-describeGuess.anthropicApiKey')).toHaveValue('')
    // A key alone does not turn it on.
    await expect(admin.getByTestId('settings-status-describeGuess')).toContainText(/off/i)

    const toggle = admin.getByRole('switch', { name: /enable "describe the game"/i })
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await expect(admin.getByTestId('settings-status-describeGuess')).toContainText(/live/i)
    const listText = await (await admin.request.get('/api/admin/settings')).text()
    expect(listText).not.toContain(DUMMY_KEY)
    await admin.context().close()

    // Player side.
    expect((await runtimeFeatures(page.request)).describeGuess).toBe(true)
    await startPlaying(page)
    await goToPosition(page, positions(testInfo.project.name).describe)
    await expect(page.getByTestId('describe-game-open')).toHaveCount(0)
    await wrongGuess(page)
    const scoreBefore = await getCurrentScore(page)

    const entry = page.getByTestId('describe-game-open')
    await expect(entry).toBeVisible()
    await expect(entry).toContainText(/describe the game/i)
    await entry.click()
    const form = page.getByTestId('describe-game-form')
    await expect(form.getByRole('textbox')).toBeFocused()
    await form.getByRole('textbox').fill('a test game with a placeholder screenshot and nothing else to see')
    const responsePromise = page.waitForResponse((r) => r.url().endsWith('/api/game/describe'))
    await page.getByTestId('describe-game-submit').click()
    const response = await responsePromise
    expect(response.status()).toBe(200)
    expect(await response.json()).toEqual({ success: true, data: { recorded: true } })
    await expect(page.getByTestId('describe-game-ack')).toBeVisible()
    expect(await getCurrentScore(page)).toBe(scoreBefore)
  })

  test('admin disables it in Paramètres; the entry is gone and the route 404s', async ({ page, browser }, testInfo) => {
    const admin = await adminPage(browser)
    await admin.goto('/en/admin?tab=settings')
    const toggle = admin.getByRole('switch', { name: /enable "describe the game"/i })
    await expect(toggle).toHaveAttribute('aria-checked', 'true')
    await toggle.click()
    await expect(toggle).toHaveAttribute('aria-checked', 'false')
    await expect(admin.getByTestId('settings-status-describeGuess')).toContainText(/off/i)
    await admin.context().close()

    expect((await runtimeFeatures(page.request)).describeGuess).toBe(false)
    await startPlaying(page)
    await goToPosition(page, positions(testInfo.project.name).off)
    await wrongGuess(page)
    await expect(page.getByTestId('describe-game-open')).toHaveCount(0)
    const res = await page.request.post('/api/game/describe', {
      data: { tierSessionId: 'x', screenshotId: 1, position: 1, description: 'a long enough description', locale: 'en' },
      failOnStatusCode: false,
    })
    expect(res.status()).toBe(404)
  })
})
