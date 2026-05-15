import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import publicV1Routes from './public.routes.js'

// Drift guard: docs/public-api.openapi.yaml must stay in sync with the routes
// actually registered on the public router. Catches both failure modes — a
// route added without a spec entry, and a spec entry whose route was removed
// or renamed.
//
// No YAML dependency: the router is introspected via its layer stack, and the
// spec's `paths:` block is scanned with line regexes. That works because we
// control the spec's formatting (2-space path keys, 4-space method keys); if
// someone reformats it unrecognisably this test fails loudly, which is the
// correct signal — regenerate the spec.

const SPEC_PATH = fileURLToPath(
  new URL('../../../../../docs/public-api.openapi.yaml', import.meta.url),
)

// Express template (`:slug`) → OpenAPI template (`{slug}`).
function toOpenApiPath(p: string): string {
  return p.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

interface RouteLayer {
  route?: { path?: string; methods?: Record<string, boolean> }
}

// "METHOD /path" pairs registered on the public router.
function routerPairs(): Set<string> {
  const stack = (publicV1Routes as unknown as { stack?: RouteLayer[] }).stack ?? []
  const pairs = new Set<string>()
  for (const layer of stack) {
    const route = layer.route
    if (!route?.path) continue
    const path = toOpenApiPath(route.path)
    for (const method of Object.keys(route.methods ?? {})) {
      if (method === '_all') continue
      pairs.add(`${method.toUpperCase()} ${path}`)
    }
  }
  return pairs
}

// "METHOD /path" pairs declared in the OpenAPI spec's paths: block.
function specPairs(): Set<string> {
  const text = readFileSync(SPEC_PATH, 'utf8')
  const start = text.indexOf('\npaths:')
  assert.ok(start >= 0, 'spec must have a paths: section')
  const after = text.slice(start + '\npaths:'.length)
  // The block ends at the next column-0 key (e.g. `components:`).
  const end = after.match(/\n[A-Za-z]/)
  const block = end ? after.slice(0, end.index) : after

  const pairs = new Set<string>()
  let currentPath = ''
  for (const line of block.split('\n')) {
    const pathMatch = line.match(/^ {2}(\/[^\s:]*):\s*$/)
    if (pathMatch) {
      currentPath = pathMatch[1]!
      continue
    }
    const methodMatch = line.match(/^ {4}(get|post|put|delete|patch):\s*$/)
    if (methodMatch && currentPath) {
      pairs.add(`${methodMatch[1]!.toUpperCase()} ${currentPath}`)
    }
  }
  return pairs
}

describe('public API — OpenAPI spec ↔ router parity', () => {
  it('introspection and spec scan both find routes', () => {
    assert.ok(routerPairs().size > 0, 'router introspection found no routes')
    assert.ok(specPairs().size > 0, 'spec scan found no paths')
  })

  it('every registered route is documented in the OpenAPI spec', () => {
    const spec = specPairs()
    for (const pair of routerPairs()) {
      assert.ok(
        spec.has(pair),
        `route "${pair}" is registered but missing from docs/public-api.openapi.yaml`,
      )
    }
  })

  it('every documented operation maps to a registered route', () => {
    const router = routerPairs()
    for (const pair of specPairs()) {
      assert.ok(
        router.has(pair),
        `spec documents "${pair}" but no such route is registered`,
      )
    }
  })
})
