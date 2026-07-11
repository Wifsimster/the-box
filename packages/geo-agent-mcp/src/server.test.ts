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

  it('maps geo_propose_pin to a POST with the pin body', () => {
    assert.deepEqual(
      resolveToolPath('geo_propose_pin', {
        candidateId: 88,
        x: 0.4,
        y: 0.6,
        source: 'agent_structured',
        rationale: 'landmark match',
        model: 'm',
      }),
      {
        path: '/api/agent/v1/geo/candidates/88/pins',
        method: 'POST',
        body: { x: 0.4, y: 0.6, source: 'agent_structured', rationale: 'landmark match', model: 'm' },
      },
    )
  })

  it('rejects geo_propose_pin missing required fields', () => {
    assert.ok('error' in resolveToolPath('geo_propose_pin', { candidateId: 1, x: 0.5, y: 0.5, source: 'agent_vision' })) // no rationale
    assert.ok('error' in resolveToolPath('geo_propose_pin', { candidateId: 1, x: 0.5, y: 0.5, rationale: 'x', source: 'human' })) // bad source
  })

  it('maps geo_promote_candidate to a POST promote path', () => {
    assert.deepEqual(resolveToolPath('geo_promote_candidate', { candidateId: 88 }), {
      path: '/api/agent/v1/geo/candidates/88/promote',
      method: 'POST',
      body: {},
    })
  })

  it('rejects geo_promote_candidate without a candidateId', () => {
    assert.ok('error' in resolveToolPath('geo_promote_candidate', {}))
  })

  it('errors on an unknown tool', () => {
    assert.ok('error' in resolveToolPath('nope', {}))
  })

  it('maps geo_list_games with a validated limit', () => {
    assert.deepEqual(resolveToolPath('geo_list_games', {}), { path: '/api/agent/v1/geo/games' })
    assert.deepEqual(resolveToolPath('geo_list_games', { limit: 50 }), {
      path: '/api/agent/v1/geo/games?limit=50',
    })
  })

  it('maps geo_enroll_game to a POST with gameId or rawgId', () => {
    assert.deepEqual(resolveToolPath('geo_enroll_game', { gameId: 5 }), {
      path: '/api/agent/v1/geo/games',
      method: 'POST',
      body: { gameId: 5 },
    })
    assert.deepEqual(resolveToolPath('geo_enroll_game', { rawgId: 3498 }), {
      path: '/api/agent/v1/geo/games',
      method: 'POST',
      body: { rawgId: 3498 },
    })
  })

  it('rejects geo_enroll_game without gameId or rawgId', () => {
    assert.ok('error' in resolveToolPath('geo_enroll_game', {}))
  })

  it('maps geo_import_captures to a POST, supporting targetCount and imageUrls', () => {
    assert.deepEqual(resolveToolPath('geo_import_captures', { gameId: 7, targetCount: 10 }), {
      path: '/api/agent/v1/geo/games/7/captures',
      method: 'POST',
      body: { targetCount: 10 },
    })
    assert.deepEqual(
      resolveToolPath('geo_import_captures', { gameId: 7, imageUrls: ['https://x/1.jpg'] }),
      {
        path: '/api/agent/v1/geo/games/7/captures',
        method: 'POST',
        body: { imageUrls: ['https://x/1.jpg'] },
      },
    )
  })

  it('rejects geo_import_captures without a gameId', () => {
    assert.ok('error' in resolveToolPath('geo_import_captures', { targetCount: 5 }))
  })

  it('maps geo_list_maps to the game maps path', () => {
    assert.deepEqual(resolveToolPath('geo_list_maps', { gameId: 42 }), {
      path: '/api/agent/v1/geo/games/42/maps',
    })
    assert.ok('error' in resolveToolPath('geo_list_maps', {}))
  })

  it('maps geo_set_canonical_map to a POST select path', () => {
    assert.deepEqual(resolveToolPath('geo_set_canonical_map', { gameId: 42, mapId: 9 }), {
      path: '/api/agent/v1/geo/games/42/maps/9/select',
      method: 'POST',
      body: {},
    })
    assert.ok('error' in resolveToolPath('geo_set_canonical_map', { gameId: 42 }))
  })

  it('maps geo_reject_map to a POST reject path', () => {
    assert.deepEqual(resolveToolPath('geo_reject_map', { gameId: 42, mapId: 9 }), {
      path: '/api/agent/v1/geo/games/42/maps/9/reject',
      method: 'POST',
      body: {},
    })
    assert.ok('error' in resolveToolPath('geo_reject_map', { mapId: 9 }))
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
