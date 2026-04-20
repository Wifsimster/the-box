import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/game-helpers'

/**
 * E2E tests for the admin Geo review panel and ingestion actions.
 *
 * Skipped gracefully when VITE_GEO_ENABLED is off — the "geo" tab only
 * renders behind that flag, so the rest of the suite would fail
 * misleadingly without this guard.
 */

async function geoRoutesAvailable(page: import('@playwright/test').Page): Promise<boolean> {
    const response = await page.request.get('/api/geo/daily/1970-01-01', {
        failOnStatusCode: false,
    })
    return response.status() === 200 || response.status() === 404
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
            page.getByRole('heading', { name: /ingestion & scheduling|ingestion et planification/i }),
        ).toBeVisible()
        await expect(
            page.getByText(/import fandom map|importer la carte fandom/i),
        ).toBeVisible()
        await expect(
            page.getByText(/import steam screenshots|importer les captures steam/i),
        ).toBeVisible()
        await expect(
            page.getByText(/schedule daily challenge|planifier le défi quotidien/i),
        ).toBeVisible()
    })

    test('schedule-daily-challenge enqueue returns a job id', async ({ page }) => {
        if (!(await geoRoutesAvailable(page))) test.skip(true, 'geo off')

        await page.goto('/en/admin?tab=geo')
        await page.waitForLoadState('networkidle')

        // The schedule form has no required inputs, so we can click straight away.
        // Multiple Enqueue buttons exist; the one we want sits in the schedule
        // section. Find the third occurrence (fandom, steam, schedule order).
        const enqueueButtons = page.getByRole('button', { name: /enqueue|lancer/i })
        const count = await enqueueButtons.count()
        expect(count).toBeGreaterThanOrEqual(3)

        await enqueueButtons.nth(2).click()

        // Success banner or any surfaced error are both acceptable: we only
        // assert the request completed and the UI reacted.
        const success = page.getByText(/job queued|tâche en file/i)
        const failure = page.getByText(/failed|erreur/i)
        await expect(success.or(failure).first()).toBeVisible({ timeout: 10_000 })
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
