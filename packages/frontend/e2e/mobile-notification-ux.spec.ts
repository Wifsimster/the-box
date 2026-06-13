/**
 * Mobile notification & dialog UX
 *
 * Exercises the app's transient surfaces at phone viewports (iOS + Android),
 * where several notifications can be on screen at once and the fixed app chrome
 * (sticky Header at the top, BottomNav at the bottom, iOS notch) competes for
 * the same edges:
 *
 *   1. Toasts (sonner) must clear the sticky Header — a top-anchored toast that
 *      lands on the header covers its controls.
 *   2. The offline banner is pinned above everything at top-0, so it must pad
 *      for the iOS safe-area itself or its text hides under the notch.
 *   3. The iOS "add to home screen" hint is bottom-anchored and must sit above
 *      the fixed BottomNav, not on top of it.
 *
 * Devices are emulated with `defaultBrowserType` stripped so the suite runs
 * under the Chromium projects CI uses (assertions read layout boxes / computed
 * styles, which are engine-independent). The iOS install hint only renders for
 * a Safari iOS user-agent, which the iPhone emulation provides.
 *
 * Prerequisites: dev servers (`npm run dev`) + seeded DB (`npm run e2e:seed`).
 * Only public pages (home, pricing) are used so the suite stays resilient.
 */
import { test, expect, devices, type Page } from '@playwright/test'

// Emulate a device but drop `defaultBrowserType` so the spec inherits the
// running project's engine (keeps it green under the Chromium projects CI runs
// without a WebKit binary).
function emulate(device: (typeof devices)[string]) {
  const copy = { ...device }
  delete (copy as Record<string, unknown>).defaultBrowserType
  return copy
}

const iPhone13 = emulate(devices['iPhone 13'])
const pixel5 = emulate(devices['Pixel 5'])

/** The mobile toast stack must be offset clear of the sticky header. */
async function expectToastClearsHeader(page: Page) {
  // PricingPage fires `toast.success` synchronously from the ?checkout= param,
  // so a toast (and therefore the sonner container) appears without a backend.
  // `commit` lets us start polling before the toast auto-dismisses.
  await page.goto('/en/premium?checkout=success', { waitUntil: 'commit' })

  // The container holds the whole stack; its resolved `top` is the offset every
  // toast inherits, and it's stable even as individual toasts come and go.
  const toaster = page.locator('[data-sonner-toaster]')
  await expect(toaster).toBeAttached({ timeout: 10_000 })

  const header = page.getByRole('banner').first()
  await expect(header).toBeVisible()
  const headerBox = await header.boundingBox()
  expect(headerBox, 'header should have a layout box').not.toBeNull()

  const { topPx, offsetVar } = await toaster.evaluate((el) => ({
    topPx: parseFloat(getComputedStyle(el).top),
    // Inline var keeps env() unresolved; confirms the safe-area is wired in for
    // notched devices where the inset is non-zero.
    offsetVar: (el as HTMLElement).style.getPropertyValue('--mobile-offset-top'),
  }))

  expect(
    topPx,
    `toast stack top (${topPx}px) overlaps the sticky header (${headerBox!.height}px)`,
  ).toBeGreaterThanOrEqual(headerBox!.height - 1)
  expect(offsetVar, 'mobile toast offset should reserve the safe-area inset').toContain(
    'safe-area-inset-top',
  )
}

/** The offline banner pins to the top and pads for the safe-area / notch. */
async function expectOfflineBannerSafe(page: Page) {
  await page.goto('/en')
  await page.waitForLoadState('load')

  await page.context().setOffline(true)
  try {
    // The OfflineIndicator renders as the page's <output> live region.
    const banner = page.locator('output').filter({ hasText: /hors ligne|offline/i }).first()
    await expect(banner).toBeVisible({ timeout: 5_000 })

    const box = await banner.boundingBox()
    expect(box, 'offline banner should have a layout box').not.toBeNull()
    // Pinned to the very top of the viewport.
    expect(box!.y, `offline banner should pin to the top (y=${box!.y})`).toBeLessThanOrEqual(2)

    // Regression guard for the safe-area padding. The banner sits above the
    // Header at top-0, so it pads its own top with max(env(safe-area-inset-top),
    // 0.5rem). Emulated Chromium reports a zero inset, so this floors at 8px
    // here; on a notched device in standalone PWA mode the inset lifts the text
    // clear of the status bar / notch.
    const paddingTop = await banner.evaluate(
      (el) => parseFloat(getComputedStyle(el).paddingTop),
    )
    expect(
      paddingTop,
      `offline banner should keep top padding (got ${paddingTop}px)`,
    ).toBeGreaterThanOrEqual(8)
  } finally {
    await page.context().setOffline(false)
  }
}

test.describe('Mobile notification UX — iOS', () => {
  test.use(iPhone13)

  test('toast clears the sticky header', async ({ page }) => {
    await expectToastClearsHeader(page)
  })

  test('offline banner respects the notch safe-area', async ({ page }) => {
    await expectOfflineBannerSafe(page)
  })

  test('iOS install hint sits above the bottom nav', async ({ page }) => {
    await page.goto('/en')

    // The hint mounts after a short delay; only on a Safari iOS UA.
    const hint = page.locator('dialog:has(#ios-install-title)').first()
    await expect(hint).toBeVisible({ timeout: 10_000 })

    const nav = page.getByRole('navigation', { name: /menu|navigation/i }).last()
    await expect(nav).toBeVisible()

    const hintBox = await hint.boundingBox()
    const navBox = await nav.boundingBox()
    expect(hintBox, 'install hint should have a layout box').not.toBeNull()
    expect(navBox, 'bottom nav should have a layout box').not.toBeNull()

    expect(
      hintBox!.y + hintBox!.height,
      `install hint bottom (${hintBox!.y + hintBox!.height}) overlaps the bottom nav (top ${navBox!.y})`,
    ).toBeLessThanOrEqual(navBox!.y + 1)
  })
})

test.describe('Mobile notification UX — Android', () => {
  test.use(pixel5)

  test('toast clears the sticky header', async ({ page }) => {
    await expectToastClearsHeader(page)
  })

  test('offline banner respects the safe-area', async ({ page }) => {
    await expectOfflineBannerSafe(page)
  })
})
