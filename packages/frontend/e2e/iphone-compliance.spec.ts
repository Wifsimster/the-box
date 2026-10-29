import { test, expect, devices } from '@playwright/test'

const { defaultBrowserType: _engine, ...iPhone13 } = devices['iPhone 13']
test.use(iPhone13)

const MIN_NO_ZOOM_FONT_PX = 16
const MIN_TOUCH_TARGET_PX = 44

const PUBLIC_ROUTES = [
  '/en',
  '/en/login',
  '/en/register',
  '/en/forgot-password',
  '/en/reset-password',
  '/en/two-factor',
  '/en/leaderboard',
  '/en/premium',
  '/en/rules',
  '/en/faq',
  '/en/contact',
  '/en/terms',
  '/en/privacy',
  '/en/cookies',
  '/en/profile',
  '/en/geo/contribute',
  '/en/panorama',
  '/fr',
  '/fr/premium',
  '/fr/regles',
]

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

  for (const path of PUBLIC_ROUTES) {
    test(`no horizontal overflow at iPhone width on ${path}`, async ({ page }) => {
      await page.goto(path)
      await page.waitForLoadState('load')
      await expect(page.locator('body')).toBeVisible()

      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }))

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

  test('footer links clear the 44px minimum', async ({ page }) => {
    await page.goto('/en')
    await page.waitForLoadState('load')

    const links = page.getByRole('navigation', { name: /footer|pied/i }).getByRole('link')
    const count = await links.count()
    expect(count, 'footer should render its legal/help links').toBeGreaterThan(0)

    for (let i = 0; i < count; i++) {
      const label = (await links.nth(i).textContent())?.trim()
      const box = await links.nth(i).boundingBox()
      expect(box, `footer link "${label}" should have a layout box`).not.toBeNull()
      expect(
        box!.height,
        `footer link "${label}" is ${box!.height}px tall (< ${MIN_TOUCH_TARGET_PX}px)`,
      ).toBeGreaterThanOrEqual(MIN_TOUCH_TARGET_PX)
    }
  })

  test('password reveal toggle is a full-height target, not the icon box', async ({ page }) => {
    await page.goto('/en/login')
    await page.waitForSelector('form')

    const toggle = page.getByRole('button', { name: /show password|afficher le mot de passe/i })
    await expect(toggle).toBeVisible()

    const box = await toggle.boundingBox()
    expect(box, 'password toggle should have a layout box').not.toBeNull()
    expect(
      box!.height,
      `password toggle is only ${box!.height}px tall`,
    ).toBeGreaterThanOrEqual(24)
    expect(box!.width, `password toggle is only ${box!.width}px wide`).toBeGreaterThanOrEqual(24)
  })

  test('consent banner sits above the bottom nav instead of covering it', async ({ browser }) => {
    const context = await browser.newContext({ ...iPhone13, storageState: undefined })
    const page = await context.newPage()
    try {
      await page.goto('/en')
      await page.waitForLoadState('load')

      const banner = page.locator('[role="dialog"][aria-modal="false"]')
      await expect(banner).toBeVisible()

      const bottomNav = page.getByRole('navigation', { name: /menu|navigation/i }).last()
      await expect(bottomNav).toBeVisible()

      const bannerBox = await banner.boundingBox()
      const navBox = await bottomNav.boundingBox()
      expect(bannerBox).not.toBeNull()
      expect(navBox).not.toBeNull()

      expect(
        bannerBox!.y + bannerBox!.height,
        'consent banner overlaps the bottom nav, leaving a first-time phone visitor with no navigation',
      ).toBeLessThanOrEqual(navBox!.y + 1)

      expect(
        await bottomNav.getByRole('link').first().isVisible(),
        'bottom-nav tabs should stay visible while the consent banner is up',
      ).toBe(true)
    } finally {
      await context.close()
    }
  })

  test('page-height variables subtract the header exactly once', async ({ page }) => {
    await page.goto('/en/login')
    await page.waitForSelector('form')

    const headerBottom = await page
      .locator('header')
      .first()
      .evaluate((el) => el.getBoundingClientRect().bottom)
    const cardTop = await page
      .locator('form')
      .first()
      .evaluate((el) => el.getBoundingClientRect().top)

    expect(cardTop, 'auth card starts behind the sticky header').toBeGreaterThanOrEqual(
      headerBottom - 1,
    )
  })

  test('bottom-nav space collapses on the routes that drop the bar', async ({ page }) => {
    const resolveBottomNavSpace = () =>
      page.evaluate(() => {
        const probe = document.createElement('div')
        probe.style.cssText =
          'position:absolute;visibility:hidden;height:var(--bottom-nav-space)'
        document.body.append(probe)
        const px = probe.getBoundingClientRect().height
        probe.remove()
        return { px, flag: document.documentElement.dataset.bottomNav ?? null }
      })

    await page.goto('/en')
    await page.waitForLoadState('load')
    const withBar = await resolveBottomNavSpace()
    expect(withBar.flag, '/en renders the bottom nav, so nothing should be stamped').toBeNull()
    expect(withBar.px, '--bottom-nav-space should reserve the bar on a normal route')
      .toBeGreaterThan(0)

    await page.goto('/en/play')
    await page.waitForLoadState('load')
    const inGame = await resolveBottomNavSpace()
    expect(inGame.flag, '/play should mark the bottom nav hidden').toBe('hidden')
    expect(
      inGame.px,
      '/play still reserves space for a bar it does not render',
    ).toBe(0)
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
