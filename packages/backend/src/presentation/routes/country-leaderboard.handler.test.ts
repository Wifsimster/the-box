import { describe, it, before, after } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import type { CountryCode, CountryLeaderboardResponse } from '@the-box/types'
import { createCountryLeaderboardHandler } from './country-leaderboard.handler.js'

describe('GET /monthly/:year/:month/countries', () => {
  let server: Server
  let baseUrl: string
  const calls: Array<{ year: number; month: number; viewer?: { countryCode: CountryCode | null } }> = []

  before(async () => {
    const app = express()
    // Stand-in for optionalAuthMiddleware: the test picks the session by header.
    app.use((req, _res, next) => {
      const as = req.header('x-test-user')
      if (as === 'guest') {
        req.userId = 'guest-1'
        req.isGuest = true
      } else if (as) {
        req.userId = as
        req.isGuest = false
      }
      next()
    })
    app.get(
      '/monthly/:year/:month/countries',
      createCountryLeaderboardHandler({
        getMonthlyCountryLeaderboard: async (year, month, viewer) => {
          calls.push({ year, month, viewer })
          if (year === 2100) throw new Error('Cannot request leaderboard for future months')
          const res: CountryLeaderboardResponse = {
            year,
            month,
            minPlayers: 5,
            entries: [{ rank: 1, countryCode: 'FR', averageScore: 1400, playerCount: 7 }],
          }
          if (viewer) res.viewer = { countryCode: viewer.countryCode, playerCount: viewer.countryCode ? 7 : 0 }
          return res
        },
        findViewerCountry: async (userId) => (userId === 'with-country' ? 'FR' : null),
      })
    )
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => resolve())
    })
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })

  after(() => {
    server.close()
  })

  it('returns the ranking without a viewer block for an anonymous request', async () => {
    const res = await fetch(`${baseUrl}/monthly/2026/10/countries`)
    assert.equal(res.status, 200)
    const body = (await res.json()) as { success: boolean; data: CountryLeaderboardResponse }
    assert.equal(body.success, true)
    assert.equal(body.data.minPlayers, 5)
    assert.equal(body.data.entries[0]!.countryCode, 'FR')
    assert.equal(body.data.viewer, undefined)
    assert.deepEqual(calls.at(-1), { year: 2026, month: 10, viewer: undefined })
  })

  it('adds the viewer country for a signed-in player', async () => {
    const res = await fetch(`${baseUrl}/monthly/2026/10/countries`, { headers: { 'x-test-user': 'with-country' } })
    const body = (await res.json()) as { data: CountryLeaderboardResponse }
    assert.deepEqual(body.data.viewer, { countryCode: 'FR', playerCount: 7 })
  })

  it('reports a null country for a signed-in player without one', async () => {
    const res = await fetch(`${baseUrl}/monthly/2026/10/countries`, { headers: { 'x-test-user': 'no-country' } })
    const body = (await res.json()) as { data: CountryLeaderboardResponse }
    assert.deepEqual(body.data.viewer, { countryCode: null, playerCount: 0 })
  })

  it('treats a guest session as anonymous', async () => {
    const res = await fetch(`${baseUrl}/monthly/2026/10/countries`, { headers: { 'x-test-user': 'guest' } })
    const body = (await res.json()) as { data: CountryLeaderboardResponse }
    assert.equal(body.data.viewer, undefined)
  })

  it('rejects a bad year, a bad month and a future month', async () => {
    const badYear = await fetch(`${baseUrl}/monthly/26/10/countries`)
    assert.equal(badYear.status, 400)
    assert.equal(((await badYear.json()) as { error: { code: string } }).error.code, 'INVALID_YEAR')

    const badMonth = await fetch(`${baseUrl}/monthly/2026/13/countries`)
    assert.equal(badMonth.status, 400)
    assert.equal(((await badMonth.json()) as { error: { code: string } }).error.code, 'INVALID_MONTH')

    const future = await fetch(`${baseUrl}/monthly/2100/1/countries`)
    assert.equal(future.status, 400)
    assert.equal(((await future.json()) as { error: { code: string } }).error.code, 'FUTURE_MONTH')
  })
})
