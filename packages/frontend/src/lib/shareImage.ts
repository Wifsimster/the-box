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
