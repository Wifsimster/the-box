import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

const SRC = join(import.meta.dirname, '..')
const DOMAIN = join(SRC, 'domain')
const PRESENTATION = join(SRC, 'presentation')

function tsFilesUnder(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...tsFilesUnder(full))
    } else if (entry.endsWith('.ts')) {
      out.push(full)
    }
  }
  return out
}

function importedModules(source: string): string[] {
  const specifiers: string[] = []
  const pattern = /(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) {
    if (match[1]) specifiers.push(match[1])
  }
  for (const match of source.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) {
    if (match[1]) specifiers.push(match[1])
  }
  return specifiers
}

describe('layer dependency rule', () => {
  it('has domain files to check', () => {
    assert.ok(tsFilesUnder(DOMAIN).length > 50, 'sanity: the domain layer should be non-trivial')
  })

  it('the domain layer never imports from infrastructure/', () => {
    const offenders: string[] = []

    for (const file of tsFilesUnder(DOMAIN)) {
      if (file.endsWith('.test.ts')) continue

      for (const specifier of importedModules(readFileSync(file, 'utf8'))) {
        if (specifier.includes('infrastructure/')) {
          offenders.push(`${relative(SRC, file)} -> ${specifier}`)
        }
      }
    }

    assert.deepEqual(
      offenders.sort(),
      [],
      'domain code must depend on ports, not on concrete infrastructure. ' +
        'Wire concrete adapters in src/composition/ instead.'
    )
  })

  it('the domain layer never imports from presentation/', () => {
    const offenders: string[] = []

    for (const file of tsFilesUnder(DOMAIN)) {
      if (file.endsWith('.test.ts')) continue
      for (const specifier of importedModules(readFileSync(file, 'utf8'))) {
        if (specifier.includes('presentation/')) {
          offenders.push(`${relative(SRC, file)} -> ${specifier}`)
        }
      }
    }

    assert.deepEqual(offenders.sort(), [], 'the domain must not depend on its callers')
  })

  it('domain services never import a queue, socket, database or HTTP client', () => {
    const forbidden = ['bullmq', 'ioredis', 'knex', 'kysely', 'socket.io', 'stripe', 'express', 'pino']
    const offenders: string[] = []

    for (const file of tsFilesUnder(join(DOMAIN, 'services'))) {
      if (file.endsWith('.test.ts')) continue
      for (const specifier of importedModules(readFileSync(file, 'utf8'))) {
        if (forbidden.some((pkg) => specifier === pkg || specifier.startsWith(`${pkg}/`))) {
          offenders.push(`${relative(SRC, file)} -> ${specifier}`)
        }
      }
    }

    assert.deepEqual(offenders.sort(), [], 'domain services must stay free of infrastructure libraries')
  })
})

describe('presentation layer boundaries', () => {
  function importedNamesFrom(source: string, specifierPart: string): string[] {
    const names: string[] = []
    const pattern = new RegExp(
      String.raw`import\s+(?:type\s+)?\{([^}]*)\}\s*from\s*['"][^'"]*` + specifierPart + String.raw`[^'"]*['"]`,
      'g'
    )
    for (const match of source.matchAll(pattern)) {
      for (const raw of (match[1] ?? '').split(',')) {
        const name = raw.replace(/\btype\b/, '').split(' as ')[0]?.trim()
        if (name) names.push(name)
      }
    }
    return names
  }

  it('no route or middleware imports the Knex instance', () => {
    const offenders: string[] = []

    for (const file of tsFilesUnder(PRESENTATION)) {
      if (file.endsWith('.test.ts')) continue
      const source = readFileSync(file, 'utf8')
      if (importedNamesFrom(source, 'database/connection').includes('db')) {
        offenders.push(relative(SRC, file))
      }
    }

    assert.deepEqual(
      offenders.sort(),
      [],
      'presentation code must go through a repository, not the Knex instance'
    )
  })

  it('no route or middleware imports a query builder package', () => {
    const offenders: string[] = []

    for (const file of tsFilesUnder(PRESENTATION)) {
      if (file.endsWith('.test.ts')) continue
      for (const specifier of importedModules(readFileSync(file, 'utf8'))) {
        if (specifier === 'knex' || specifier === 'kysely') {
          offenders.push(`${relative(SRC, file)} -> ${specifier}`)
        }
      }
    }

    assert.deepEqual(offenders.sort(), [])
  })
})
