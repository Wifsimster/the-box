#!/usr/bin/env bash
# Bridge one MCP tool call through the geo-agent stdio server and print the
# tool's text result. Reads the key from THE_BOX_AGENT_KEY (never stored here).
#   usage: THE_BOX_AGENT_KEY=... ./mcp-call.sh <tool_name> '<json-args>'
set -euo pipefail
TOOL="${1:?tool name required}"
ARGS='{}'
[ $# -ge 2 ] && ARGS="$2"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
export THE_BOX_API_URL="${THE_BOX_API_URL:-https://the-box.battistella.ovh}"

{
  printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"claude-code-session","version":"1"}}}'
  printf '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"%s","arguments":%s}}\n' "$TOOL" "$ARGS"
  sleep 3   # keep stdin open so the async fetch resolves before EOF-exit
} | node "$DIR/dist/index.js" 2>/dev/null \
  | jq -r 'select(.id==2) | if .result.isError then "TOOL ERROR: \(.result.content[0].text)" else .result.content[0].text end'
