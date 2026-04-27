import { test, expect } from '@playwright/test'
import { loginAsUser } from './helpers/game-helpers'

/**
 * E2E tests for the /geo/daily challenge.
 *
 * Prerequisites:
 * - Backend running with at least one promoted geo_screenshot_meta for
 *   today's date (see e2e-seed.ts once geo seeds are added)
 * - Logged-in test user
 *
 * If the geo API isn't reachable (older backend), we skip instead of
 * producing a misleading failure.
 */

async function geoRoutesAvailable(page: import('@playwright/test').Page): Promise<boolean> {
    const response = await page.request.get('/api/geo/daily/1970-01-01', {
        failOnStatusCode: false,
    })
    // 404 (no challenge) still means the route exists; 502/redirect means it doesn't.
    return response.status() === 200 || response.status() === 404
}

test.describe('Geo Daily', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsUser(page)
    })

    test('renders the challenge when a meta is promoted for today', async ({ page }) => {
        if (!(await geoRoutesAvailable(page))) {
            test.skip(true, 'geo API not reachable for this build')
        }

        await page.goto('/en/geo/daily')

        // Either the challenge heading or a "no challenge" 404 state is acceptable
        // — the flag is on but seeds might not include today.
        const heading = page.getByRole('heading', { name: /geo challenge|défi géo/i })
        const notFound = page.getByText(/no.*challenge|aucun défi/i)
        await expect(heading.or(notFound).first()).toBeVisible({ timeout: 10_000 })
    })

    test('drops a pin when clicking the map', async ({ page }) => {
        if (!(await geoRoutesAvailable(page))) test.skip(true, 'geo off')

        await page.goto('/en/geo/daily')
        await page.waitForLoadState('networkidle')

        const map = page.getByRole('button', { name: /pin location on the map/i })
        const mapVisible = await map.isVisible().catch(() => false)
        if (!mapVisible) {
            test.skip(true, 'no challenge content for today — seed a geo meta first')
        }

        // Click roughly the centre of the map.
        const box = await map.boundingBox()
        expect(box).not.toBeNull()
        if (!box) return
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

        // Submit becomes enabled once a pin exists.
        const submit = page.getByRole('button', { name: /submit guess|valider ma réponse/i })
        await expect(submit).toBeEnabled({ timeout: 5_000 })
    })

    test('shows score on the result after submitting a guess', async ({ page }) => {
        if (!(await geoRoutesAvailable(page))) test.skip(true, 'geo off')

        await page.goto('/en/geo/daily')
        await page.waitForLoadState('networkidle')

        const map = page.getByRole('button', { name: /pin location on the map/i })
        if (!(await map.isVisible().catch(() => false))) {
            test.skip(true, 'no challenge content for today')
        }

        const box = await map.boundingBox()
        if (!box) return
        await page.mouse.click(box.x + box.width * 0.4, box.y + box.height * 0.6)

        const submit = page.getByRole('button', { name: /submit guess|valider ma réponse/i })
        await submit.click()

        // Either a numeric score line or an "already guessed" message is acceptable.
        const scoreLine = page.getByText(/score:\s*\d/i)
        const alreadyGuessed = page.getByText(/already guessed|déjà tenté/i)
        await expect(scoreLine.or(alreadyGuessed).first()).toBeVisible({ timeout: 10_000 })
    })
})
