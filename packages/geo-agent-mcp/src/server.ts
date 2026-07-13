// Zero-dependency MCP server core for The Box geo content-sourcing tools
// (issue #331, phase 2). Pure JSON-RPC dispatch — no stdio, no network — so it
// is fully unit-testable. `index.ts` wires this to a newline-delimited stdio
// transport and a real HTTP client.

// Server identity. `version` here is only a fallback: the stdio entrypoint
// (index.ts) injects the real version read from package.json at startup, so the
// advertised version tracks the release-bumped package.json instead of drifting.
export const SERVER_INFO = { name: 'the-box-geo-agent', version: '0.0.0-dev' } as const
export const DEFAULT_PROTOCOL_VERSION = '2024-11-05'

export interface ToolDef {
  name: string
  description: string
  inputSchema: {
    type: 'object'
    properties: Record<string, unknown>
    required?: string[]
    additionalProperties?: boolean
  }
}

// Maps a tool call to a GET path on /api/agent/v1/geo. Kept declarative so the
// tool list and the routing agree by construction.
export const TOOLS: ToolDef[] = [
  {
    name: 'geo_health',
    description:
      'GeoGamers content-readiness snapshot: eligible game count, whether the pool is starved, and the min required. No arguments.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
  },
  {
    name: 'geo_games_needing_content',
    description:
      'The "one pin away" list: games with an active map and captures collecting pins but no canonical pin yet — where a proposed pin would grow the eligible pool. Sorted by proximity to promotion.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max games (1-100, default 25)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'geo_list_candidates',
    description:
      "Unpinned/collecting captures for a game plus its active maps (image url + dimensions), so a proposer can localize a screenshot.",
    inputSchema: {
      type: 'object',
      properties: {
        gameId: { type: 'number', description: 'Game id (required)' },
        limit: { type: 'number', description: 'Max captures (1-100, default 50)' },
      },
      required: ['gameId'],
      additionalProperties: false,
    },
  },
  {
    name: 'geo_ingest_game',
    description:
      'Trigger the map-ingestion pipeline for a game (needs a geo-agent:ingest key). Optionally restrict to specific tiers; defaults to all. Subject to a per-key daily budget.',
    inputSchema: {
      type: 'object',
      properties: {
        gameId: { type: 'number', description: 'Game id (required)' },
        sources: {
          type: 'array',
          items: {
            type: 'string',
            enum: ['registry', 'fandom', 'strategywiki', 'fextralife', 'wand', 'wikidata'],
          },
          description: 'Optional tier allowlist; omit for all',
        },
      },
      required: ['gameId'],
      additionalProperties: false,
    },
  },
  {
    name: 'geo_list_games',
    description:
      'The whole geo-curated catalog, not just the "one pin away" work queue: every enrolled game with capture/map/canonical-pin counts and eligible/starved flags.',
    inputSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Max games (1-500, default 200)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'geo_enroll_game',
    description:
      'Enroll a game into the geo pipeline (needs a geo-agent:curate key). Pass either gameId (an existing game) or rawgId (looked up, or created if no game has that rawg_id yet). Flips geo_curated on so the existing metadata resolver + ingest pipeline picks it up. Subject to a per-key daily budget.',
    inputSchema: {
      type: 'object',
      properties: {
        gameId: { type: 'number', description: 'Existing internal game id' },
        rawgId: { type: 'number', description: 'RAWG game id (looked up or created)' },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'geo_import_captures',
    description:
      'Top up an enrolled game\'s screenshot candidates (needs a geo-agent:curate key). Either pulls more from RAWG (targetCount) or inserts an explicit imageUrls list for manual/gameplay captures. Requires the game to already have an enabled map. Subject to a per-key daily budget.',
    inputSchema: {
      type: 'object',
      properties: {
        gameId: { type: 'number', description: 'Game id (required)' },
        targetCount: { type: 'number', description: 'Max RAWG screenshots to fetch (ignored if imageUrls is set)' },
        imageUrls: {
          type: 'array',
          items: { type: 'string' },
          description: 'Explicit capture image URLs (manual/gameplay stills) instead of pulling from RAWG',
        },
      },
      required: ['gameId'],
      additionalProperties: false,
    },
  },
  {
    name: 'geo_list_maps',
    description:
      "Every candidate map fetched for a game, active or not, so an agent can pick the canonical one and reject wrong-game/prop maps.",
    inputSchema: {
      type: 'object',
      properties: {
        gameId: { type: 'number', description: 'Game id (required)' },
      },
      required: ['gameId'],
      additionalProperties: false,
    },
  },
  {
    name: 'geo_set_canonical_map',
    description:
      'Promote a candidate map to canonical for a game (needs a geo-agent:curate key). Use this to fix a wrong-game map once geo_list_maps shows the correct one. Subject to a per-key daily budget.',
    inputSchema: {
      type: 'object',
      properties: {
        gameId: { type: 'number', description: 'Game id (required)' },
        mapId: { type: 'number', description: 'geo_map id to select (required)' },
      },
      required: ['gameId', 'mapId'],
      additionalProperties: false,
    },
  },
  {
    name: 'geo_reject_map',
    description:
      'Disable a wrong-game or prop map (needs a geo-agent:curate key). Refuses to leave a game with zero enabled maps — select a replacement canonical map first if this is the last one. Subject to a per-key daily budget.',
    inputSchema: {
      type: 'object',
      properties: {
        gameId: { type: 'number', description: 'Game id (required)' },
        mapId: { type: 'number', description: 'geo_map id to reject (required)' },
      },
      required: ['gameId', 'mapId'],
      additionalProperties: false,
    },
  },
  {
    name: 'geo_upload_map',
    description:
      "Register a map image for a game (needs a geo-agent:curate key) — the last-resort content path when the ingestion tiers found no usable map. You host the image yourself and pass its URL plus its pixel dimensions and license; nothing is processed server-side. Recorded as a `manual` map, DISABLED by default (enable/select it afterwards) unless `enable: true`. Subject to a per-key daily budget.",
    inputSchema: {
      type: 'object',
      properties: {
        gameId: { type: 'number', description: 'Game id (required)' },
        imageUrl: { type: 'string', description: 'Publicly reachable map image URL you host (required)' },
        widthPx: { type: 'number', description: 'Map image width in pixels (required)' },
        heightPx: { type: 'number', description: 'Map image height in pixels (required)' },
        license: { type: 'string', description: 'License of the asset, e.g. "CC-BY-4.0" (required, ≤100 chars)' },
        attribution: { type: 'string', description: 'Optional attribution string (≤500 chars)' },
        sourceUrl: { type: 'string', description: 'Optional source/provenance page URL' },
        consensusRadius: { type: 'number', description: 'Optional consensus radius in [0.001,1] (default 0.03)' },
        region: { type: 'string', description: 'Optional region/zone label for multi-map games' },
        enable: { type: 'boolean', description: 'Enable (and select) the map immediately; default false' },
      },
      required: ['gameId', 'imageUrl', 'widthPx', 'heightPx', 'license'],
      additionalProperties: false,
    },
  },
  {
    name: 'geo_propose_pin',
    description:
      "Propose a location pin for a capture (needs a geo-agent:propose key). The pin is DOWNWEIGHTED and can never promote ground truth on its own — it joins consensus as one flagged voter, reviewed by humans. `rationale` is required. Propose only when confident; a wrong pin poisons the centroid.",
    inputSchema: {
      type: 'object',
      properties: {
        candidateId: { type: 'number', description: 'geo_screenshot_candidate id (required)' },
        x: { type: 'number', description: 'Normalized x in [0,1] (required)' },
        y: { type: 'number', description: 'Normalized y in [0,1] (required)' },
        source: {
          type: 'string',
          enum: ['agent_structured', 'agent_vision'],
          description: 'agent_structured (scraped coords) or agent_vision (LLM localization)',
        },
        rationale: { type: 'string', description: 'Why this location — the review artifact (required, <=500 chars)' },
        confidence: { type: 'number', enum: [1, 2, 3], description: 'Optional self-reported confidence (1 sure … 3 guess)' },
        model: { type: 'string', description: 'Optional model id for a vision pin' },
        visionPass: { type: 'number', description: 'Optional independent vision pass index 0-2' },
      },
      required: ['candidateId', 'x', 'y', 'source', 'rationale'],
      additionalProperties: false,
    },
  },
  {
    name: 'geo_promote_candidate',
    description:
      "Confirm & promote a capture's consensus pin to canonical ground truth (needs a geo-agent:promote key). Safe by construction: you supply NO coordinates — the server re-runs consensus and promotes only if it already QUALIFIES (≥5 accepted human pins + a tight cluster). Agent pins never count toward that gate, so this can only pull the trigger on a promotion the crowd already earned. Rejected with CONSENSUS_NOT_READY otherwise.",
    inputSchema: {
      type: 'object',
      properties: {
        candidateId: { type: 'number', description: 'geo_screenshot_candidate id (required)' },
      },
      required: ['candidateId'],
      additionalProperties: false,
    },
  },
  {
    name: 'geo_promote_override',
    description:
      "Override-promote a well-localized capture at coordinates YOU supply (needs a geo-agent:promote-override key). Unlike geo_promote_candidate, this BYPASSES the consensus gate — you assert the canonical location directly, so use it only when you are confident of the pin (e.g. a landmark you can place exactly). The meta is tagged promoted_via='agent_override' (distinguishable and reversible). The capture's map must be enabled first, or you get MAP_NOT_ACTIVE. Behind its own kill switch and a tight daily budget.",
    inputSchema: {
      type: 'object',
      properties: {
        candidateId: { type: 'number', description: 'geo_screenshot_candidate id (required)' },
        canonicalX: { type: 'number', description: 'Normalized canonical x in [0,1] (required)' },
        canonicalY: { type: 'number', description: 'Normalized canonical y in [0,1] (required)' },
      },
      required: ['candidateId', 'canonicalX', 'canonicalY'],
      additionalProperties: false,
    },
  },
  {
    name: 'geo_repoint_captures',
    description:
      "Move a game's still-open (un-promoted) capture candidates onto an enabled map (needs a geo-agent:curate key). Use this to fix captures stranded on an old/rejected map after a map swap — otherwise promoting one builds a broken challenge. select/upload already re-point automatically for swaps done through this API; this is the explicit fix for pre-existing strandings. mapId must be an enabled map for the game. Promoted metas are left untouched.",
    inputSchema: {
      type: 'object',
      properties: {
        gameId: { type: 'number', description: 'Game id (required)' },
        mapId: { type: 'number', description: 'Enabled geo_map id to re-point captures onto (required)' },
      },
      required: ['gameId', 'mapId'],
      additionalProperties: false,
    },
  },
]

function asPositiveInt(value: unknown): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

export interface ApiRequest {
  path: string
  method?: 'GET' | 'POST'
  body?: unknown
}

/** Resolve a tool call to an agent-API request, or an error message. */
export function resolveToolPath(
  name: string,
  args: Record<string, unknown> | undefined,
): ApiRequest | { error: string } {
  const a = args ?? {}
  const limit = a['limit'] !== undefined ? asPositiveInt(a['limit']) : undefined
  if (a['limit'] !== undefined && limit === null) return { error: 'limit must be a positive integer' }
  const qs = limit !== undefined ? `?limit=${limit}` : ''

  switch (name) {
    case 'geo_health':
      return { path: '/api/agent/v1/geo/health' }
    case 'geo_games_needing_content':
      return { path: `/api/agent/v1/geo/games-needing-content${qs}` }
    case 'geo_list_candidates': {
      const gameId = asPositiveInt(a['gameId'])
      if (gameId === null) return { error: 'gameId is required and must be a positive integer' }
      return { path: `/api/agent/v1/geo/games/${gameId}/candidates${qs}` }
    }
    case 'geo_ingest_game': {
      const gameId = asPositiveInt(a['gameId'])
      if (gameId === null) return { error: 'gameId is required and must be a positive integer' }
      const body: Record<string, unknown> = {}
      if (a['sources'] !== undefined) {
        if (!Array.isArray(a['sources'])) return { error: 'sources must be an array' }
        body['sources'] = a['sources']
      }
      return { path: `/api/agent/v1/geo/games/${gameId}/ingest`, method: 'POST', body }
    }
    case 'geo_list_games':
      return { path: `/api/agent/v1/geo/games${qs}` }
    case 'geo_enroll_game': {
      const body: Record<string, unknown> = {}
      if (a['gameId'] !== undefined) {
        const gameId = asPositiveInt(a['gameId'])
        if (gameId === null) return { error: 'gameId must be a positive integer' }
        body['gameId'] = gameId
      }
      if (a['rawgId'] !== undefined) {
        const rawgId = asPositiveInt(a['rawgId'])
        if (rawgId === null) return { error: 'rawgId must be a positive integer' }
        body['rawgId'] = rawgId
      }
      if (body['gameId'] === undefined && body['rawgId'] === undefined) {
        return { error: 'gameId or rawgId is required' }
      }
      return { path: '/api/agent/v1/geo/games', method: 'POST', body }
    }
    case 'geo_import_captures': {
      const gameId = asPositiveInt(a['gameId'])
      if (gameId === null) return { error: 'gameId is required and must be a positive integer' }
      const body: Record<string, unknown> = {}
      if (a['targetCount'] !== undefined) {
        const targetCount = asPositiveInt(a['targetCount'])
        if (targetCount === null) return { error: 'targetCount must be a positive integer' }
        body['targetCount'] = targetCount
      }
      if (a['imageUrls'] !== undefined) {
        if (!Array.isArray(a['imageUrls'])) return { error: 'imageUrls must be an array' }
        body['imageUrls'] = a['imageUrls']
      }
      return { path: `/api/agent/v1/geo/games/${gameId}/captures`, method: 'POST', body }
    }
    case 'geo_list_maps': {
      const gameId = asPositiveInt(a['gameId'])
      if (gameId === null) return { error: 'gameId is required and must be a positive integer' }
      return { path: `/api/agent/v1/geo/games/${gameId}/maps` }
    }
    case 'geo_set_canonical_map': {
      const gameId = asPositiveInt(a['gameId'])
      const mapId = asPositiveInt(a['mapId'])
      if (gameId === null) return { error: 'gameId is required and must be a positive integer' }
      if (mapId === null) return { error: 'mapId is required and must be a positive integer' }
      return { path: `/api/agent/v1/geo/games/${gameId}/maps/${mapId}/select`, method: 'POST', body: {} }
    }
    case 'geo_reject_map': {
      const gameId = asPositiveInt(a['gameId'])
      const mapId = asPositiveInt(a['mapId'])
      if (gameId === null) return { error: 'gameId is required and must be a positive integer' }
      if (mapId === null) return { error: 'mapId is required and must be a positive integer' }
      return { path: `/api/agent/v1/geo/games/${gameId}/maps/${mapId}/reject`, method: 'POST', body: {} }
    }
    case 'geo_upload_map': {
      const gameId = asPositiveInt(a['gameId'])
      if (gameId === null) return { error: 'gameId is required and must be a positive integer' }
      if (typeof a['imageUrl'] !== 'string' || a['imageUrl'].trim() === '') {
        return { error: 'imageUrl is required' }
      }
      const widthPx = asPositiveInt(a['widthPx'])
      const heightPx = asPositiveInt(a['heightPx'])
      if (widthPx === null || heightPx === null) {
        return { error: 'widthPx and heightPx are required positive integers' }
      }
      if (typeof a['license'] !== 'string' || a['license'].trim() === '') {
        return { error: 'license is required' }
      }
      const body: Record<string, unknown> = {
        imageUrl: a['imageUrl'],
        widthPx,
        heightPx,
        license: a['license'],
      }
      for (const k of ['attribution', 'sourceUrl', 'consensusRadius', 'region', 'enable'] as const) {
        if (a[k] !== undefined) body[k] = a[k]
      }
      return { path: `/api/agent/v1/geo/games/${gameId}/maps`, method: 'POST', body }
    }
    case 'geo_propose_pin': {
      const candidateId = asPositiveInt(a['candidateId'])
      if (candidateId === null) return { error: 'candidateId is required and must be a positive integer' }
      if (typeof a['x'] !== 'number' || typeof a['y'] !== 'number') {
        return { error: 'x and y are required numbers in [0,1]' }
      }
      if (a['source'] !== 'agent_structured' && a['source'] !== 'agent_vision') {
        return { error: 'source must be agent_structured or agent_vision' }
      }
      if (typeof a['rationale'] !== 'string' || a['rationale'].trim() === '') {
        return { error: 'rationale is required' }
      }
      const body: Record<string, unknown> = {
        x: a['x'],
        y: a['y'],
        source: a['source'],
        rationale: a['rationale'],
      }
      for (const k of ['confidence', 'model', 'visionPass'] as const) {
        if (a[k] !== undefined) body[k] = a[k]
      }
      return { path: `/api/agent/v1/geo/candidates/${candidateId}/pins`, method: 'POST', body }
    }
    case 'geo_promote_candidate': {
      const candidateId = asPositiveInt(a['candidateId'])
      if (candidateId === null) return { error: 'candidateId is required and must be a positive integer' }
      return { path: `/api/agent/v1/geo/candidates/${candidateId}/promote`, method: 'POST', body: {} }
    }
    case 'geo_promote_override': {
      const candidateId = asPositiveInt(a['candidateId'])
      if (candidateId === null) return { error: 'candidateId is required and must be a positive integer' }
      if (typeof a['canonicalX'] !== 'number' || typeof a['canonicalY'] !== 'number') {
        return { error: 'canonicalX and canonicalY are required numbers in [0,1]' }
      }
      return {
        path: `/api/agent/v1/geo/candidates/${candidateId}/promote-override`,
        method: 'POST',
        body: { canonicalX: a['canonicalX'], canonicalY: a['canonicalY'] },
      }
    }
    case 'geo_repoint_captures': {
      const gameId = asPositiveInt(a['gameId'])
      const mapId = asPositiveInt(a['mapId'])
      if (gameId === null) return { error: 'gameId is required and must be a positive integer' }
      if (mapId === null) return { error: 'mapId is required and must be a positive integer' }
      return {
        path: `/api/agent/v1/geo/games/${gameId}/maps/${mapId}/repoint-captures`,
        method: 'POST',
        body: {},
      }
    }
    default:
      return { error: `unknown tool: ${name}` }
  }
}

export interface JsonRpcMessage {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

export interface RpcDeps {
  // Perform an authenticated request against the agent API, returning parsed
  // JSON. Defaults to GET; the ingest tool issues a POST with a JSON body.
  callApi: (req: ApiRequest) => Promise<unknown>
  protocolVersion?: string
  // Overrides SERVER_INFO for the initialize reply (index.ts passes the
  // package.json version). Falls back to SERVER_INFO when omitted (tests).
  serverInfo?: { name: string; version: string }
}

function result(id: JsonRpcMessage['id'], value: unknown) {
  return { jsonrpc: '2.0', id, result: value }
}
function rpcError(id: JsonRpcMessage['id'], code: number, message: string) {
  return { jsonrpc: '2.0', id, error: { code, message } }
}
function toolText(text: string, isError = false) {
  return { content: [{ type: 'text', text }], isError }
}

/**
 * Handle a single JSON-RPC message. Returns the response object to write, or
 * null for notifications (no id) which take no reply.
 */
export async function handleRpc(
  msg: JsonRpcMessage,
  deps: RpcDeps,
): Promise<object | null> {
  // Notifications carry no id and expect no response.
  if (msg.id === undefined || msg.id === null) return null

  switch (msg.method) {
    case 'initialize':
      return result(msg.id, {
        protocolVersion:
          (msg.params?.['protocolVersion'] as string | undefined) ??
          deps.protocolVersion ??
          DEFAULT_PROTOCOL_VERSION,
        capabilities: { tools: {} },
        serverInfo: deps.serverInfo ?? SERVER_INFO,
      })
    case 'ping':
      return result(msg.id, {})
    case 'tools/list':
      return result(msg.id, { tools: TOOLS })
    case 'tools/call': {
      const name = msg.params?.['name'] as string | undefined
      const args = msg.params?.['arguments'] as Record<string, unknown> | undefined
      if (!name) return rpcError(msg.id, -32602, 'missing tool name')
      const resolved = resolveToolPath(name, args)
      if ('error' in resolved) return result(msg.id, toolText(resolved.error, true))
      try {
        const data = await deps.callApi(resolved)
        return result(msg.id, toolText(JSON.stringify(data, null, 2)))
      } catch (err) {
        return result(msg.id, toolText(`request failed: ${String(err)}`, true))
      }
    }
    default:
      return rpcError(msg.id, -32601, `method not found: ${msg.method}`)
  }
}
