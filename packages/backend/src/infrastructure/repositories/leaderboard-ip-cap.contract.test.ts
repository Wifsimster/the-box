import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

// The unit suite runs without Postgres, so these checks pin the SQL contract
// of the per-connection cap at source level:
//  - every ranked leaderboard query that drops catch-up sessions also drops
//    IP-capped ones (a new query copying only half the filter would leak
//    capped sessions back onto the board);
//  - the migration defaults `ip_capped` to false, so sessions that existed
//    before the cap — every board already published — stay ranked.

const here = import.meta.dirname
const backendRoot = join(here, '..', '..', '..')

describe('leaderboard per-connection cap — SQL contract', () => {
  it('pairs every catch-up exclusion with an ip-capped exclusion', () => {
    const source = readFileSync(join(here, 'leaderboard.repository.ts'), 'utf-8')
    const catchUp = source.match(/\.andWhere\('game_sessions\.is_catch_up', false\)/g) ?? []
    const capped = source.match(/\.andWhere\('game_sessions\.ip_capped', false\)/g) ?? []
    assert.ok(catchUp.length >= 6, 'expected the daily, percentile, rank, count and monthly queries')
    assert.equal(capped.length, catchUp.length)
  })

  it('adds ip_capped with a false default so published boards are unchanged', () => {
    const dir = join(backendRoot, 'migrations')
    const file = readdirSync(dir).find((f) => f.endsWith('_leaderboard_ip_cap.ts'))
    assert.ok(file, 'migration present')
    const source = readFileSync(join(dir, file), 'utf-8')
    assert.match(source, /boolean\('ip_capped'\)\.notNullable\(\)\.defaultTo\(false\)/)
    assert.doesNotMatch(source, /update\(/, 'the migration must not rewrite existing sessions')
  })

  it('stores a hash, never an ip column', () => {
    const dir = join(backendRoot, 'migrations')
    const file = readdirSync(dir).find((f) => f.endsWith('_leaderboard_ip_cap.ts'))!
    const source = readFileSync(join(dir, file), 'utf-8')
    assert.match(source, /string\('ip_hash', 64\)/)
    assert.doesNotMatch(source, /\('ip(_address)?'/)
  })
})
