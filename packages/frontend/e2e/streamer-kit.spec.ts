import { test, expect } from './fixtures/auth.fixture'

const API_BASE = 'http://localhost:3000/api'

function randomSlug(): string {
  return `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

test.describe.configure({ mode: 'serial' })

test.describe('Streamer Kit — public API M1', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/en/profile?tab=creator')
    await page.waitForSelector('[data-testid="streamer-kit-settings"]', { timeout: 15_000 })
  })

  test('renders the kit card for an authenticated, non-guest user', async ({
    authenticatedPage: page,
  }) => {
    await expect(page.getByText(/streamer kit/i).first()).toBeVisible()
    const toggle = page.getByTestId('streamer-kit-toggle')
    await expect(toggle).toBeVisible()
    if (await toggle.isChecked()) {
      await toggle.uncheck()
      await page.waitForTimeout(300)
    }
    await expect(page.getByTestId('streamer-kit-create-key')).toBeDisabled()
  })

  test('toggles public-profile visibility, claims a slug, and the public API responds', async ({
    authenticatedPage: page,
  }) => {
    const slug = randomSlug()

    const toggle = page.getByTestId('streamer-kit-toggle')
    await toggle.check()
    await expect(toggle).toBeChecked()

    const slugInput = page.getByTestId('streamer-kit-slug')
    await slugInput.fill(slug)
    await page.getByTestId('streamer-kit-slug-save').click()

    await expect
      .poll(
        async () => {
          const res = await page.request.get(`${API_BASE}/public/v1/streamers/${slug}`)
          return res.status()
        },
        { timeout: 5_000 }
      )
      .toBe(200)

    const profile = await page.request.get(`${API_BASE}/public/v1/streamers/${slug}`)
    const body = await profile.json()
    expect(body.success).toBe(true)
    expect(body.data.slug).toBe(slug)
  })

  test('disables the Save button until the slug input is dirty', async ({
    authenticatedPage: page,
  }) => {
    await page.getByTestId('streamer-kit-toggle').check()

    const save = page.getByTestId('streamer-kit-slug-save')
    await expect(save).toBeDisabled()

    await page.getByTestId('streamer-kit-slug').fill('not-yet-saved')
    await expect(save).toBeEnabled()
  })

  test('rejects malformed slugs without saving them', async ({ authenticatedPage: page }) => {
    await page.getByTestId('streamer-kit-toggle').check()

    const slugInput = page.getByTestId('streamer-kit-slug')
    await slugInput.fill('INVALID SLUG!')
    await page.getByTestId('streamer-kit-slug-save').click()

    await expect(page.getByText(/3[–-]32 chars/i)).toBeVisible({ timeout: 5_000 })
  })

  test('creates a key, surfaces the plaintext exactly once, and lists it', async ({
    authenticatedPage: page,
  }) => {
    const toggle = page.getByTestId('streamer-kit-toggle')
    if (!(await toggle.isChecked())) {
      await toggle.check()
      await page.waitForTimeout(300)
    }

    await page.getByTestId('streamer-kit-create-key').click()
    await expect(page.getByTestId('streamer-kit-create-dialog')).toBeVisible()

    const label = `OBS overlay ${Date.now()}`
    await page.getByTestId('streamer-kit-key-label').fill(label)
    await page.getByTestId('streamer-kit-confirm-create').click()

    const plaintext = page.getByTestId('streamer-kit-key-plaintext')
    await expect(plaintext).toBeVisible({ timeout: 5_000 })
    const text = (await plaintext.textContent())?.trim() ?? ''
    expect(text).toMatch(/^tb_pk_live_[A-Za-z0-9_-]+$/)

    await page.getByRole('button', { name: /done/i }).click()
    await expect(page.getByTestId('streamer-kit-create-dialog')).toBeHidden()

    const list = page.getByTestId('streamer-kit-keys-list')
    await expect(list).toContainText(label)
    await expect(list).toContainText('tb_pk_live_')
    await expect(list).not.toContainText(text)

    const keyedReq = await page.request.get(`${API_BASE}/public/v1/challenge/today`, {
      headers: { Authorization: `Bearer ${text}` },
    })
    expect([200, 404]).toContain(keyedReq.status())
    expect(keyedReq.headers()['ratelimit-limit']).toBe('600')

    const revokeButtons = page.locator('[data-testid^="streamer-kit-revoke-"]')
    await revokeButtons.first().click()

    const dialog = page.getByTestId('streamer-kit-revoke-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('streamer-kit-revoke-dialog-confirm').click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })
    await expect(list).toContainText(/revoked/i)

    const afterRevoke = await page.request.get(`${API_BASE}/public/v1/challenge/today`, {
      headers: { Authorization: `Bearer ${text}` },
    })
    expect(afterRevoke.headers()['ratelimit-limit']).toBe('60')
  })

  test('cancelling the revoke dialog leaves the key active', async ({
    authenticatedPage: page,
  }) => {
    const toggle = page.getByTestId('streamer-kit-toggle')
    if (!(await toggle.isChecked())) {
      await toggle.check()
      await page.waitForTimeout(300)
    }

    const revokeButtons = page.locator('[data-testid^="streamer-kit-revoke-"]')
    const count = await revokeButtons.count()
    test.skip(count === 0, 'No active keys to attempt revoke on')

    await revokeButtons.first().click()
    const dialog = page.getByTestId('streamer-kit-revoke-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('streamer-kit-revoke-dialog-cancel').click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    await expect(page.locator('[data-testid^="streamer-kit-revoke-"]')).toHaveCount(count)
  })

  test('hides the streamer in the public profile when the toggle is off', async ({
    authenticatedPage: page,
  }) => {
    const slug = randomSlug()
    const toggle = page.getByTestId('streamer-kit-toggle')
    await toggle.check()

    await page.getByTestId('streamer-kit-slug').fill(slug)
    await page.getByTestId('streamer-kit-slug').blur()

    await toggle.uncheck()
    await page.waitForTimeout(300)

    const res = await page.request.get(`${API_BASE}/public/v1/streamers/${slug}`)
    expect(res.status()).toBe(404)
  })
})

test.describe('Public API rate-limit headers', () => {
  test('anonymous calls expose RateLimit-Limit: 60', async ({ page }) => {
    const res = await page.request.get(`${API_BASE}/public/v1/leaderboard/daily`)
    expect([200]).toContain(res.status())
    expect(res.headers()['ratelimit-limit']).toBe('60')
  })
})

test.describe('Public API sandbox — boxbot', () => {
  test('profile is always available', async ({ page }) => {
    const res = await page.request.get(`${API_BASE}/public/v1/streamers/boxbot`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(body.success).toBe(true)
    expect(body.data.slug).toBe('boxbot')
    expect(body.data.displayName).toBe('BoxBot')
    expect(body.data.today).not.toBeNull()
  })

  test('today endpoint reports a live session that never counts for the leaderboard', async ({
    page,
  }) => {
    const res = await page.request.get(`${API_BASE}/public/v1/streamers/boxbot/today`)
    expect(res.status()).toBe(200)
    const body = await res.json()
    expect(['in_progress', 'completed']).toContain(body.data.status)
    expect(body.data.session.countsForLeaderboard).toBe(false)
  })

  test('chat format returns a one-line string', async ({ page }) => {
    const res = await page.request.get(
      `${API_BASE}/public/v1/streamers/boxbot?format=chat`
    )
    expect(res.status()).toBe(200)
    const text = await res.text()
    expect(text).toContain('BoxBot')
    expect(text.split('\n')).toHaveLength(1)
  })
})

test.describe('Streamer Kit — reserved slugs', () => {
  test('cannot claim the boxbot slug', async ({ authenticatedPage: page }) => {
    await page.goto('/en/profile?tab=creator')
    await page.waitForSelector('[data-testid="streamer-kit-settings"]', { timeout: 15_000 })

    const toggle = page.getByTestId('streamer-kit-toggle')
    if (!(await toggle.isChecked())) {
      await toggle.check()
      await page.waitForTimeout(300)
    }
    await page.getByTestId('streamer-kit-slug').fill('boxbot')
    await page.getByTestId('streamer-kit-slug-save').click()

    await expect(page.getByText(/is reserved|already taken/i)).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Streamer Kit — webhooks (M3)', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/en/profile?tab=creator')
    await page.waitForSelector('[data-testid="streamer-kit-settings"]', { timeout: 15_000 })
    const toggle = page.getByTestId('streamer-kit-toggle')
    if (!(await toggle.isChecked())) {
      await toggle.check()
      await page.waitForTimeout(300)
    }
  })

  test('renders the webhook section once the profile is enabled', async ({
    authenticatedPage: page,
  }) => {
    await expect(page.getByTestId('streamer-kit-webhooks')).toBeVisible()
    await expect(page.getByTestId('streamer-kit-add-webhook')).toBeEnabled()
  })

  test('rejects a non-HTTPS URL with an inline error', async ({ authenticatedPage: page }) => {
    await page.getByTestId('streamer-kit-add-webhook').click()
    await expect(page.getByTestId('streamer-kit-webhook-dialog')).toBeVisible()

    await page.getByTestId('streamer-kit-webhook-url').fill('http://example.com/hook')
    await page.getByTestId('streamer-kit-webhook-label').fill('insecure')
    await page.getByTestId('streamer-kit-confirm-webhook').click()

    await expect(page.getByText(/must use HTTPS/i)).toBeVisible({ timeout: 5_000 })
  })

  test('registers a webhook, reveals the secret once, lists it, and revokes it', async ({
    authenticatedPage: page,
  }) => {
    await page.getByTestId('streamer-kit-add-webhook').click()
    await expect(page.getByTestId('streamer-kit-webhook-dialog')).toBeVisible()

    const label = `Discord bot ${Date.now()}`
    await page.getByTestId('streamer-kit-webhook-url').fill('https://example.com/the-box-hook')
    await page.getByTestId('streamer-kit-webhook-label').fill(label)
    await page.getByTestId('streamer-kit-confirm-webhook').click()

    const secret = page.getByTestId('streamer-kit-webhook-secret')
    await expect(secret).toBeVisible({ timeout: 5_000 })
    const secretText = (await secret.textContent())?.trim() ?? ''
    expect(secretText).toMatch(/^whsec_[A-Za-z0-9_-]+$/)

    await page.getByRole('button', { name: /done/i }).click()
    await expect(page.getByTestId('streamer-kit-webhook-dialog')).toBeHidden()

    const list = page.getByTestId('streamer-kit-webhooks-list')
    await expect(list).toContainText(label)
    await expect(list).not.toContainText(secretText)

    const revokeButtons = page.locator('[data-testid^="streamer-kit-revoke-webhook-"]')
    await revokeButtons.first().click()
    const dialog = page.getByTestId('streamer-kit-webhook-revoke-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('streamer-kit-webhook-revoke-dialog-confirm').click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })
    await expect(list).toContainText(/revoked/i)
  })
})
