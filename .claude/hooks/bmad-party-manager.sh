#!/usr/bin/env bash

export LC_ALL=C

PLUGIN_DIR=".claude/plugins"
DISABLE_FLAG="$PLUGIN_DIR/bmad-party-mode-disabled.flag"
BMAD_VOICES_FLAG="$PLUGIN_DIR/bmad-voices-enabled.flag"
BMAD_MANIFEST=".bmad/_cfg/agent-manifest.csv"

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
GRAY='\033[0;90m'
NC='\033[0m'

is_bmad_installed() {
  [[ -f "$BMAD_MANIFEST" ]]
}

is_bmad_voices_enabled() {
  [[ -f "$BMAD_VOICES_FLAG" ]]
}

is_party_mode_enabled() {
  [[ -f "$DISABLE_FLAG" ]] && return 1

  is_bmad_installed && is_bmad_voices_enabled
}

show_status() {
  echo -e "${CYAN}🎭 BMAD Party Mode Voice Integration${NC}"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""

  if ! is_bmad_installed; then
    echo -e "${RED}❌ BMAD not installed${NC}"
    echo -e "${GRAY}   Party mode voice integration requires BMAD v6${NC}"
    echo -e "${GRAY}   Install: https://github.com/bmad-method/bmad${NC}"
    echo ""
    return 1
  fi

  echo -e "${GREEN}✅ BMAD v6 detected${NC}"

  if ! is_bmad_voices_enabled; then
    echo -e "${RED}❌ BMAD voice plugin disabled${NC}"
    echo -e "${GRAY}   Enable: /agent-vibes:bmad enable${NC}"
    echo ""
    return 1
  fi

  echo -e "${GREEN}✅ BMAD voice plugin enabled${NC}"

  if is_party_mode_enabled; then
    echo -e "${GREEN}✅ Party mode voices: ENABLED${NC}"
    echo ""
    echo -e "${CYAN}How it works:${NC}"
    echo "  When you run /bmad:core:workflows:party-mode,"
    echo "  each agent speaks with their unique voice:"
    echo ""
    echo "  🏗️  Winston (Architect) → Michael"
    echo "  📋 John (PM) → Jessica Anne Bogart"
    echo "  💻 Amelia (Dev) → Matthew Schmitz"
    echo "  📊 Mary (Analyst) → kristin"
    echo "  ... and more!"
    echo ""
    echo -e "${GRAY}Disable with: /agent-vibes:bmad-party disable${NC}"
  else
    echo -e "${YELLOW}⚠️  Party mode voices: DISABLED (opt-out active)${NC}"
    echo ""
    echo -e "${GRAY}Enable with: /agent-vibes:bmad-party enable${NC}"
  fi

  echo ""
}

enable_party_mode() {
  if ! is_bmad_installed; then
    echo -e "${RED}❌ Cannot enable: BMAD not installed${NC}"
    echo -e "${GRAY}   Install BMAD v6 first${NC}"
    return 1
  fi

  if ! is_bmad_voices_enabled; then
    echo -e "${RED}❌ Cannot enable: BMAD voice plugin disabled${NC}"
    echo -e "${GRAY}   Enable with: /agent-vibes:bmad enable${NC}"
    return 1
  fi

  if [[ -f "$DISABLE_FLAG" ]]; then
    rm -f "$DISABLE_FLAG"
    echo -e "${GREEN}✅ Party mode voices enabled${NC}"
    echo ""
    echo -e "${CYAN}🎭 Multi-agent voice switching activated!${NC}"
    echo "   Run /bmad:core:workflows:party-mode to hear agents speak"
  else
    echo -e "${GREEN}✅ Party mode voices already enabled${NC}"
    echo ""
    echo -e "${GRAY}(Auto-enabled when BMAD detected)${NC}"
  fi

  echo ""
}

disable_party_mode() {
  mkdir -p "$PLUGIN_DIR"

  if [[ -f "$DISABLE_FLAG" ]]; then
    echo -e "${YELLOW}⚠️  Party mode voices already disabled${NC}"
    return 0
  fi

  touch "$DISABLE_FLAG"

  echo -e "${GREEN}✅ Party mode voices disabled${NC}"
  echo ""
  echo -e "${GRAY}Party mode will continue to work, but agents won't speak${NC}"
  echo -e "${GRAY}Enable again with: /agent-vibes:bmad-party enable${NC}"
  echo ""
}

case "${1:-status}" in
  enable)
    enable_party_mode
    ;;
  disable)
    disable_party_mode
    ;;
  status)
    show_status
    ;;
  *)
    echo -e "${CYAN}AgentVibes BMAD Party Mode Manager${NC}"
    echo ""
    echo "Usage: bmad-party-manager.sh {enable|disable|status}"
    echo ""
    echo "Commands:"
    echo "  enable     Enable party mode voice integration"
    echo "  disable    Disable party mode voice integration (opt-out)"
    echo "  status     Show current status and configuration"
    echo ""
    echo "Party Mode Voice Integration:"
    echo "  • Auto-enabled when BMAD v6 detected"
    echo "  • Each agent speaks with unique voice during party mode"
    echo "  • Opt-out available via disable command"
    ;;
esac
