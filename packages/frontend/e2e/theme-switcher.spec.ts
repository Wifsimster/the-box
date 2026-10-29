import { test as authTest, expect } from './fixtures/auth.fixture'

const EXPECTED: Record<string, { from: string; to: string }> = {
    default: { from: '#a855f7', to: '#f472b6' },
    neon_pink: { from: '#f472b6', to: '#ec4899' },
    cyber_blue: { from: '#3b82f6', to: '#06b6d4' },
    emerald_matrix: { from: '#22c55e', to: '#06b6d4' },
    sunset_blaze: { from: '#eab308', to: '#ef4444' },
    retro_80s: { from: '#ff2e88', to: '#2de2e6' },
}

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

        const firstSwatch = page.getByTestId('theme-swatch-default')
        await firstSwatch.waitFor({ state: 'visible', timeout: 15_000 })

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
