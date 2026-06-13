/**
 * iPhone compliance suite
 *
 * Guards the mobile-Safari pitfalls that don't show up on a desktop browser:
 *
 *   1. Zoom-on-focus — iOS Safari zooms the viewport whenever a focused
 *      <input>/<textarea>/<select> has a computed font-size below 16px. Every
 *      form control on a public page must therefore render at >= 16px on a
 *      phone-width viewport.
 *   2. Horizontal overflow — a single over-wide element makes the whole page
 *      rubber-band sideways on a phone. The document must not scroll wider
 *      than the viewport.
 *   3. Viewport / PWA head — `viewport-fit=cover` (notch handling) plus the
 *      apple-touch-icon and apple-mobile-web-app meta tags must be present.
 *   4. Touch targets — the mobile BottomNav entries must clear the 44px
 *      minimum (WCAG 2.5.5 / Apple HIG).
 *
 * The spec emulates an iPhone 13 viewport (390x844, 3x, touch) via
 * `test.use(devices['iPhone 13'])`. It runs under the configured Chromium
 * projects so it works in CI without the WebKit binary; the assertions are
 * engine-independent because they read computed styles and layout box sizes.
 * For a true Mobile-Safari pass, enable the commented "Mobile Safari" project
 * in playwright.config.ts and run with WebKit installed.
 *
 * Prerequisites: dev servers running (`npm run dev`) + seeded DB
 * (`npm run e2e:seed`). Only public pages (home, login) are exercised so the
 * suite stays resilient to auth/seed state.
 */
import { test, expect, devices } from '@playwright/test'

// Apply the iPhone 13 emulation (390x844, 3x DPR, touch, mobile UA) but drop
// `defaultBrowserType` so the spec inherits the running project's engine. That
// keeps it green under the Chromium projects CI already runs — enable the
// commented "Mobile Safari" project for a genuine WebKit pass.
const { defaultBrowserType: _engine, ...iPhone13 } = devices['iPhone 13']
test.use(iPhone13)

/** iOS Safari only suppresses zoom-on-focus at 16px or larger. */
const MIN_NO_ZOOM_FONT_PX = 16
/** WCAG 2.5.5 / Apple HIG minimum interactive target. */
const MIN_TOUCH_TARGET_PX = 44

test.describe('iPhone compliance', () => {
  test('login form controls render at >= 16px (no iOS zoom-on-focus)', async ({ page }) => {
    await page.goto('/en/login')
    await page.waitForSelector('form')

    const controls = page.locator('form input, form textarea, form select')
    const count = await controls.count()
    expect(count, 'login form should expose at least one control').toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const control = controls.nth(i)
      if (!(await control.isVisible())) continue

      const fontSizePx = await control.evaluate(
        (el) => parseFloat(getComputedStyle(el).fontSize),
      )
      const descriptor = await control.evaluate((el) => {
        const type = el.getAttribute('type') ?? el.tagName.toLowerCase()
        const name = el.getAttribute('name') ?? el.getAttribute('placeholder') ?? ''
        return `${type}${name ? ` (${name})` : ''}`
      })

      expect(
        fontSizePx,
        `${descriptor} font-size must be >= ${MIN_NO_ZOOM_FONT_PX}px to avoid iOS focus zoom`,
      ).toBeGreaterThanOrEqual(MIN_NO_ZOOM_FONT_PX)
    }
  })

  for (const path of ['/en', '/en/login']) {
    test(`no horizontal overflow at iPhone width on ${path}`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('load')
      // Let layout settle (fonts, late-mounting chrome) before measuring.
      await expect(page.locator('body')).toBeVisible()

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))

      // 1px slack absorbs sub-pixel rounding on the 3x device scale factor.
      expect(
        scrollWidth,
        `${path} scrolls ${scrollWidth - clientWidth}px wider than the viewport`,
      ).toBeLessThanOrEqual(clientWidth + 1)
    })
  }

  test('document head declares notch-safe viewport and Apple PWA tags', async ({ page }) => {
    await page.goto('/en')

    const viewport = await page.locator('meta[name="viewport"]').getAttribute('content')
    expect(viewport, 'viewport meta must opt into the safe-area with viewport-fit=cover')
      .toContain('viewport-fit=cover')
    expect(viewport).toContain('width=device-width')

    await expect(page.locator('link[rel="apple-touch-icon"]')).toHaveCount(1)
    await expect(
      page.locator('meta[name="apple-mobile-web-app-capable"]'),
    ).toHaveAttribute('content', 'yes')
  })

  test('mobile bottom-nav targets clear the 44px minimum', async ({ page }) => {
    await page.goto('/en')
    await page.waitForLoadState('load')

    const nav = page.getByRole('navigation', { name: /menu|navigation/i }).last()
    await expect(nav).toBeVisible()
    const links = nav.getByRole('link')
    const count = await links.count()
    expect(count, 'mobile bottom-nav should render its links').toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const box = await links.nth(i).boundingBox()
      expect(box, `bottom-nav link ${i} should have a layout box`).not.toBeNull()
      expect(
        box!.height,
        `bottom-nav link ${i} is ${box!.height}px tall (< ${MIN_TOUCH_TARGET_PX}px)`,
      ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX)
    }
  })
})
