#!/usr/bin/env bash

CONFIG_DIR=".agentvibes/bmad"
VOICE_CONFIG_FILE="$CONFIG_DIR/bmad-voices.md"
ENABLED_FLAG="$CONFIG_DIR/bmad-voices-enabled.flag"

detect_bmad_version() {
    if [[ -f ".bmad/_cfg/manifest.yaml" ]]; then
        echo "6"
        return 0
    elif [[ -f "bmad/_cfg/manifest.yaml" ]]; then
        echo "6"
        return 0
    elif [[ -f ".bmad-core/install-manifest.yaml" ]]; then
        echo "4"
        return 0
    else
        echo "0"
        return 1
    fi
}

get_bmad_config_path() {
    local version=$(detect_bmad_version)

    if [[ "$version" == "6" ]]; then
        if [[ -f ".bmad/core/config.yaml" ]]; then
            echo ".bmad/core/config.yaml"
        else
            echo "bmad/core/config.yaml"
        fi
        return 0
    elif [[ "$version" == "4" ]]; then
        echo ".bmad-core/config.yaml"
        return 0
    else
        echo ""
        return 1
    fi
}

auto_enable_if_bmad_detected() {
    local version=$(detect_bmad_version)

    if [[ "$version" != "0" ]] && [[ ! -f "$ENABLED_FLAG" ]]; then
        mkdir -p "$CONFIG_DIR"
        touch "$ENABLED_FLAG"
        return 0
    fi
    return 1
}

get_agent_voice() {
    local agent_id="$1"

    local bmad_voice_map=""
    if [[ -f ".bmad/_cfg/agent-voice-map.csv" ]]; then
        bmad_voice_map=".bmad/_cfg/agent-voice-map.csv"
    elif [[ -f "bmad/_cfg/agent-voice-map.csv" ]]; then
        bmad_voice_map="bmad/_cfg/agent-voice-map.csv"
    fi

    if [[ -n "$bmad_voice_map" ]]; then
        local voice=$(grep "^$agent_id," "$bmad_voice_map" | cut -d',' -f2)

        if [[ -n "$voice" ]] && [[ "$voice" != "en_US-lessac-medium" ]]; then
            echo "$voice"
            return
        fi
    fi

    case "$agent_id" in
        bmad-master)
            echo "en_US-lessac-medium"
            return
            ;;
        analyst)
            echo "en_US-kristin-medium"
            return
            ;;
        architect)
            echo "en_GB-alan-medium"
            return
            ;;
        dev)
            echo "en_US-joe-medium"
            return
            ;;
        pm)
            echo "en_US-ryan-high"
            return
            ;;
        quick-flow-solo-dev)
            echo "en_US-joe-medium"
            return
            ;;
        sm)
            echo "en_US-amy-medium"
            return
            ;;
        tea)
            echo "en_US-kusal-medium"
            return
            ;;
        tech-writer)
            echo "en_US-kristin-medium"
            return
            ;;
        ux-designer)
            echo "en_US-kristin-medium"
            return
            ;;
        frame-expert)
            echo "en_GB-alan-medium"
            return
            ;;
    esac

    auto_enable_if_bmad_detected

    if [[ ! -f "$ENABLED_FLAG" ]]; then
        echo ""
        return
    fi

    if [[ ! -f "$VOICE_CONFIG_FILE" ]]; then
        echo ""
        return
    fi

    local provider_file=""
    if [[ -f ".claude/tts-provider.txt" ]]; then
        provider_file=".claude/tts-provider.txt"
    elif [[ -f "$HOME/.claude/tts-provider.txt" ]]; then
        provider_file="$HOME/.claude/tts-provider.txt"
    fi

    local active_provider="piper"
    if [[ -n "$provider_file" ]] && [[ -f "$provider_file" ]]; then
        active_provider=$(cat "$provider_file")
    fi

    local column=5
    if [[ "$active_provider" == "piper" ]]; then
        column=6
    fi

    local voice=$(grep "^| $agent_id " "$VOICE_CONFIG_FILE" | \
                  awk -F'|' "{print \$$column}" | \
                  sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    echo "$voice"
}

