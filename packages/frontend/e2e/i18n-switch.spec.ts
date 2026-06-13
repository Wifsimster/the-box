import { test, expect } from '@playwright/test'
import { loginAsUser } from './helpers/game-helpers'

// Language switching is purely URL-driven: /fr/* vs /en/*. The
// LanguageLayout (App.tsx around line 60) reacts to the :lang param,
// calls i18n.changeLanguage(lang), and mirrors it onto
// document.documentElement.lang for screen readers.
//
// What can break and what we lock in:
//   - The lang sync effect could regress (URL says /en/... but i18n
//     stays on FR, or html[lang] doesn't flip). Screen-reader and SEO
//     break silently.
//   - The session / auth state could not survive the layout re-render
//     when the URL prefix changes, kicking the user back to login.
//   - The translation key could resolve to the same string in both
//     languages (forgot to add the EN value), which means the user is
//     "in EN" but reading FR copy.
//
// The app does NOT ship a UI language toggle today (there is no
// LanguageSwitcher component anywhere in src/components). Switching is
// done by editing the URL, which is exactly what this test does.

// Two known navigation-level strings with distinct FR/EN values from
// public/locales/{fr,en}/translation.json. Anchoring on these keeps the
// spec from becoming a brittle assertion on display labels that move
// between releases.
const KNOWN_FR_STRING = 'Classement'
const KNOWN_EN_STRING = 'Leaderboard'

test.describe('i18n URL-prefix switch (public pages)', () => {
    test('FR prefix sets html[lang]=fr and renders the FR translation', async ({ page }) => {
        await page.goto('/fr/leaderboard')
        // The lang attribute is set in the LanguageLayout effect after
        // the URL parses; wait for it so we don't race the React render.
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr')
        // The FR string must appear somewhere on the page (title, nav,
        // heading — we don't care which, just that the i18n catalog
        // loaded and resolved keys to FR copy).
        await expect(page.getByRole("heading", { name: KNOWN_FR_STRING })).toBeVisible({ timeout: 10_000 })
    })

    test('EN prefix sets html[lang]=en and renders the EN translation', async ({ page }) => {
        await page.goto('/en/leaderboard')
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en')
        await expect(page.getByRole("heading", { name: KNOWN_EN_STRING })).toBeVisible({ timeout: 10_000 })
    })

    test('switching FR→EN mid-session updates html[lang] and the rendered copy', async ({ page }) => {
        // Start in FR, confirm we are reading FR copy.
        await page.goto('/fr/leaderboard')
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr')
        await expect(page.getByRole("heading", { name: KNOWN_FR_STRING })).toBeVisible({ timeout: 10_000 })

        // Navigate to the EN equivalent of the same route.
        await page.goto('/en/leaderboard')
        // The lang attribute must update — if it doesn't, the i18n
        // effect didn't fire on the URL change, which is the bug.
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en')
        // The EN copy must appear, AND the FR copy must NOT remain on
        // the page. A stale catalog or a missing EN key would leave the
        // FR string visible after the switch.
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
        // After loginAsUser the page is somewhere under /en/* (the helper
        // navigates via /en/login). Going to a /fr URL must not trigger
        // a re-auth or redirect — the session cookie is language-agnostic.
        await page.goto('/fr/profile')
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('fr')
        // The single-most-important assertion: we are NOT on /login. If
        // the session was dropped by the language switch, the route
        // would redirect.
        await expect(page).not.toHaveURL(/\/login/)

        // And back to /en — same assertion in reverse.
        await page.goto('/en/profile')
        await expect.poll(() => page.evaluate(() => document.documentElement.lang)).toBe('en')
        await expect(page).not.toHaveURL(/\/login/)
    })
})
