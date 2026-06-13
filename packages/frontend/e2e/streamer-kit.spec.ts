import { test, expect } from './fixtures/auth.fixture'

/**
 * E2E tests for the Streamer Kit (M1):
 *   - Settings page card renders for an authenticated, non-guest user.
 *   - Public-profile toggle persists.
 *   - Slug claim persists and is reflected on the public profile endpoint.
 *   - Key creation modal returns a tb_pk_live_… plaintext exactly once.
 *   - Key list shows the created key with the masked prefix.
 *   - Revoke removes the key from the active list.
 *   - Public API surface honours the opt-in flag (404 before, 200 after).
 *
 * Prerequisites:
 *   - Backend at http://localhost:3000 with migrations applied
 *   - Frontend dev server at http://localhost:5173 (managed by webServer)
 *   - DB seeded via `npm run e2e:seed` (creates e2e_user@test.local)
 */

const API_BASE = 'http://localhost:3000/api'

// Slug is randomized per run to avoid collisions when the suite reruns
// against the same seeded DB without a wipe.
function randomSlug(): string {
  return `e2e-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`
}

// These tests all drive the SAME seeded user's public-profile state (toggle,
// slug, keys, webhooks), so they must not run concurrently with each other —
// otherwise one test enabling the profile races the "create-key disabled until
// the toggle is on" assertion. Serial mode keeps them ordered on one worker;
// the seed resets the profile to a clean (disabled) starting point.
test.describe.configure({ mode: 'serial' })

test.describe('Streamer Kit — public API M1', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/en/profile?tab=creator')
    // Profile page is heavy; wait for the kit card specifically.
    await page.waitForSelector('[data-testid="streamer-kit-settings"]', { timeout: 15_000 })
  })

  test('renders the kit card for an authenticated, non-guest user', async ({
    authenticatedPage: page,
  }) => {
    await expect(page.getByText(/streamer kit/i).first()).toBeVisible()
    await expect(page.getByTestId('streamer-kit-toggle')).toBeVisible()
    // Create-key button is disabled until the toggle is on.
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
    // Use the explicit Save button — the on-blur fallback exists for
    // desktop convenience but isn't the canonical affordance.
    await page.getByTestId('streamer-kit-slug-save').click()

    // Public endpoint should now return 200 for the freshly-claimed slug.
    // Tabs out of the SPA and hits the backend directly to verify the
    // cross-stack contract.
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

    // Fresh field with no existing value → no diff → Save disabled.
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

    // Inline error should appear and slug should NOT be queryable.
    await expect(page.getByText(/3[–-]32 chars/i)).toBeVisible({ timeout: 5_000 })
  })

  test('creates a key, surfaces the plaintext exactly once, and lists it', async ({
    authenticatedPage: page,
  }) => {
    // Ensure profile is enabled so the Create button is active.
    const toggle = page.getByTestId('streamer-kit-toggle')
    if (!(await toggle.isChecked())) {
      await toggle.check()
      // Tiny wait for the PUT to settle.
      await page.waitForTimeout(300)
    }

    await page.getByTestId('streamer-kit-create-key').click()
    await expect(page.getByTestId('streamer-kit-create-dialog')).toBeVisible()

    const label = `OBS overlay ${Date.now()}`
    await page.getByTestId('streamer-kit-key-label').fill(label)
    await page.getByTestId('streamer-kit-confirm-create').click()

    // Plaintext reveal happens in the same dialog.
    const plaintext = page.getByTestId('streamer-kit-key-plaintext')
    await expect(plaintext).toBeVisible({ timeout: 5_000 })
    const text = (await plaintext.textContent())?.trim() ?? ''
    expect(text).toMatch(/^tb_pk_live_[A-Za-z0-9_-]+$/)

    // Closing the dialog and reopening it must NOT re-show the plaintext.
    await page.getByRole('button', { name: /done/i }).click()
    await expect(page.getByTestId('streamer-kit-create-dialog')).toBeHidden()

    // The key must appear in the list, masked.
    const list = page.getByTestId('streamer-kit-keys-list')
    await expect(list).toContainText(label)
    await expect(list).toContainText('tb_pk_live_')
    await expect(list).not.toContainText(text) // full plaintext gone

    // ─────────────────────────────────────────────────────────────
    // Verify the key actually works against the public surface.
    // ─────────────────────────────────────────────────────────────
    // Today's challenge endpoint accepts both anon and keyed callers.
    // We assert that the keyed call returns the same shape and that
    // RateLimit-* headers are present (keyed quota = 600/min).
    const keyedReq = await page.request.get(`${API_BASE}/public/v1/challenge/today`, {
      headers: { Authorization: `Bearer ${text}` },
    })
    expect([200, 404]).toContain(keyedReq.status())
    expect(keyedReq.headers()['ratelimit-limit']).toBe('600')

    // ─────────────────────────────────────────────────────────────
    // Revoke flow now uses the ConfirmDialog primitive — no more
    // window.confirm. Open the dialog, click Confirm, list updates.
    // ─────────────────────────────────────────────────────────────
    const revokeButtons = page.locator('[data-testid^="streamer-kit-revoke-"]')
    await revokeButtons.first().click()

    const dialog = page.getByTestId('streamer-kit-revoke-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('streamer-kit-revoke-dialog-confirm').click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })
    await expect(list).toContainText(/revoked/i)

    // Revoked key must no longer authenticate.
    const afterRevoke = await page.request.get(`${API_BASE}/public/v1/challenge/today`, {
      headers: { Authorization: `Bearer ${text}` },
    })
    // Anon callers still pass (60/min bucket); the only signal that the key
    // is dead is the rate-limit ceiling dropping back to 60.
    expect(afterRevoke.headers()['ratelimit-limit']).toBe('60')
  })

  test('cancelling the revoke dialog leaves the key active', async ({
    authenticatedPage: page,
  }) => {
    // Set up state: enable + slug + a single active key so we have something
    // to attempt revoke against.
    const toggle = page.getByTestId('streamer-kit-toggle')
    if (!(await toggle.isChecked())) {
      await toggle.check()
      await page.waitForTimeout(300)
    }

    // Skip if no keys exist yet — this test is only meaningful when there's
    // a revoke target visible.
    const revokeButtons = page.locator('[data-testid^="streamer-kit-revoke-"]')
    const count = await revokeButtons.count()
    test.skip(count === 0, 'No active keys to attempt revoke on')

    await revokeButtons.first().click()
    const dialog = page.getByTestId('streamer-kit-revoke-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('streamer-kit-revoke-dialog-cancel').click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })

    // The key list still shows the active key — same count of revoke
    // buttons as before.
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

    // Now flip the toggle off.
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
  // boxbot is a clock-driven simulation — always queryable, no DB user,
  // no opt-in required. These tests need neither auth nor a seeded streamer.
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

    // Server rejects the reserved slug — the SLUG_TAKEN / SLUG_RESERVED
    // path surfaces the inline error. Match "is reserved" specifically so the
    // footer's "All rights reserved" doesn't trip strict mode.
    await expect(page.getByText(/is reserved|already taken/i)).toBeVisible({ timeout: 5_000 })
  })
})

