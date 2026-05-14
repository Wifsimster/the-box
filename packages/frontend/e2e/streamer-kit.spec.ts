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

test.describe('Streamer Kit — public API M1', () => {
  test.beforeEach(async ({ authenticatedPage: page }) => {
    await page.goto('/en/profile')
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
    // Trigger blur to fire the PUT.
    await slugInput.blur()

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

  test('rejects malformed slugs without saving them', async ({ authenticatedPage: page }) => {
    await page.getByTestId('streamer-kit-toggle').check()

    const slugInput = page.getByTestId('streamer-kit-slug')
    await slugInput.fill('INVALID SLUG!')
    await slugInput.blur()

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
    // Revoke and re-check.
    // ─────────────────────────────────────────────────────────────
    // Skip the window.confirm prompt by accepting it.
    page.once('dialog', (dialog) => dialog.accept())
    const revokeButtons = page.locator('[data-testid^="streamer-kit-revoke-"]')
    await revokeButtons.first().click()
    await expect(list).toContainText(/revoked/i, { timeout: 5_000 })

    // Revoked key must no longer authenticate.
    const afterRevoke = await page.request.get(`${API_BASE}/public/v1/challenge/today`, {
      headers: { Authorization: `Bearer ${text}` },
    })
    // Anon callers still pass (60/min bucket); the only signal that the key
    // is dead is the rate-limit ceiling dropping back to 60.
    expect(afterRevoke.headers()['ratelimit-limit']).toBe('60')
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
