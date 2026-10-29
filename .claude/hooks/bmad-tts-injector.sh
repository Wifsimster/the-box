#!/usr/bin/env bash

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$(dirname "$SCRIPT_DIR")"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

detect_bmad() {
  local bmad_core_dir=""

  if [[ -d ".bmad" ]]; then
    bmad_core_dir=".bmad"
  elif [[ -d "../.bmad" ]]; then
    bmad_core_dir="../.bmad"
  # Check for v6-alpha without dot (legacy naming)
  elif [[ -d "bmad" ]]; then
    bmad_core_dir="bmad"
  elif [[ -d "../bmad" ]]; then
    bmad_core_dir="../bmad"
  # Check for v4 (legacy)
  elif [[ -d ".bmad-core" ]]; then
    bmad_core_dir=".bmad-core"
  elif [[ -d "../.bmad-core" ]]; then
    bmad_core_dir="../.bmad-core"
  # Check for bmad-core (without dot prefix, legacy variant)
  elif [[ -d "bmad-core" ]]; then
    bmad_core_dir="bmad-core"
  elif [[ -d "../bmad-core" ]]; then
    bmad_core_dir="../bmad-core"
  else
    echo -e "${RED}❌ BMAD installation not found${NC}" >&2
    echo -e "${GRAY}   Looked for bmad/, .bmad-core/, or bmad-core/ directory${NC}" >&2
    return 1
  fi

  echo "$bmad_core_dir"
}

find_agents() {
  local bmad_core="$1"
  local agents_dir=""

  if [[ -d "$bmad_core/bmm/agents" ]]; then
    agents_dir="$bmad_core/bmm/agents"
  # Check for v4 structure (.bmad-core/agents/)
  elif [[ -d "$bmad_core/agents" ]]; then
    agents_dir="$bmad_core/agents"
  else
    echo -e "${RED}❌ Agents directory not found in $bmad_core${NC}" >&2
    echo -e "${GRAY}   Tried: $bmad_core/bmm/agents/ and $bmad_core/agents/${NC}" >&2
    return 1
  fi

  find "$agents_dir" -name "*.md" -type f
}

has_tts_injection() {
  local agent_file="$1"

  if grep -q "# AGENTVIBES-TTS-INJECTION" "$agent_file" 2>/dev/null; then
    return 0
  fi

  if grep -q "AGENTVIBES TTS INJECTION" "$agent_file" 2>/dev/null; then
    return 0
  fi

  if grep -q 'tts="agentvibes"' "$agent_file" 2>/dev/null; then
    return 0
  fi

  return 1
}

get_agent_id() {
  local agent_file="$1"

  local agent_id=$(grep -E "^  id:" "$agent_file" | head -1 | awk '{print $2}' | tr -d '"' | tr -d "'")

  if [[ -z "$agent_id" ]]; then
    agent_id=$(basename "$agent_file" .md)
  fi

  echo "$agent_id"
}

get_agent_voice() {
  local agent_id="$1"

  if [[ -f "$SCRIPT_DIR/bmad-voice-manager.sh" ]]; then
    local voice=$("$SCRIPT_DIR/bmad-voice-manager.sh" get-voice "$agent_id" 2>/dev/null || echo "")
    echo "$voice"
  fi
}

map_voice_to_provider() {
  local voice="$1"
  local provider="$2"

  if [[ "$provider" == "macos" ]]; then
    echo "$voice"
    return
  fi

  if [[ "$voice" == *"_"* ]]; then
    echo "$voice"
    return
  fi

  case "$voice" in
    "Jessica Anne Bogart"|"Aria")
      echo "en_US-lessac-medium"
      ;;
    "Matthew Schmitz"|"Archer"|"Michael")
      echo "en_US-danny-low"
      ;;
    "Burt Reynolds"|"Cowboy Bob")
      echo "en_US-joe-medium"
      ;;
    "Tiffany"|"Ms. Walker")
      echo "en_US-amy-medium"
      ;;
    "Ralf Eisend"|"Tom")
      echo "en_US-libritts-high"
      ;;
    *)
      echo "en_US-amy-medium"
      ;;
  esac
}

get_current_provider() {
  if [[ -f ".claude/tts-provider.txt" ]]; then
    cat ".claude/tts-provider.txt" 2>/dev/null || echo "piper"
  elif [[ -f "$HOME/.claude/tts-provider.txt" ]]; then
    cat "$HOME/.claude/tts-provider.txt" 2>/dev/null || echo "piper"
  else
    echo "piper"
  fi
}

