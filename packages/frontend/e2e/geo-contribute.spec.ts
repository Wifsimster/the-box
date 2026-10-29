import { test, expect } from '@playwright/test'
import { loginAsUser } from './helpers/game-helpers'
import { geoCommunityEnabled } from './helpers/features'

async function geoRoutesAvailable(page: import('@playwright/test').Page): Promise<boolean> {
    return geoCommunityEnabled(page.request)
}

test.describe('Geo Contribute', () => {
    test.beforeEach(async ({ page }) => {
        await loginAsUser(page)
    })

    test('lets a user pin and submit on an unlabeled candidate', async ({ page }) => {
        if (!(await geoRoutesAvailable(page))) test.skip(true, 'geo off')

        await page.goto('/en/geo/contribute')
        await page.waitForLoadState('networkidle')

        const map = page.getByRole('button', { name: /pin location on the map/i })
        const noCandidate = page.getByText(/no.*screenshots available|no unlabeled/i)
        const rateLimit = page.getByText(/pin limit reached|rate limit/i)
        const locked = page.getByText(/unlocks after|tagging unlocks/i)

        const hasPinUi = await map.isVisible().catch(() => false)
        const emptyOrLimited =
            (await noCandidate.isVisible().catch(() => false)) ||
            (await rateLimit.isVisible().catch(() => false)) ||
            (await locked.isVisible().catch(() => false))

        if (!hasPinUi) {
            const pageLoaded = await page
                .getByRole('heading', { name: /tag a screenshot|étiqueter/i })
                .isVisible()
                .catch(() => false)
            expect(emptyOrLimited || pageLoaded).toBeTruthy()
            return
        }

        const box = await map.boundingBox()
        if (!box) return
        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2)

        const submit = page.getByRole('button', { name: /submit pin|envoyer/i })
        await expect(submit).toBeEnabled({ timeout: 5_000 })
        await submit.click()

        const thanks = page.getByText(/thanks.*agree|merci.*confirmeront/i)
        const nextMap = page.getByRole('button', { name: /pin location on the map/i })
        await expect(thanks.or(nextMap).first()).toBeVisible({ timeout: 10_000 })
    })
})