sync_intros_from_manifest() {
    local bmad_voice_map=""
    local manifest_file=""

    if [[ -f ".bmad/_cfg/agent-voice-map.csv" ]]; then
        bmad_voice_map=".bmad/_cfg/agent-voice-map.csv"
    elif [[ -f "bmad/_cfg/agent-voice-map.csv" ]]; then
        bmad_voice_map="bmad/_cfg/agent-voice-map.csv"
    fi

    if [[ -f ".bmad/_cfg/agent-manifest.csv" ]]; then
        manifest_file=".bmad/_cfg/agent-manifest.csv"
    elif [[ -f "bmad/_cfg/agent-manifest.csv" ]]; then
        manifest_file="bmad/_cfg/agent-manifest.csv"
    fi

    if [[ -z "$bmad_voice_map" ]] || [[ -z "$manifest_file" ]]; then
        return 1
    fi

    local timestamp_file="${bmad_voice_map%/*}/.bmad-csv-sync-timestamp"
    local manifest_mtime=$(stat -c '%Y' "$manifest_file" 2>/dev/null || stat -f '%m' "$manifest_file" 2>/dev/null)

    if [[ -f "$timestamp_file" ]]; then
        local last_sync=$(cat "$timestamp_file" 2>/dev/null || echo "0")
        if [[ "$manifest_mtime" -le "$last_sync" ]]; then
            return 0
        fi
    fi

    if [[ ! -f "${bmad_voice_map}.backup" ]]; then
        cp "$bmad_voice_map" "${bmad_voice_map}.backup"
    fi

    local temp_file="${bmad_voice_map}.tmp"
    local generic_intro="Hello! Ready to help with the discussion."

    head -n 1 "$bmad_voice_map" > "$temp_file"

    tail -n +2 "$bmad_voice_map" | while IFS=, read -r agent voice intro; do
        intro=$(echo "$intro" | sed 's/^"//;s/"$//')

        if [[ "$intro" == "$generic_intro" ]]; then
            local manifest_data=$(grep "^\"*${agent}\"*," "$manifest_file" | awk -F'","' '{
                gsub(/^"/, "", $2);
                gsub(/"$/, "", $3);
                print $2 "|" $3
            }')

            local display_name=$(echo "$manifest_data" | cut -d'|' -f1)
            local title=$(echo "$manifest_data" | cut -d'|' -f2)

            if [[ -n "$display_name" ]] && [[ -n "$title" ]]; then
                intro="Hi! I'm ${display_name}, your ${title}."
            elif [[ -n "$display_name" ]]; then
                intro="${display_name} here"
            fi
        fi

        echo "${agent},${voice},\"${intro}\""
    done >> "$temp_file"

    mv "$temp_file" "$bmad_voice_map"

    echo "$manifest_mtime" > "$timestamp_file"

    return 0
}

get_agent_intro() {
    local agent_id="$1"

    local bmad_voice_map=""
    if [[ -f ".bmad/_cfg/agent-voice-map.csv" ]]; then
        bmad_voice_map=".bmad/_cfg/agent-voice-map.csv"
    elif [[ -f "bmad/_cfg/agent-voice-map.csv" ]]; then
        bmad_voice_map="bmad/_cfg/agent-voice-map.csv"
    fi

    if [[ -n "$bmad_voice_map" ]]; then
        sync_intros_from_manifest
    fi

    if [[ -n "$bmad_voice_map" ]]; then
        local intro=$(grep "^$agent_id," "$bmad_voice_map" | awk -F',' '{
            # Extract field 3 onwards (intro may span multiple comma-separated parts)
            intro = $3;
            for (i = 4; i <= NF; i++) {
                intro = intro "," $i;
            }
            gsub(/^"/, "", intro);
            gsub(/"$/, "", intro);
            print intro;
        }')

        if [[ -z "$intro" ]] || [[ "$intro" == "Hello! Ready to help with the discussion." ]]; then
            local manifest_file=""
            if [[ -f ".bmad/_cfg/agent-manifest.csv" ]]; then
                manifest_file=".bmad/_cfg/agent-manifest.csv"
            elif [[ -f "bmad/_cfg/agent-manifest.csv" ]]; then
                manifest_file="bmad/_cfg/agent-manifest.csv"
            fi

            if [[ -n "$manifest_file" ]]; then
                local display_name=$(grep "^\"*${agent_id}\"*," "$manifest_file" | cut -d',' -f2 | sed 's/^"//;s/"$//')
                if [[ -n "$display_name" ]]; then
                    intro="$display_name here"
                fi
            fi
        fi

        if [[ -n "$intro" ]]; then
            echo "$intro"
            return
        fi
    fi

    case "$agent_id" in
        bmad-master)
            echo "BMad Master here"
            return
            ;;
        analyst)
            echo "Mary here"
            return
            ;;
        architect)
            echo "Winston here"
            return
            ;;
        dev)
            echo "Amelia here"
            return
            ;;
        pm)
            echo "John here"
            return
            ;;
        quick-flow-solo-dev)
            echo "Barry here"
            return
            ;;
        sm)
            echo "Bob here"
            return
            ;;
        tea)
            echo "Murat here"
            return
            ;;
        tech-writer)
            echo "Paige here"
            return
            ;;
        ux-designer)
            echo "Sally here"
            return
            ;;
        frame-expert)
            echo "Frame Expert here"
            return
            ;;
    esac

    if [[ ! -f "$VOICE_CONFIG_FILE" ]]; then
        echo ""
        return
    fi

    local intro=$(grep "^| $agent_id " "$VOICE_CONFIG_FILE" | \
                  awk -F'|' '{print $4}' | \
                  sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    echo "$intro"
}

