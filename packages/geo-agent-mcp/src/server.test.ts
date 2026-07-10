import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { handleRpc, resolveToolPath, TOOLS, SERVER_INFO } from './server.js'

const noopApi = async () => ({})

describe('resolveToolPath', () => {
  it('maps geo_health to the health path', () => {
    assert.deepEqual(resolveToolPath('geo_health', {}), {
      path: '/api/agent/v1/geo/health',
    })
  })

  it('appends a validated limit', () => {
    assert.deepEqual(resolveToolPath('geo_games_needing_content', { limit: 5 }), {
      path: '/api/agent/v1/geo/games-needing-content?limit=5',
    })
  })

  it('rejects a non-positive limit', () => {
    const out = resolveToolPath('geo_games_needing_content', { limit: -1 })
    assert.ok('error' in out)
  })

  it('requires a positive gameId for candidates', () => {
    assert.ok('error' in resolveToolPath('geo_list_candidates', {}))
    assert.deepEqual(resolveToolPath('geo_list_candidates', { gameId: 42, limit: 10 }), {
      path: '/api/agent/v1/geo/games/42/candidates?limit=10',
    })
  })

  it('maps geo_ingest_game to a POST with a sources body', () => {
    assert.deepEqual(
      resolveToolPath('geo_ingest_game', { gameId: 7, sources: ['fandom', 'wand'] }),
      { path: '/api/agent/v1/geo/games/7/ingest', method: 'POST', body: { sources: ['fandom', 'wand'] } },
    )
    // Sources omitted → POST with an empty body (server defaults to all tiers).
    assert.deepEqual(resolveToolPath('geo_ingest_game', { gameId: 7 }), {
      path: '/api/agent/v1/geo/games/7/ingest',
      method: 'POST',
      body: {},
    })
  })

  it('rejects geo_ingest_game without a gameId', () => {
    assert.ok('error' in resolveToolPath('geo_ingest_game', { sources: ['fandom'] }))
  })

  it('errors on an unknown tool', () => {
    assert.ok('error' in resolveToolPath('nope', {}))
  })
})

describe('handleRpc', () => {
  it('echoes the client protocol version on initialize', async () => {
    const res = (await handleRpc(
      { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18' } },
      { callApi: noopApi },
    )) as { result: { protocolVersion: string; serverInfo: { name: string } } }
    assert.equal(res.result.protocolVersion, '2025-06-18')
    assert.equal(res.result.serverInfo.name, SERVER_INFO.name)
  })

  it('lists all tools', async () => {
    const res = (await handleRpc(
      { jsonrpc: '2.0', id: 2, method: 'tools/list' },
      { callApi: noopApi },
    )) as { result: { tools: unknown[] } }
    assert.equal(res.result.tools.length, TOOLS.length)
  })

  it('returns null for notifications (no id)', async () => {
    const res = await handleRpc(
      { jsonrpc: '2.0', method: 'notifications/initialized' },
      { callApi: noopApi },
    )
    assert.equal(res, null)
  })

  it('calls the API and wraps the result as tool text', async () => {
    let called = ''
    const res = (await handleRpc(
      { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'geo_health', arguments: {} } },
      {
        callApi: async (req) => {
          called = req.path
          return { starved: true, eligibleGames: 9 }
        },
      },
    )) as { result: { content: Array<{ text: string }>; isError?: boolean } }
    assert.equal(called, '/api/agent/v1/geo/health')
    assert.equal(res.result.isError ?? false, false)
    assert.match(res.result.content[0]!.text, /eligibleGames/)
  })

  it('surfaces an API error as an isError tool result, not a crash', async () => {
    const res = (await handleRpc(
      { jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'geo_health', arguments: {} } },
      {
        callApi: async () => {
          throw new Error('UNAUTHORIZED')
        },
      },
    )) as { result: { content: Array<{ text: string }>; isError?: boolean } }
    assert.equal(res.result.isError, true)
    assert.match(res.result.content[0]!.text, /UNAUTHORIZED/)
  })

  it('returns method-not-found for an unknown method', async () => {
    const res = (await handleRpc(
      { jsonrpc: '2.0', id: 5, method: 'bogus/method' },
      { callApi: noopApi },
    )) as { error: { code: number } }
    assert.equal(res.error.code, -32601)
  })
})