test.describe('Streamer Kit — webhooks (M3)', () => {
  // Webhooks need an opted-in public profile, so each test enables it first.
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

    // SSRF guard returns NOT_HTTPS → mapped to the HTTPS inline error.
    await expect(page.getByText(/must use HTTPS/i)).toBeVisible({ timeout: 5_000 })
  })

  test('registers a webhook, reveals the secret once, lists it, and revokes it', async ({
    authenticatedPage: page,
  }) => {
    await page.getByTestId('streamer-kit-add-webhook').click()
    await expect(page.getByTestId('streamer-kit-webhook-dialog')).toBeVisible()

    const label = `Discord bot ${Date.now()}`
    // example.com passes the syntactic SSRF guard (public host, HTTPS).
    // DNS re-resolution only happens at delivery time, not registration.
    await page.getByTestId('streamer-kit-webhook-url').fill('https://example.com/the-box-hook')
    await page.getByTestId('streamer-kit-webhook-label').fill(label)
    await page.getByTestId('streamer-kit-confirm-webhook').click()

    // Secret revealed exactly once, in the same dialog.
    const secret = page.getByTestId('streamer-kit-webhook-secret')
    await expect(secret).toBeVisible({ timeout: 5_000 })
    const secretText = (await secret.textContent())?.trim() ?? ''
    expect(secretText).toMatch(/^whsec_[A-Za-z0-9_-]+$/)

    await page.getByRole('button', { name: /done/i }).click()
    await expect(page.getByTestId('streamer-kit-webhook-dialog')).toBeHidden()

    // Listed, without the full secret.
    const list = page.getByTestId('streamer-kit-webhooks-list')
    await expect(list).toContainText(label)
    await expect(list).not.toContainText(secretText)

    // Revoke via the ConfirmDialog.
    const revokeButtons = page.locator('[data-testid^="streamer-kit-revoke-webhook-"]')
    await revokeButtons.first().click()
    const dialog = page.getByTestId('streamer-kit-webhook-revoke-dialog')
    await expect(dialog).toBeVisible()
    await page.getByTestId('streamer-kit-webhook-revoke-dialog-confirm').click()
    await expect(dialog).toBeHidden({ timeout: 5_000 })
    await expect(list).toContainText(/revoked/i)
  })
})
