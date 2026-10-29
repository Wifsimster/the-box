const SCOPE = '.koe-root'

function scopeSelector(selector: string): string[] {
  const s = selector.trim()
  if (s === '*') return [SCOPE, `${SCOPE} *`]
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
