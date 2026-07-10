// Zero-dependency MCP server core for The Box geo content-sourcing tools
// (issue #331, phase 2). Pure JSON-RPC dispatch — no stdio, no network — so it
// is fully unit-testable. `index.ts` wires this to a newline-delimited stdio
// transport and a real HTTP client.

export const SERVER_INFO = { name: 'the-box-geo-agent', version: '2.139.0' } as const
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
]

function asPositiveInt(value: unknown): number | null {
  const n = Number(value)
  return Number.isInteger(n) && n > 0 ? n : null
}

/** Resolve a tool call to the agent-API path, or an error message. */
export function resolveToolPath(
  name: string,
  args: Record<string, unknown> | undefined,
): { path: string } | { error: string } {
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
  // Perform an authenticated GET against the agent API, returning parsed JSON.
  callApi: (path: string) => Promise<unknown>
  protocolVersion?: string
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
        serverInfo: SERVER_INFO,
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
        const data = await deps.callApi(resolved.path)
        return result(msg.id, toolText(JSON.stringify(data, null, 2)))
      } catch (err) {
        return result(msg.id, toolText(`request failed: ${String(err)}`, true))
      }
    }
    default:
      return rpcError(msg.id, -32601, `method not found: ${msg.method}`)
  }
}
