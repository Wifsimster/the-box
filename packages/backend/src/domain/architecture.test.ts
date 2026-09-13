import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'

/**
 * Executable dependency rule.
 *
 * CLAUDE.md states: "presentation -> domain -> infrastructure; domain has no
 * outward deps". That was documentation only, and it had quietly stopped
 * being true — `domain/services/index.ts` was a composition root importing
 * the Pino logger, four BullMQ queues, the Socket.io emitter and 23
 * repositories, so importing any domain *type* booted Redis.
 *
 * This test makes the rule enforceable instead of aspirational.
 */

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

/** Module specifiers in `import`/`export ... from` statements — not comments. */
function importedModules(source: string): string[] {
  const specifiers: string[] = []
  const pattern = /(?:^|\n)\s*(?:import|export)\b[^;\n]*?from\s*['"]([^'"]+)['"]/g
  for (const match of source.matchAll(pattern)) {
    if (match[1]) specifiers.push(match[1])
  }
  // Bare side-effect imports: import './x.js'
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
      // Tests may reach for infrastructure fixtures; production code may not.
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
    // A second, narrower net: these are the specific concretions that kept
    // leaking in, and they would also be caught by a relative path that
    // sidesteps the `infrastructure/` substring above.
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
  /**
   * Imported names from a module specifier — `import { a, b } from 'x'`.
   * Used to tell "imports the Knex instance" from "imports a health probe
   * that happens to live in the same module".
   */
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
    // Express handlers used to run 86 raw Knex statements: the admin
    // dashboard's analytics, the premium stats panel, the public streamer
    // API, the geo moderation lists. That put persistence, business rules
    // and transport in one function, made the rules untestable without a
    // database, and let the same query drift between copies (the SSE stream
    // and the REST endpoint had two different implementations of one
    // ranking rule).
    //
    // Data access belongs to a repository. Controllers call services.
    // `testConnection` from the same module is fine and deliberately still
    // allowed: the readiness probe's entire job is to check that the database
    // is reachable. What is banned is `db` itself — the query builder.
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
