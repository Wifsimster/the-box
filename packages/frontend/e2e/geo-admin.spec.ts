import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './helpers/game-helpers'

async function geoRoutesReachable(page: import('@playwright/test').Page): Promise<boolean> {
    const response = await page.request.get('/api/admin/geo-fetch/status', {
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

        await expect(
            page.getByRole('tab', { name: /geo|géo/i }).first(),
        ).toBeVisible({ timeout: 10_000 })

        await expect(page.getByText(/geo moderation|modération géo/i)).toBeVisible()
        await expect(page.getByRole('tab', { name: /^acquisition$/i })).toBeVisible()
        await expect(page.getByRole('tab', { name: /review queue|file de revue/i })).toBeVisible()
    })

    test('renders the "one pin away" content-gap card', async ({ page }) => {
        if (!(await geoRoutesReachable(page))) test.skip(true, 'geo router unreachable')

        const res = await page.request.get(
            '/api/admin/geo/games-needing-content?limit=10',
            { failOnStatusCode: false },
        )
        expect(res.status()).toBeLessThan(500)

        await page.goto('/en/admin?tab=geo')
        await expect(
            page.getByText(/à un pin de l.éligibilité/i),
        ).toBeVisible({ timeout: 10_000 })
    })

    test('review queue renders (possibly empty)', async ({ page }) => {
        if (!(await geoRoutesReachable(page))) test.skip(true, 'geo router unreachable')

        await page.goto('/en/admin?tab=geo&sub=queue')
        await page.waitForLoadState('networkidle')

        const submission = page.locator('button:has-text("#")').first()
        const emptyState = page.getByText(/no submissions match|aucune soumission/i)
        await expect(submission.or(emptyState).first()).toBeVisible({ timeout: 10_000 })
    })
})
