import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { scopeKoeCss } from './koeCssScope'

describe('scopeKoeCss', () => {
  it('scopes the universal Tailwind reset to the widget root', () => {
    assert.equal(
      scopeKoeCss('*,:before,:after{--tw-ring-shadow: 0 0 #0000}'),
      '.koe-root,.koe-root *,.koe-root:before,.koe-root :before,.koe-root:after,.koe-root :after{--tw-ring-shadow: 0 0 #0000}',
    )
  })

  it('scopes ::backdrop', () => {
    assert.equal(
      scopeKoeCss('::backdrop{--tw-shadow: 0 0 #0000}'),
      '.koe-root::backdrop,.koe-root ::backdrop{--tw-shadow: 0 0 #0000}',
    )
  })

  it('leaves koe-scoped rules and at-rules untouched', () => {
    const css =
      '.koe-root{color:red}:where(.koe-root button){font:inherit}' +
      '@keyframes koe-spin{to{transform:rotate(360deg)}}' +
      '@media(max-width:480px){.koe-panel{width:100%}}'
    assert.equal(scopeKoeCss(css), css)
  })

  it('leaves no unscoped top-level selector in the shipped stylesheet', () => {
    const require = createRequire(import.meta.url)
    const css = readFileSync(require.resolve('@wifsimster/koe/style.css'), 'utf8')
    const scoped = scopeKoeCss(css)
    const topLevel: string[] = []
    let depth = 0
    let start = 0
    for (let i = 0; i < scoped.length; i++) {
      if (scoped[i] === '{') {
        if (depth === 0) topLevel.push(scoped.slice(start, i))
        depth++
      } else if (scoped[i] === '}' && --depth === 0) {
        start = i + 1
      }
    }
    for (const prelude of topLevel) {
      if (prelude.trim().startsWith('@')) continue
      for (const selector of prelude.split(',')) {
        assert.match(selector, /koe/, `unscoped selector: ${selector}`)
      }
    }
    assert.doesNotMatch(scoped, /(^|\})\*,:before,:after\{/)
  })
})
