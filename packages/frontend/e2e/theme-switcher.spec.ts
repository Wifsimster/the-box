import { test as authTest, expect } from './fixtures/auth.fixture'

// Locks in PR #262 / commit 32c0a80: theme-selector swatches must preview
// each theme's OWN palette, regardless of which theme is currently active.
//
// Before the fix, `default` and `neon_pink` swatches used Tailwind
// utilities (`from-neon-purple`, `from-neon-pink`, `to-primary`) bound to
// CSS variables that `[data-theme]` overrides. Selecting cyber_blue /
// emerald_matrix / sunset_blaze visibly re-skinned those two preview cards
// to match the selection — the user couldn't see what they were picking.
//
// The hex pairs below MUST match packages/frontend/src/lib/themes.ts. If a
// theme is renamed, retuned, or added, update both files in lockstep —
// that is the entire contract this test enforces.

const EXPECTED: Record<string, { from: string; to: string }> = {
    default: { from: '#a855f7', to: '#f472b6' },
    neon_pink: { from: '#f472b6', to: '#ec4899' },
    cyber_blue: { from: '#3b82f6', to: '#06b6d4' },
    emerald_matrix: { from: '#22c55e', to: '#06b6d4' },
    sunset_blaze: { from: '#eab308', to: '#ef4444' },
    retro_80s: { from: '#ff2e88', to: '#2de2e6' },
}

// Browsers normalize hex colors in computed `background-image` to `rgb()`,
// so the assertion compares against the rgb form rather than the hex
// literal we set in JSX.
function hexToRgb(hex: string): string {
    const r = parseInt(hex.slice(1, 3), 16)
    const g = parseInt(hex.slice(3, 5), 16)
    const b = parseInt(hex.slice(5, 7), 16)
    return `rgb(${r}, ${g}, ${b})`
}

authTest.describe('Profile - ThemeSwitcher swatches', () => {
    authTest('each swatch previews its own palette regardless of the active theme', async ({ authenticatedPage }) => {
        const page = authenticatedPage
        await page.goto('/fr/profile?tab=customize')

        // Anchor on the first swatch so we don't race the lazy ProfilePage
        // render before reading computed styles.
        const firstSwatch = page.getByTestId('theme-swatch-default')
        await firstSwatch.waitFor({ state: 'visible', timeout: 15_000 })

        // Walk the active theme through every key and re-check every
        // swatch. If a swatch were bound to a re-skinning CSS variable,
        // exactly the card matching the active theme would render the
        // wrong colors and fail one of these assertions — which is the
        // signature of the bug we're guarding against.
        for (const activeTheme of Object.keys(EXPECTED)) {
            await page.evaluate(
                (k) => document.documentElement.setAttribute('data-theme', k),
                activeTheme,
            )

            for (const [key, { from, to }] of Object.entries(EXPECTED)) {
                const swatch = page.getByTestId(`theme-swatch-${key}`)
                const bg = await swatch.evaluate(
                    (el) => getComputedStyle(el).backgroundImage,
                )

                expect(
                    bg,
                    `swatch ${key} (active-theme=${activeTheme}) must start with its own "from" color ${from}`,
                ).toContain(hexToRgb(from))
                expect(
                    bg,
                    `swatch ${key} (active-theme=${activeTheme}) must end with its own "to" color ${to}`,
                ).toContain(hexToRgb(to))
            }
        }
    })
})
