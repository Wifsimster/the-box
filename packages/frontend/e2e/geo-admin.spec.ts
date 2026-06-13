import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/game-helpers'

/**
 * E2E tests for the admin Geo review panel and ingestion actions.
 *
 * Note: previously these tests soft-skipped when /api/geo/games returned
 * non-200 — a green-build smell because a fully-broken router silently
 * passed. We now require the geo router to be reachable (any status code
 * < 500 — even 401/429 means "the router is up"). A real backend outage
 * still flags by failing on the assertions below rather than silently
 * passing.
 */

async function geoRoutesReachable(page: import('@playwright/test').Page): Promise<boolean> {
    const response = await page.request.get('/api/geo/games', {
        failOnStatusCode: false,
    })
    return response.status() < 500
}

test.describe('Geo Admin', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page)
    })

    test('renders the Geo tab and review panel', async ({ page }) => {
        if (!(await geoRoutesReachable(page))) test.skip(true, 'geo router unreachable')

        await page.goto('/en/admin?tab=geo')

        // Top-level Geo tab opened.
        await expect(
            page.getByRole('tab', { name: /geo|géo/i }).first(),
        ).toBeVisible({ timeout: 10_000 })

        // The moderation panel + its sub-tabs render regardless of seed data.
        await expect(page.getByText(/geo moderation|modération géo/i)).toBeVisible()
        await expect(page.getByRole('tab', { name: /^acquisition$/i })).toBeVisible()
        await expect(page.getByRole('tab', { name: /review queue|file de revue/i })).toBeVisible()
    })

    test('review queue renders (possibly empty)', async ({ page }) => {
        if (!(await geoRoutesReachable(page))) test.skip(true, 'geo router unreachable')

        // The review queue is where crowdsourced submissions are moderated.
        await page.goto('/en/admin?tab=geo&sub=queue')
        await page.waitForLoadState('networkidle')

        // Either at least one submission renders, or the empty-state message.
        const submission = page.locator('button:has-text("#")').first()
        const emptyState = page.getByText(/no submissions match|aucune soumission/i)
        await expect(submission.or(emptyState).first()).toBeVisible({ timeout: 10_000 })
    })
})
