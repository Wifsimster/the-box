#!/usr/bin/env node

import { readFileSync } from 'node:fs'
import { handleRpc, SERVER_INFO, type ApiRequest, type JsonRpcMessage } from './server.js'

const API_URL = (process.env['THE_BOX_API_URL'] ?? 'http://localhost:3000').replace(/\/+$/, '')
const AGENT_KEY = process.env['THE_BOX_AGENT_KEY'] ?? ''

const SERVER_VERSION = ((): string => {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
    ) as { version?: string }
    return pkg.version ?? SERVER_INFO.version
  } catch {
    return SERVER_INFO.version
  }
})()
const serverInfo = { name: SERVER_INFO.name, version: SERVER_VERSION }

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
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim()
      buffer = buffer.slice(nl + 1)
      if (!line) continue
      let msg: JsonRpcMessage
      try {
        msg = JSON.parse(line) as JsonRpcMessage
      } catch {
        log(`skipping unparseable line (${line.length} chars)`)
        continue
      }
      void handleRpc(msg, { callApi, serverInfo })
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
