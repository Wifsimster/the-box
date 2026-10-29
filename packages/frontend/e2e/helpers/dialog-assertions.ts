import { Page, expect, Locator } from '@playwright/test'

export async function assertDialogFits(
  page: Page,
  maxWidth = 375,
  options: { dialogLocator?: Locator } = {}
): Promise<void> {
  const dialog = options.dialogLocator ?? page.locator('[role="dialog"]').first()

  if (!(await dialog.isVisible().catch(() => false))) return

  const dialogBox = await dialog.boundingBox()
  expect(dialogBox, 'dialog has a bounding box').not.toBeNull()
  expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
  expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(maxWidth)

  const closeButton = dialog
    .getByRole('button', { name: /close|fermer/i })
    .first()
  if (await closeButton.isVisible().catch(() => false)) {
    const btnBox = await closeButton.boundingBox()
    expect(btnBox, 'close button has a bounding box').not.toBeNull()
    expect(btnBox!.x + btnBox!.width).toBeLessThanOrEqual(maxWidth)
    expect(btnBox!.height).toBeGreaterThanOrEqual(40)
    expect(btnBox!.width).toBeGreaterThanOrEqual(40)
  }

  const documentWidth = await page.evaluate(
    () => document.documentElement.scrollWidth
  )
  expect(documentWidth).toBeLessThanOrEqual(maxWidth)
}
