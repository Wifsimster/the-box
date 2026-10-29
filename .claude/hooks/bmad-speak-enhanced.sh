#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

AGENT_NAME_OR_ID="${1:-}"
DIALOGUE="${2:-}"

if [[ -z "$AGENT_NAME_OR_ID" ]] || [[ -z "$DIALOGUE" ]]; then
    echo "Usage: $0 \"Agent Name\" \"dialogue text\"" >&2
    exit 1
fi

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
            display = $2
            gsub(/^"|"$/, "", display)
            if (tolower(display) ~ "^" tolower(name) "($| |\\()") {
                agent = $1
                gsub(/^"|"$/, "", agent)
                print agent
                exit
            }
        }
    ' "$PROJECT_ROOT/.bmad/_cfg/agent-manifest.csv")

    echo "$agent_id"
}

get_display_name() {
    local agent_id="$1"

    local display_name=$(awk -F',' -v id="$agent_id" '
        BEGIN { IGNORECASE=1 }
        NR > 1 {
            aid = $1
            gsub(/^"|"$/, "", aid)
            if (tolower(aid) == tolower(id)) {
                display = $2
                gsub(/^"|"$/, "", display)
                print display
                exit
            }
        }
    ' "$PROJECT_ROOT/.bmad/_cfg/agent-manifest.csv")

    echo "$display_name"
}

AGENT_ID=$(map_to_agent_id "$AGENT_NAME_OR_ID")
DISPLAY_NAME=$(get_display_name "$AGENT_ID")

AGENT_FOR_EFFECTS="${DISPLAY_NAME:-$AGENT_NAME_OR_ID}"

AGENT_VOICE=""
AGENT_INTRO=""
if [[ -n "$AGENT_ID" ]] && [[ -f "$SCRIPT_DIR/bmad-voice-manager.sh" ]]; then
    AGENT_VOICE=$(cd "$PROJECT_ROOT" && "$SCRIPT_DIR/bmad-voice-manager.sh" get-voice "$AGENT_ID" 2>/dev/null || echo "")
    AGENT_INTRO=$(cd "$PROJECT_ROOT" && "$SCRIPT_DIR/bmad-voice-manager.sh" get-intro "$AGENT_ID" 2>/dev/null || echo "")
fi

FULL_TEXT="$DIALOGUE"
if [[ -n "$AGENT_INTRO" ]]; then
    FULL_TEXT="${AGENT_INTRO}. ${DIALOGUE}"
fi

export AGENTVIBES_CURRENT_AGENT="$AGENT_FOR_EFFECTS"

AUDIO_DIR="$PROJECT_ROOT/.claude/audio"
mkdir -p "$AUDIO_DIR"
TEMP_FILE="$AUDIO_DIR/tts-enhanced-$(date +%s)-$$.wav"

if [[ -n "$AGENT_VOICE" ]]; then
    echo "🎤 Agent: $AGENT_FOR_EFFECTS | Voice: $AGENT_VOICE"
    "$SCRIPT_DIR/play-tts-piper.sh" "$FULL_TEXT" "$AGENT_VOICE" > /dev/null 2>&1 &
    PIPER_PID=$!

    wait $PIPER_PID 2>/dev/null || true

    GENERATED_FILE=$(ls -t "$AUDIO_DIR"/tts-padded-*.wav 2>/dev/null | head -1)

    if [[ -n "$GENERATED_FILE" ]] && [[ -f "$GENERATED_FILE" ]]; then
        if [[ -f "$SCRIPT_DIR/audio-processor.sh" ]]; then
            PROCESSED_FILE="$AUDIO_DIR/tts-enhanced-processed-$(date +%s)-$$.wav"
            "$SCRIPT_DIR/audio-processor.sh" "$GENERATED_FILE" "$AGENT_FOR_EFFECTS" "$PROCESSED_FILE" 2>/dev/null || {
                PROCESSED_FILE="$GENERATED_FILE"
            }

            if [[ -f "$PROCESSED_FILE" ]]; then
                (mpv "$PROCESSED_FILE" || aplay "$PROCESSED_FILE" || paplay "$PROCESSED_FILE") >/dev/null 2>&1 &
            fi
        fi
    fi
else
    bash "$SCRIPT_DIR/tts-queue.sh" add "$FULL_TEXT" &
fi
