import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/game-helpers'

/**
 * E2E tests for the admin Geo review panel and ingestion actions.
 *
 * Skipped gracefully when the geo API is unreachable (older backend), so
 * the rest of the suite doesn't fail misleadingly.
 */

async function geoRoutesAvailable(page: import('@playwright/test').Page): Promise<boolean> {
    const response = await page.request.get('/api/geo/games', {
        failOnStatusCode: false,
    })
    return response.status() === 200
}

test.describe('Geo Admin', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsAdmin(page)
    })

    test('renders the Geo tab and review panel', async ({ page }) => {
        if (!(await geoRoutesAvailable(page))) test.skip(true, 'geo off')

        await page.goto('/en/admin?tab=geo')

        // Tab itself
        await expect(
            page.getByRole('tab', { name: /geo|géo/i }).first(),
        ).toBeVisible({ timeout: 10_000 })

        // Ingestion section headings (renders independent of seed data)
        await expect(
            page.getByText(/import fandom map|importer la carte fandom/i),
        ).toBeVisible()
        await expect(
            page.getByText(/import steam screenshots|importer les captures steam/i),
        ).toBeVisible()
    })

    test('candidates list renders (possibly empty) for the collecting filter', async ({ page }) => {
        if (!(await geoRoutesAvailable(page))) test.skip(true, 'geo off')

        await page.goto('/en/admin?tab=geo')
        await page.waitForLoadState('networkidle')

        // The default filter is "collecting". Either we see at least one
        // candidate button (#<id>) or the empty-state message.
        const candidateButton = page.locator('button:has-text("#")').first()
        const emptyState = page.getByText(/no candidates match|aucun candidat/i)
        await expect(candidateButton.or(emptyState).first()).toBeVisible({ timeout: 10_000 })
    })
})