inject_tts() {
  local agent_file="$1"
  local agent_id=$(get_agent_id "$agent_file")
  local configured_voice=$(get_agent_voice "$agent_id")
  local current_provider=$(get_current_provider)
  local agent_voice=$(map_voice_to_provider "$configured_voice" "$current_provider")

  if has_tts_injection "$agent_file"; then
    echo -e "${YELLOW}⚠️  TTS already injected in: $(basename "$agent_file")${NC}"
    return 0
  fi

  local backup_dir=".agentvibes/backups/agents"
  mkdir -p "$backup_dir"

  local timestamp=$(date +%Y%m%d_%H%M%S)
  local backup_name="$(basename "$agent_file" .md)_${timestamp}.md"
  cp "$agent_file" "$backup_dir/$backup_name"

  cp "$agent_file" "$agent_file.backup-pre-tts"

  echo -e "${GRAY}   📦 Backup saved: $backup_dir/$backup_name${NC}"

  local is_v6=false
  if grep -q "<activation" "$agent_file"; then
    is_v6=true
  elif ! grep -q "activation-instructions:" "$agent_file"; then
    echo -e "${RED}❌ No activation section found in: $(basename "$agent_file")${NC}"
    return 1
  fi

  if [[ "$is_v6" == "true" ]]; then
    local tts_step=""
    if [[ -n "$agent_voice" ]]; then
      tts_step="  <step n=\"4.5\" tts=\"agentvibes\">🎤 AGENTVIBES TTS INJECTION:
      - Create context: echo \"${agent_id}\" > .bmad-agent-context (Bash tool)
      - Speak greeting: bash .claude/hooks/play-tts.sh \"Hello! I'm ready to help you.\" \"${agent_voice}\" (Bash tool)
      - CRITICAL: Before EVERY response, scan for questions/prompts and speak them using Bash tool</step>"
    else
      tts_step="  <step n=\"4.5\" tts=\"agentvibes\">🎤 AGENTVIBES TTS INJECTION:
      - Create context: echo \"${agent_id}\" > .bmad-agent-context (Bash tool)
      - Speak greeting: bash .claude/hooks/play-tts.sh \"Hello! I'm ready to help you.\" (Bash tool)
      - CRITICAL: Before EVERY response, scan for questions/prompts and speak them using Bash tool</step>"
    fi

    awk -v tts="$tts_step" '
      !done && /<step n="4">/ {
        print
        print tts
        done=1
        next
      }
      { print }
    ' "$agent_file" > "$agent_file.tmp"

    local tmp_size=$(stat -c%s "$agent_file.tmp" 2>/dev/null || stat -f%z "$agent_file.tmp" 2>/dev/null || echo "0")
    if [[ "$tmp_size" -eq 0 ]]; then
      echo -e "${RED}❌ SAFETY: Refusing to overwrite - tmp file is empty: $(basename "$agent_file")${NC}" >&2
      rm -f "$agent_file.tmp"
      mv "$agent_file.backup-pre-tts" "$agent_file"
      return 1
    fi

    if ! diff -q "$agent_file.backup-pre-tts" "$agent_file.tmp" > /dev/null 2>&1; then
      :
    else
      rm "$agent_file.tmp"
      mv "$agent_file.backup-pre-tts" "$agent_file"
      echo -e "${RED}❌ Could not find step 4 in: $(basename "$agent_file")${NC}"
      return 1
    fi

  else
    local activation_injection=""
    if [[ -n "$agent_voice" ]]; then
      activation_injection="  - # AGENTVIBES-TTS-INJECTION: STEP 3.5 - Announce activation with TTS
  - STEP 3.5a: Use Bash tool to create context file: echo \"${agent_id}\" > .bmad-agent-context
  - STEP 3.5b: Use Bash tool to speak: bash .claude/hooks/play-tts.sh \"Agent ${agent_id} activated and ready\" \"${agent_voice}\"
  - AGENTVIBES-TTS-INJECTION: Before every response, scan for questions and speak them using Bash tool"
    else
      activation_injection="  - # AGENTVIBES-TTS-INJECTION: STEP 3.5 - Announce activation with TTS
  - STEP 3.5a: Use Bash tool to create context file: echo \"${agent_id}\" > .bmad-agent-context
  - STEP 3.5b: Use Bash tool to speak: bash .claude/hooks/play-tts.sh \"Agent ${agent_id} activated and ready\"
  - AGENTVIBES-TTS-INJECTION: Before every response, scan for questions and speak them using Bash tool"
    fi

    awk -v activation="$activation_injection" '
      /STEP 4:.*[Gg]reet/ {
        print
        print activation
        next
      }
      { print }
    ' "$agent_file" > "$agent_file.tmp"

    local original_size=$(stat -c%s "$agent_file" 2>/dev/null || stat -f%z "$agent_file" 2>/dev/null || echo "0")
    local tmp_size=$(stat -c%s "$agent_file.tmp" 2>/dev/null || stat -f%z "$agent_file.tmp" 2>/dev/null || echo "0")

    if [[ "$tmp_size" -eq 0 ]]; then
      echo -e "${RED}❌ SAFETY: Refusing to overwrite - tmp file is empty: $(basename "$agent_file")${NC}" >&2
      rm -f "$agent_file.tmp"
      mv "$agent_file.backup-pre-tts" "$agent_file"
      return 1
    fi

    local min_size=$((original_size * 80 / 100))

    if [[ "$tmp_size" -lt "$min_size" ]]; then
      echo -e "${RED}❌ SAFETY: Refusing to overwrite - file would shrink too much (orig: ${original_size}B, tmp: ${tmp_size}B): $(basename "$agent_file")${NC}" >&2
      rm -f "$agent_file.tmp"
      mv "$agent_file.backup-pre-tts" "$agent_file"
      return 1
    fi
  fi

  mv "$agent_file.tmp" "$agent_file"

  if [[ "$configured_voice" != "$agent_voice" ]] && [[ -n "$configured_voice" ]]; then
    echo -e "${GREEN}✅ Injected TTS into: $(basename "$agent_file") → Voice: ${agent_voice:-default} (${current_provider}: mapped from ${configured_voice})${NC}"
  else
    echo -e "${GREEN}✅ Injected TTS into: $(basename "$agent_file") → Voice: ${agent_voice:-default} (${current_provider})${NC}"
  fi
}

