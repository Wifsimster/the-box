import { test, expect } from '@playwright/test'
import { loginAsUser } from './helpers/game-helpers'

/**
 * E2E tests for the /geo/contribute pin mini-game and /geo/leaderboard.
 *
 * Skipped gracefully when VITE_GEO_ENABLED is off or when there are no
 * unlabeled candidates to tag for the default gameId.
 */

async function geoRoutesAvailable(page: import('@playwright/test').Page): Promise<boolean> {
    const response = await page.request.get('/api/geo/daily/1970-01-01', {
        failOnStatusCode: false,
    })
    return response.status() === 200 || response.status() === 404
}

test.describe('Geo Contribute', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsUser(page)
    })

    test('lets a user pin and submit on an unlabeled candidate', async ({ page }) => {
        if (!(await geoRoutesAvailable(page))) test.skip(true, 'geo off')

        await page.goto('/en/geo/contribute')
        await page.waitForLoadState('networkidle')

        // Either the pin UI shows up, or the backend replied with an
        // expected empty/rate-limit state (no content / 429).
        const map = page.getByRole('button', { name: /pin location on the map/i })
        const noCandidate = page.getByText(/no.*screenshots available|no unlabeled/i)
        const rateLimit = page.getByText(/pin limit reached|rate limit/i)

        const hasPinUi = await map.isVisible().catch(() => false)
        const emptyOrLimited =
            (await noCandidate.isVisible().catch(() => false)) ||
            (await rateLimit.isVisible().catch(() => false))

        if (!hasPinUi) {
            expect(emptyOrLimited).toBeTruthy()
            return
        }

        const box = await map.boundingBox()
        if (!box) return
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

        const submit = page.getByRole('button', { name: /submit pin|envoyer/i })
        await expect(submit).toBeEnabled({ timeout: 5_000 })
        await submit.click()

        // Backend may auto-advance to another candidate or show the thanks message.
        const thanks = page.getByText(/thanks.*agree|merci.*confirmeront/i)
        const nextMap = page.getByRole('button', { name: /pin location on the map/i })
        await expect(thanks.or(nextMap).first()).toBeVisible({ timeout: 10_000 })
    })
})

test.describe('Geo Leaderboard', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsUser(page)
    })

    test('renders daily and monthly tabs', async ({ page }) => {
        if (!(await geoRoutesAvailable(page))) test.skip(true, 'geo off')

        await page.goto('/en/geo/leaderboard')

        await expect(
            page.getByRole('heading', { name: /geo leaderboard|classement géo/i }),
        ).toBeVisible({ timeout: 10_000 })

        const dailyTab = page.getByRole('tab', { name: /daily|journalier/i })
        const monthlyTab = page.getByRole('tab', { name: /monthly|mensuel/i })

        await expect(dailyTab).toBeVisible()
        await expect(monthlyTab).toBeVisible()

        await monthlyTab.click()
        // Either we see at least one row or an empty-state message; both are valid.
        const anyContent = page.locator('text=/top players|no entries yet|aucune entrée/i').first()
        await expect(anyContent).toBeVisible({ timeout: 5_000 })
    })
})
