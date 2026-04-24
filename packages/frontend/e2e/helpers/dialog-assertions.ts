import { Page, expect, Locator } from '@playwright/test'

/**
 * Shared helper for asserting that an open dialog fits inside a mobile viewport.
 *
 * Catches the most common dialog-on-mobile regressions:
 *  - the dialog panel itself spills past the right edge of the screen,
 *  - the close button sits in a zone the user cannot reach,
 *  - the page underneath gains a horizontal scrollbar because of the dialog.
 *
 * Intentionally permissive when no dialog is open: each assertion becomes a
 * no-op. Tests that require the dialog to be open should assert that first.
 */
export async function assertDialogFits(
  page: Page,
  maxWidth = 375,
  options: { dialogLocator?: Locator } = {}
): Promise<void> {
  const dialog = options.dialogLocator ?? page.locator('[role="dialog"]').first()

  if (!(await dialog.isVisible().catch(() => false))) return

  // 1. Dialog panel must not spill past the right edge.
  const dialogBox = await dialog.boundingBox()
  expect(dialogBox, 'dialog has a bounding box').not.toBeNull()
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(maxWidth)

  // 2. The close affordance (if present) must be inside the viewport so users
  //    can dismiss the dialog with their thumb.
  const closeButton = dialog
    .getByRole('button', { name: /close|fermer/i })
    .first()
  if (await closeButton.isVisible().catch(() => false)) {
    const btnBox = await closeButton.boundingBox()
    expect(btnBox, 'close button has a bounding box').not.toBeNull()
    expect(btnBox!.x + btnBox!.width).toBeLessThanOrEqual(maxWidth)
    // Touch-target floor: 40px is the minimum we enforce elsewhere in the app.
    expect(btnBox!.height).toBeGreaterThanOrEqual(40)
    expect(btnBox!.width).toBeGreaterThanOrEqual(40)
  }

  // 3. The page itself must not develop horizontal overflow because of the
  //    dialog — a common symptom of a dialog that forgot max-w constraints.
  const documentWidth = await page.evaluate(
    () => document.documentElement.scrollWidth
  )
  expect(documentWidth).toBeLessThanOrEqual(maxWidth)
}