remove_tts() {
  local agent_file="$1"

  if ! has_tts_injection "$agent_file"; then
    echo -e "${GRAY}   No TTS in: $(basename "$agent_file")${NC}"
    return 0
  fi

  cp "$agent_file" "$agent_file.backup-tts-removal"

  sed -i.bak '/# AGENTVIBES-TTS-INJECTION/,+1d' "$agent_file"
  rm -f "$agent_file.bak"

  echo -e "${GREEN}✅ Removed TTS from: $(basename "$agent_file")${NC}"
}

show_status() {
  local bmad_core=$(detect_bmad)
  if [[ -z "$bmad_core" ]]; then
    return 1
  fi

  echo -e "${CYAN}📊 BMAD TTS Injection Status:${NC}"
  echo ""

  local agents=$(find_agents "$bmad_core")
  local enabled_count=0
  local disabled_count=0

  while IFS= read -r agent_file; do
    local agent_id=$(get_agent_id "$agent_file")
    local agent_name=$(basename "$agent_file" .md)

    if has_tts_injection "$agent_file"; then
      local voice=$(get_agent_voice "$agent_id")
      echo -e "   ${GREEN}✅${NC} $agent_name (${agent_id}) → Voice: ${voice:-default}"
      enabled_count=$((enabled_count + 1))
    else
      echo -e "   ${GRAY}❌ $agent_name (${agent_id})${NC}"
      disabled_count=$((disabled_count + 1))
    fi
  done <<< "$agents"

  echo ""
  echo -e "${CYAN}Summary:${NC} $enabled_count enabled, $disabled_count disabled"
}

