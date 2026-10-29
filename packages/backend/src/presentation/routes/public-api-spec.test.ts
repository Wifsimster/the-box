import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import publicV1Routes from './public.routes.js'

const SPEC_PATH = fileURLToPath(
  new URL('../../../../../docs/public-api.openapi.yaml', import.meta.url),
)

function toOpenApiPath(p: string): string {
  return p.replace(/:([A-Za-z0-9_]+)/g, '{$1}')
}

interface RouteLayer {
  route?: { path?: string; methods?: Record<string, boolean> }
}

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

function specPairs(): Set<string> {
  const text = readFileSync(SPEC_PATH, 'utf8')
  const start = text.indexOf('\npaths:')
  assert.ok(start >= 0, 'spec must have a paths: section')
  const after = text.slice(start + '\npaths:'.length)
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
