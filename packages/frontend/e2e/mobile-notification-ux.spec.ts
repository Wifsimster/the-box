import { test, expect, devices, type Page } from '@playwright/test'

function emulate(device: (typeof devices)[string]) {
  const copy = { ...device }
  delete (copy as Record<string, unknown>).defaultBrowserType
  return copy
}

const iPhone13 = emulate(devices['iPhone 13'])
const pixel5 = emulate(devices['Pixel 5'])

async function expectToastClearsHeader(page: Page) {
  await page.goto('/en/premium?checkout=success', { waitUntil: 'commit' })

  const toaster = page.locator('[data-sonner-toaster]')
  await expect(toaster).toBeAttached({ timeout: 10_000 })

  const header = page.getByRole('banner').first()
  await expect(header).toBeVisible()
  const headerBox = await header.boundingBox()
  expect(headerBox, 'header should have a layout box').not.toBeNull()

  const { topPx, offsetVar } = await toaster.evaluate((el) => ({
    topPx: parseFloat(getComputedStyle(el).top),
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

async function expectOfflineBannerSafe(page: Page) {
  await page.goto('/en')
  await page.waitForLoadState('load')

  await page.context().setOffline(true)
  try {
    const banner = page.locator('output').filter({ hasText: /hors ligne|offline/i }).first()
    await expect(banner).toBeVisible({ timeout: 5_000 })

    const box = await banner.boundingBox()
    expect(box, 'offline banner should have a layout box').not.toBeNull()
    expect(box!.y, `offline banner should pin to the top (y=${box!.y})`).toBeLessThanOrEqual(2)

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
    await page.goto('/en/leaderboard')

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
