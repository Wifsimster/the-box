import { test, expect } from '@playwright/test'
import { loginAsUser } from './helpers/game-helpers'

const KNOWN_FR_STRING = 'Classement'
const KNOWN_EN_STRING = 'Leaderboard'

test.describe('i18n URL-prefix switch (public pages)', () => {
    test('FR prefix sets html[lang]=fr and renders the FR translation', async ({ page }) => {
        await page.goto('/fr/leaderboard')
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr')
        await expect(page.getByRole("heading", { name: KNOWN_FR_STRING })).toBeVisible({ timeout: 10_000 })
    })

    test('EN prefix sets html[lang]=en and renders the EN translation', async ({ page }) => {
        await page.goto('/en/leaderboard')
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en')
        await expect(page.getByRole("heading", { name: KNOWN_EN_STRING })).toBeVisible({ timeout: 10_000 })
    })

    test('switching FR→EN mid-session updates html[lang] and the rendered copy', async ({ page }) => {
        await page.goto('/fr/leaderboard')
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr')
        await expect(page.getByRole("heading", { name: KNOWN_FR_STRING })).toBeVisible({ timeout: 10_000 })

        await page.goto('/en/leaderboard')
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en')
        await expect(page.getByRole("heading", { name: KNOWN_EN_STRING })).toBeVisible({ timeout: 10_000 })
        const stillFr = await page.getByRole("heading", { name: KNOWN_FR_STRING }).isVisible().catch(() => false)
        expect(
            stillFr,
            `after switching to EN, the FR string '${KNOWN_FR_STRING}' is still visible — i18n did not re-render`,
        ).toBe(false)
    })
})

test.describe('i18n switch preserves auth session', () => {
    test('logged-in user navigating /en→/fr stays authenticated (no redirect to login)', async ({ page }) => {
        await loginAsUser(page)
        await page.goto('/fr/profile')
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr')
        await expect(page).not.toHaveURL(/\/login/)

        await page.goto('/en/profile')
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en')
        await expect(page).not.toHaveURL(/\/login/)
    })
})