enable_all() {
  local bmad_core=$(detect_bmad)
  if [[ -z "$bmad_core" ]]; then
    return 1
  fi

  echo -e "${CYAN}🎤 Enabling TTS for all BMAD agents...${NC}"
  echo ""

  local agents=$(find_agents "$bmad_core")
  local success_count=0
  local skip_count=0
  local fail_count=0

  local modified_files=()
  local backup_files=()

  while IFS= read -r agent_file; do
    if has_tts_injection "$agent_file"; then
      skip_count=$((skip_count + 1))
      continue
    fi

    if inject_tts "$agent_file"; then
      success_count=$((success_count + 1))
      modified_files+=("$agent_file")
      local timestamp=$(date +%Y%m%d_%H%M%S)
      local backup_name="$(basename "$agent_file" .md)_${timestamp}.md"
      backup_files+=(".agentvibes/backups/agents/$backup_name")
    else
      fail_count=$((fail_count + 1))
    fi
  done <<< "$agents"

  echo ""
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${CYAN}                    TTS INJECTION SUMMARY                       ${NC}"
  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""

  echo -e "${GREEN}✅ Successfully modified: $success_count agents${NC}"
  [[ $skip_count -gt 0 ]] && echo -e "${YELLOW}⏭️  Skipped (already enabled): $skip_count agents${NC}"
  [[ $fail_count -gt 0 ]] && echo -e "${RED}❌ Failed: $fail_count agents${NC}"
  echo ""

  if [[ ${#modified_files[@]} -gt 0 ]]; then
    echo -e "${CYAN}📝 Modified Files:${NC}"
    for file in "${modified_files[@]}"; do
      echo -e "   • $file"
    done
    echo ""
  fi

  if [[ ${#modified_files[@]} -gt 0 ]]; then
    echo -e "${CYAN}📦 Backups saved to:${NC}"
    echo -e "   .agentvibes/backups/agents/"
    echo ""
    echo -e "${CYAN}🔄 To restore original files, run:${NC}"
    echo -e "   ${GREEN}.claude/hooks/bmad-tts-injector.sh restore${NC}"
    echo ""
  fi

  echo -e "${CYAN}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
  echo -e "${CYAN}💡 BMAD agents will now speak when activated!${NC}"
}

disable_all() {
  local bmad_core=$(detect_bmad)
  if [[ -z "$bmad_core" ]]; then
    return 1
  fi

  echo -e "${CYAN}🔇 Disabling TTS for all BMAD agents...${NC}"
  echo ""

  local agents=$(find_agents "$bmad_core")
  local success_count=0

  while IFS= read -r agent_file; do
    if remove_tts "$agent_file"; then
      success_count=$((success_count + 1))
    fi
  done <<< "$agents"

  echo ""
  echo -e "${GREEN}✅ TTS disabled for $success_count agents${NC}"
}

restore_backup() {
  local bmad_core=$(detect_bmad)
  if [[ -z "$bmad_core" ]]; then
    return 1
  fi

  echo -e "${CYAN}🔄 Restoring agents from backup...${NC}"
  echo ""

  local agents_dir=""
  if [[ -d "$bmad_core/bmm/agents" ]]; then
    agents_dir="$bmad_core/bmm/agents"
  elif [[ -d "$bmad_core/agents" ]]; then
    agents_dir="$bmad_core/agents"
  else
    echo -e "${RED}❌ Agents directory not found${NC}"
    return 1
  fi

  local backup_count=0

  for backup_file in "$agents_dir"/*.backup-pre-tts; do
    if [[ -f "$backup_file" ]]; then
      local original_file="${backup_file%.backup-pre-tts}"
      cp "$backup_file" "$original_file"
      echo -e "${GREEN}✅ Restored: $(basename "$original_file")${NC}"
      backup_count=$((backup_count + 1))
    fi
  done

  if [[ $backup_count -eq 0 ]]; then
    echo -e "${YELLOW}⚠️  No backups found${NC}"
  else
    echo ""
    echo -e "${GREEN}✅ Restored $backup_count agents from backup${NC}"
  fi
}

case "${1:-help}" in
  enable)
    enable_all
    ;;
  disable)
    disable_all
    ;;
  status)
    show_status
    ;;
  restore)
    restore_backup
    ;;
  help|*)
    echo -e "${CYAN}AgentVibes BMAD TTS Injection Manager${NC}"
    echo ""
    echo "Usage: bmad-tts-injector.sh {enable|disable|status|restore}"
    echo ""
    echo "Commands:"
    echo "  enable     Inject TTS hooks into all BMAD agents"
    echo "  disable    Remove TTS hooks from all BMAD agents"
    echo "  status     Show TTS injection status for all agents"
    echo "  restore    Restore agents from backup (undo changes)"
    echo ""
    echo "What it does:"
    echo "  • Automatically patches BMAD agent activation instructions"
    echo "  • Adds TTS calls when agents greet users"
    echo "  • Uses voice mapping from AgentVibes BMAD plugin"
    echo "  • Creates backups before modifying files"
    ;;
esac