get_agent_personality() {
    local agent_id="$1"

    if [[ ! -f "$VOICE_CONFIG_FILE" ]]; then
        echo ""
        return
    fi

    local personality=$(grep "^| $agent_id " "$VOICE_CONFIG_FILE" | \
                       awk -F'|' '{print $7}' | \
                       sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

    echo "$personality"
}

is_plugin_enabled() {
    [[ -f "$ENABLED_FLAG" ]] && echo "true" || echo "false"
}

enable_plugin() {
    mkdir -p "$CONFIG_DIR"

    BACKUP_FILE="$CONFIG_DIR/.bmad-previous-settings"

    if [[ -f ".claude/tts-voice.txt" ]]; then
        CURRENT_VOICE=$(cat .claude/tts-voice.txt 2>/dev/null)
    elif [[ -f "$HOME/.claude/tts-voice.txt" ]]; then
        CURRENT_VOICE=$(cat "$HOME/.claude/tts-voice.txt" 2>/dev/null)
    else
        CURRENT_VOICE="Aria"
    fi

    if [[ -f ".claude/tts-personality.txt" ]]; then
        CURRENT_PERSONALITY=$(cat .claude/tts-personality.txt 2>/dev/null)
    elif [[ -f "$HOME/.claude/tts-personality.txt" ]]; then
        CURRENT_PERSONALITY=$(cat "$HOME/.claude/tts-personality.txt" 2>/dev/null)
    else
        CURRENT_PERSONALITY="normal"
    fi

    if [[ -f ".claude/tts-sentiment.txt" ]]; then
        CURRENT_SENTIMENT=$(cat .claude/tts-sentiment.txt 2>/dev/null)
    elif [[ -f "$HOME/.claude/tts-sentiment.txt" ]]; then
        CURRENT_SENTIMENT=$(cat "$HOME/.claude/tts-sentiment.txt" 2>/dev/null)
    else
        CURRENT_SENTIMENT=""
    fi

    cat > "$BACKUP_FILE" <<EOF
VOICE=$CURRENT_VOICE
PERSONALITY=$CURRENT_PERSONALITY
SENTIMENT=$CURRENT_SENTIMENT
EOF

    touch "$ENABLED_FLAG"

    ACTIVATION_FILE=".claude/activation-instructions"
    if [[ ! -f "$ACTIVATION_FILE" ]]; then
        cat > "$ACTIVATION_FILE" <<'ACTIVATION_EOF'
# BMAD Agent Activation Instructions

When a BMAD agent activates, follow these steps EXACTLY:

## STEP 3.5a: Create BMAD Context File (CRITICAL)

**IMMEDIATELY after agent identification, create the context file:**

```bash
echo "$AGENT_ID" > .bmad-agent-context
```

Where `$AGENT_ID` is one of:
- `pm` (Product Manager)
- `dev` (Developer)
- `qa` (QA)
- `architect` (Architect)
- `po` (Product Owner)
- `analyst` (Analyst)
- `sm` (Scrum Master)
- `ux-expert` (UX Expert)
- `bmad-master` (BMAD Master)
- `bmad-orchestrator` (Orchestrator)

**Example:**
```bash
# For Product Manager agent
echo "pm" > .bmad-agent-context
```

This file allows AgentVibes to:
1. Detect which BMAD agent is active
2. Look up the correct voice mapping
3. Automatically speak questions using the agent's assigned voice

## STEP 10: Clean Up on Exit

**Before exiting the agent, remove the context file:**

```bash
rm -f .bmad-agent-context
```

This ensures voice switching only happens when an agent is active.

## Why This Matters

Without the `.bmad-agent-context` file:
- AgentVibes cannot detect which agent is active
- Questions won't be spoken automatically
- Voice switching won't work
- The BMAD voice plugin becomes non-functional

**This is MANDATORY for BMAD voice integration to work!**
ACTIVATION_EOF
        echo "📝 Created activation instructions: $ACTIVATION_FILE"
    fi

    echo "✅ BMAD voice plugin enabled"
    echo "💾 Previous settings backed up:"
    echo "   Voice: $CURRENT_VOICE"
    echo "   Personality: $CURRENT_PERSONALITY"
    [[ -n "$CURRENT_SENTIMENT" ]] && echo "   Sentiment: $CURRENT_SENTIMENT"
    echo ""
    list_mappings

    echo ""
    echo "🎤 Automatically enabling TTS for BMAD agents..."
    echo ""

    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    if [[ -f "$SCRIPT_DIR/bmad-tts-injector.sh" ]]; then
        "$SCRIPT_DIR/bmad-tts-injector.sh" enable
    else
        echo "⚠️  TTS injector not found at: $SCRIPT_DIR/bmad-tts-injector.sh"
        echo "   You can manually enable TTS with: /agent-vibes:bmad-tts enable"
    fi
}

disable_plugin() {
    BACKUP_FILE="$CONFIG_DIR/.bmad-previous-settings"

    if [[ -f "$BACKUP_FILE" ]]; then
        source "$BACKUP_FILE"

        echo "❌ BMAD voice plugin disabled"
        echo "🔄 Restoring previous settings:"
        echo "   Voice: $VOICE"
        echo "   Personality: $PERSONALITY"
        [[ -n "$SENTIMENT" ]] && echo "   Sentiment: $SENTIMENT"

        if [[ -n "$VOICE" ]]; then
            echo "$VOICE" > .claude/tts-voice.txt 2>/dev/null || echo "$VOICE" > "$HOME/.claude/tts-voice.txt"
        fi

        if [[ -n "$PERSONALITY" ]] && [[ "$PERSONALITY" != "normal" ]]; then
            echo "$PERSONALITY" > .claude/tts-personality.txt 2>/dev/null || echo "$PERSONALITY" > "$HOME/.claude/tts-personality.txt"
        fi

        if [[ -n "$SENTIMENT" ]]; then
            echo "$SENTIMENT" > .claude/tts-sentiment.txt 2>/dev/null || echo "$SENTIMENT" > "$HOME/.claude/tts-sentiment.txt"
        fi

        rm -f "$BACKUP_FILE"
    else
        echo "❌ BMAD voice plugin disabled"
        echo "⚠️  No previous settings found to restore"
        echo "AgentVibes will use current voice/personality settings"
    fi

    rm -f "$ENABLED_FLAG"

    echo ""
    echo "🔇 Automatically disabling TTS for BMAD agents..."
    echo ""

    SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

    if [[ -f "$SCRIPT_DIR/bmad-tts-injector.sh" ]]; then
        "$SCRIPT_DIR/bmad-tts-injector.sh" disable
    else
        echo "⚠️  TTS injector not found"
        echo "   You can manually disable TTS with: /agent-vibes:bmad-tts disable"
    fi
}

list_mappings() {
    if [[ ! -f "$VOICE_CONFIG_FILE" ]]; then
        echo "❌ Plugin file not found: $VOICE_CONFIG_FILE"
        return 1
    fi

    local provider_file=""
    if [[ -f ".claude/tts-provider.txt" ]]; then
        provider_file=".claude/tts-provider.txt"
    elif [[ -f "$HOME/.claude/tts-provider.txt" ]]; then
        provider_file="$HOME/.claude/tts-provider.txt"
    fi

    local active_provider="piper"
    if [[ -n "$provider_file" ]] && [[ -f "$provider_file" ]]; then
        active_provider=$(cat "$provider_file")
    fi

    echo "📊 BMAD Agent Voice Mappings (Provider: $active_provider):"
    echo ""

    local voice_column=5
    if [[ "$active_provider" == "piper" ]]; then
        voice_column=6
    fi

    grep "^| " "$VOICE_CONFIG_FILE" | grep -v "Agent ID" | grep -v "^|---" | \
    while IFS='|' read -r line; do
        agent_id=$(echo "$line" | awk -F'|' '{print $2}' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        name=$(echo "$line" | awk -F'|' '{print $3}' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        voice=$(echo "$line" | awk -F'|' "{print \$$voice_column}" | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')
        personality=$(echo "$line" | awk -F'|' '{print $7}' | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')

        [[ -n "$agent_id" ]] && echo "   $agent_id → $voice [$personality]"
    done
}

set_agent_voice() {
    local agent_id="$1"
    local voice="$2"
    local personality="${3:-normal}"

    if [[ ! -f "$VOICE_CONFIG_FILE" ]]; then
        echo "❌ Plugin file not found: $VOICE_CONFIG_FILE"
        return 1
    fi

    if ! grep -q "^| $agent_id " "$VOICE_CONFIG_FILE"; then
        echo "❌ Agent '$agent_id' not found in plugin"
        return 1
    fi

    sed -i.bak "s/^| $agent_id |.*| .* | .* |$/| $agent_id | $(grep "^| $agent_id " "$VOICE_CONFIG_FILE" | awk -F'|' '{print $3}') | $voice | $personality |/" "$VOICE_CONFIG_FILE"

    echo "✅ Updated $agent_id → $voice [$personality]"
}

show_status() {
    local bmad_installed="false"
    if [[ -f ".bmad-core/install-manifest.yaml" ]]; then
        bmad_installed="true"
    fi

    if [[ $(is_plugin_enabled) == "true" ]]; then
        echo "✅ BMAD voice plugin: ENABLED"
        if [[ "$bmad_installed" == "true" ]]; then
            echo "🔍 BMAD detected: Auto-enabled"
        fi
    else
        echo "❌ BMAD voice plugin: DISABLED"
        if [[ "$bmad_installed" == "true" ]]; then
            echo "⚠️  BMAD detected but plugin disabled (enable with: /agent-vibes-bmad enable)"
        fi
    fi
    echo ""
    list_mappings
}

edit_plugin() {
    if [[ ! -f "$VOICE_CONFIG_FILE" ]]; then
        echo "❌ Plugin file not found: $VOICE_CONFIG_FILE"
        return 1
    fi

    echo "Opening $VOICE_CONFIG_FILE for editing..."
    echo "Edit the markdown table to change voice mappings"
}

case "${1:-help}" in
    enable)
        enable_plugin
        ;;
    disable)
        disable_plugin
        ;;
    status)
        show_status
        ;;
    list)
        list_mappings
        ;;
    set)
        if [[ -z "$2" ]] || [[ -z "$3" ]]; then
            echo "Usage: bmad-voice-manager.sh set <agent-id> <voice> [personality]"
            exit 1
        fi
        set_agent_voice "$2" "$3" "$4"
        ;;
    get-voice)
        get_agent_voice "$2"
        ;;
    get-intro)
        get_agent_intro "$2"
        ;;
    get-personality)
        get_agent_personality "$2"
        ;;
    edit)
        edit_plugin
        ;;
    *)
        echo "Usage: bmad-voice-manager.sh {enable|disable|status|list|set|get-voice|get-intro|get-personality|edit}"
        echo ""
        echo "Commands:"
        echo "  enable              Enable BMAD voice plugin"
        echo "  disable             Disable BMAD voice plugin"
        echo "  status              Show plugin status and mappings"
        echo "  list                List all agent voice mappings"
        echo "  set <id> <voice>    Set voice for agent"
        echo "  get-voice <id>      Get voice for agent"
        echo "  get-intro <id>      Get intro text for agent"
        echo "  get-personality <id> Get personality for agent"
        echo "  edit                Edit plugin configuration"
        exit 1
        ;;
esac
