/**
 * Scopes the global rules of the Koe widget stylesheet to `.koe-root`.
 *
 * `@wifsimster/koe` (≤ 1.36.0) ships Tailwind v3's unlayered
 * `*,:before,:after{--tw-ring-shadow:0 0 #0000;--tw-shadow:0 0 #0000;…}`
 * reset. Being unlayered, it beats the host's Tailwind v4 `@layer utilities`
 * and wipes every focus ring and shadow of the app in production
 * (WCAG 2.4.7). This rewrites each top-level rule whose selectors don't
 * mention `koe` so it only matches the widget subtree. A Koe release that
 * already scopes its reset passes through unchanged.
 */

const SCOPE = '.koe-root'

function scopeSelector(selector: string): string[] {
  const s = selector.trim()
  if (s === '*') return [SCOPE, `${SCOPE} *`]
  // Bare pseudo-element / pseudo-class (`:before`, `::backdrop`): match it on
  // the root itself and on its descendants.
  if (s.startsWith(':')) return [`${SCOPE}${s}`, `${SCOPE} ${s}`]
  return [`${SCOPE} ${s}`]
}

function scopeSelectorList(list: string): string {
  const selectors = list.split(',')
  if (selectors.some((s) => s.includes('koe'))) return list
  return selectors.flatMap(scopeSelector).join(',')
}

export function scopeKoeCss(css: string): string {
  let out = ''
  let depth = 0
  let start = 0
  for (let i = 0; i < css.length; i++) {
    const ch = css[i]
    if (ch === '{') {
      if (depth === 0) {
        const prelude = css.slice(start, i)
        out += prelude.trimStart().startsWith('@') ? prelude : scopeSelectorList(prelude)
        start = i
      }
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) {
        out += css.slice(start, i + 1)
        start = i + 1
      }
    }
  }
  return out + css.slice(start)
}
