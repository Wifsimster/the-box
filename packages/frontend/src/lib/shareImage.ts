// Native share with the daily card attached.
//
// The share sheet only takes a file on platforms that say so through
// `navigator.canShare({ files })` (iOS/Android browsers, desktop Safari/Edge).
// Everywhere else the text share stays as it was. The card is the same
// 1200×630 PNG the link preview uses (`/api/og/daily.png`, docs/brand.md §5).

export interface ShareNavigator {
  share?: (data: ShareData) => Promise<void>
  canShare?: (data: ShareData) => boolean
}

export function dailyCardUrl(date: string, lang: string): string {
  const params = new URLSearchParams({ date, lang })
  return `/api/og/daily.png?${params.toString()}`
}

export function dailyCardFileName(date: string): string {
  return `the-box-${date}.png`
}

/** True when this browser's share sheet accepts `file`. */
export function canShareFile(nav: ShareNavigator | undefined, file: File): boolean {
  if (!nav || typeof nav.share !== 'function' || typeof nav.canShare !== 'function') {
    return false
  }
  try {
    return nav.canShare({ files: [file] })
  } catch {
    return false
  }
}

/**
 * Payload for `navigator.share`: the card goes in `files` when the browser
 * accepts it, the text (sentence, grid, UTM link) is sent either way.
 */
export function buildSharePayload(
  text: string,
  file: File | null,
  nav: ShareNavigator | undefined,
): ShareData {
  const base: ShareData = { title: 'The Box', text }
  if (file && canShareFile(nav, file)) return { ...base, files: [file] }
  return base
}

export type ShareOutcome = 'shared' | 'cancelled' | 'failed'

/**
 * Shares with the card attached, then retries with text only when the
 * file share is refused (some share targets reject files the browser said
 * it could share). A user cancel is never retried.
 */
export async function shareWithOptionalImage(
  nav: ShareNavigator,
  text: string,
  file: File | null,
): Promise<ShareOutcome> {
  if (typeof nav.share !== 'function') return 'failed'
  const payload = buildSharePayload(text, file, nav)
  try {
    await nav.share(payload)
    return 'shared'
  } catch (err) {
    if (isAbort(err)) return 'cancelled'
    if (!payload.files) return 'failed'
  }
  try {
    await nav.share({ title: payload.title, text: payload.text })
    return 'shared'
  } catch (err) {
    return isAbort(err) ? 'cancelled' : 'failed'
  }
}

function isAbort(err: unknown): boolean {
  return (err as { name?: string } | null)?.name === 'AbortError'
}
