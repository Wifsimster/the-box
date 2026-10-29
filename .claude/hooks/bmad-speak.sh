#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

AGENT_NAME_OR_ID="$1"
DIALOGUE="$2"

DIALOGUE="${DIALOGUE//\\!/!}"
DIALOGUE="${DIALOGUE//\\\$/\$}"

if [[ -f "$PROJECT_ROOT/.agentvibes/bmad/bmad-party-mode-disabled.flag" ]]; then
  exit 0
fi

if [[ ! -f "$PROJECT_ROOT/.bmad/_cfg/agent-manifest.csv" ]]; then
  exit 0
fi

map_to_agent_id() {
  local name_or_id="$1"

  if [[ "$name_or_id" =~ \.bmad/.*/agents/([^/]+)\.md$ ]]; then
    echo "${BASH_REMATCH[1]}"
    return
  fi

  local direct_match=$(grep -i "^\"*${name_or_id}\"*," "$PROJECT_ROOT/.bmad/_cfg/agent-manifest.csv" | head -1)
  if [[ -n "$direct_match" ]]; then
    echo "$name_or_id"
    return
  fi

  local agent_id=$(awk -F',' -v name="$name_or_id" '
    BEGIN { IGNORECASE=1 }
    NR > 1 {
      # Extract displayName (column 2)
      display = $2
      gsub(/^"|"$/, "", display)  # Remove surrounding quotes

      # Check if display name starts with the search name (case-insensitive)
      # This handles both "John" and "John (Product Manager)"
      if (tolower(display) ~ "^" tolower(name) "($| |\\()") {
        # Extract agent ID (column 1)
        agent = $1
        gsub(/^"|"$/, "", agent)
        print agent
        exit
      }
    }
  ' "$PROJECT_ROOT/.bmad/_cfg/agent-manifest.csv")

  echo "$agent_id"
}

AGENT_ID=$(map_to_agent_id "$AGENT_NAME_OR_ID")

AGENT_VOICE=""
AGENT_INTRO=""
if [[ -n "$AGENT_ID" ]] && [[ -f "$SCRIPT_DIR/bmad-voice-manager.sh" ]]; then
  AGENT_VOICE=$(cd "$PROJECT_ROOT" && "$SCRIPT_DIR/bmad-voice-manager.sh" get-voice "$AGENT_ID" 2>/dev/null)
  AGENT_INTRO=$(cd "$PROJECT_ROOT" && "$SCRIPT_DIR/bmad-voice-manager.sh" get-intro "$AGENT_ID" 2>/dev/null)
fi

FULL_TEXT="$DIALOGUE"
if [[ -n "$AGENT_INTRO" ]]; then
  FULL_TEXT="${AGENT_INTRO}. ${DIALOGUE}"
fi

if [[ -n "$AGENT_VOICE" ]]; then
  bash "$SCRIPT_DIR/tts-queue.sh" add "$FULL_TEXT" "$AGENT_VOICE" "$AGENT_NAME_OR_ID" &
else
  bash "$SCRIPT_DIR/tts-queue.sh" add "$FULL_TEXT" "" "$AGENT_NAME_OR_ID" &
fi
