/**
 * Only same-origin, path-absolute targets are honoured for `?redirect=` so a
 * crafted login link can't bounce a freshly signed-in player to another site.
 */
export function safeRedirect(value: string | null | undefined): string | null {
  if (!value) return null
  if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return null
  return value
}

export function withRedirect(path: string, redirect: string | null): string {
  return redirect ? `${path}?redirect=${encodeURIComponent(redirect)}` : path
}
