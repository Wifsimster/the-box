/**
 * Accessibility Smoke Tests (Sprint 0 of shadcn migration)
 *
 * Runs axe-core against the 5 user-facing surfaces that matter most for the
 * shadcn migration. Failures here signal that either:
 *   (a) we shipped a regression during a primitive migration, or
 *   (b) a custom component is missing a11y affordances that a shadcn primitive
 *       would have given us for free.
 *
 * Tolerated violations: we intentionally start the harness with impact
 * "serious" and "critical" only, so Sprint 0 lands green. Sprint 1 will tighten
 * to include "moderate". This avoids flooding CI with noise from legacy
 * components we already plan to replace.
 */
import { test as authTest } from './fixtures/auth.fixture'
import { test as base, expect } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'

const SERIOUS_OR_CRITICAL = ['serious', 'critical'] as const

async function runAxe(page: import('@playwright/test').Page, label: string) {
  const results = await new AxeBuilder({ page })
    // Rule-level tuning. Safe to remove entries once the app satisfies them.
    .disableRules([
      // Dark-theme + gaming gradients trip color-contrast in some places;
      // tracked separately in the migration plan and enforced via design review.
      'color-contrast',
    ])
    .analyze()

  const blocking = results.violations.filter((v) =>
    (SERIOUS_OR_CRITICAL as readonly string[]).includes(v.impact ?? ''),
  )

  if (blocking.length > 0) {
    const summary = blocking
      .map(
        (v) =>
          `  • [${v.impact}] ${v.id} — ${v.help}\n    ${v.nodes.length} node(s): ${v.nodes
            .slice(0, 3)
            .map((n) => n.target.join(' '))
            .join(' | ')}`,
      )
      .join('\n')
    throw new Error(`a11y violations on ${label}:\n${summary}`)
  }

  expect(blocking, `no serious/critical a11y violations on ${label}`).toHaveLength(0)
}

base.describe('a11y smoke — public surfaces', () => {
  base('Home', async ({ page }) => {
    await page.goto('/en')
    await page.waitForLoadState('networkidle')
    await runAxe(page, 'Home')
  })

  base('Login', async ({ page }) => {
    await page.goto('/en/login')
    await page.waitForSelector('form')
    await runAxe(page, 'Login')
  })

  base('Register', async ({ page }) => {
    await page.goto('/en/register')
    await page.waitForSelector('form')
    await runAxe(page, 'Register')
  })

  base('Leaderboard (public)', async ({ page }) => {
    await page.goto('/en/leaderboard')
    await page.waitForLoadState('networkidle')
    await runAxe(page, 'Leaderboard')
  })
})

authTest.describe('a11y smoke — authenticated surfaces', () => {
  authTest('Profile', async ({ authenticatedPage }) => {
    await authenticatedPage.goto('/en/profile')
    await authenticatedPage.waitForLoadState('networkidle')
    await runAxe(authenticatedPage, 'Profile')
  })
})
