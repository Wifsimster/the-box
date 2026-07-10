#!/usr/bin/env node
// MCP stdio entrypoint for the geo content-sourcing tools (issue #331).
// Speaks newline-delimited JSON-RPC on stdin/stdout — the MCP stdio transport.
// stdout is the protocol channel; all diagnostics go to stderr.
//
// Config via env:
//   THE_BOX_AGENT_KEY   (required) — a geo-agent API key (tb_pk_live_… / test)
//   THE_BOX_API_URL     (optional) — backend base URL, default http://localhost:3000
//
// Wire into Claude Code (see README.md) with an `mcpServers` entry pointing at
// this file and the two env vars.

import { handleRpc, type ApiRequest, type JsonRpcMessage } from './server.js'

const API_URL = (process.env['THE_BOX_API_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '')
const AGENT_KEY = process.env['THE_BOX_AGENT_KEY'] ?? ''

function log(msg: string): void {
  process.stderr.write(`[geo-agent-mcp] ${msg}\n`)
}

if (!AGENT_KEY) {
  log('WARNING: THE_BOX_AGENT_KEY is not set — every tool call will fail with 401.')
}

async function callApi(reqSpec: ApiRequest): Promise<unknown> {
  const method = reqSpec.method ?? 'GET'
  const init: RequestInit = {
    method,
    headers: { Authorization: `Bearer ${AGENT_KEY}`, Accept: 'application/json' },
  }
  if (method === 'POST') {
    ;(init.headers as Record<string, string>)['Content-Type'] = 'application/json'
    init.body = JSON.stringify(reqSpec.body ?? {})
  }
  const res = await fetch(`${API_URL}${reqSpec.path}`, init)
  const json = (await res.json().catch(() => ({}))) as {
    success?: boolean
    data?: unknown
    error?: { code?: string }
  }
  if (!res.ok || !json?.success) {
    throw new Error(json?.error?.code ?? `HTTP ${res.status}`)
  }
  return json.data
}

function write(obj: object): void {
  process.stdout.write(`${JSON.stringify(obj)}\n`)
}

async function main(): Promise<void> {
  let buffer = ''
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk: string) => {
    buffer += chunk
    let nl: number
    // Process every complete newline-delimited message; keep the remainder.
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      let msg: JsonRpcMessage
      try {
        msg = JSON.parse(line) as JsonRpcMessage
      } catch {
        log(`skipping unparseable line: ${line.slice(0, 120)}`)
        continue
      }
      void handleRpc(msg, { callApi })
        .then((response) => {
          if (response) write(response)
        })
        .catch((err) => log(`handler error: ${String(err)}`))
    }
  })
  process.stdin.on('end', () => process.exit(0))
  log(`ready — API ${API_URL}`)
}

void main()
