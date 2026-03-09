#!/usr/bin/env bash
#
# Install the vitest-midscene-addon skill for AI coding tools.
#
# Usage:
#   bash skills/install.sh              # auto-detect & install all
#   bash skills/install.sh claude       # Claude Code only
#   bash skills/install.sh trae         # Trae only
#   bash skills/install.sh codex        # Codex only

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SKILL_SRC="$SCRIPT_DIR"

install_claude() {
  local dest="$PROJECT_ROOT/.claude/skills/vitest-midscene-addon"
  local alias_dest="$PROJECT_ROOT/.claude/skills/vma"
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest" "$alias_dest"
  cp -r "$SKILL_SRC" "$dest"
  # Remove install script from installed copy
  rm -f "$dest/install.sh"
  # Create shorthand alias: /vma -> /vitest-midscene-addon
  ln -s vitest-midscene-addon "$alias_dest"
  echo "  + Claude Code -> ${dest#$PROJECT_ROOT/} (shorthand: /vma)"
}

install_codex() {
  local dest="$PROJECT_ROOT/.agents/skills/vitest-midscene-addon"
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest"
  cp -r "$SKILL_SRC" "$dest"
  rm -f "$dest/install.sh"
  echo "  + Codex -> ${dest#$PROJECT_ROOT/}"
}

install_trae() {
  local dest="$PROJECT_ROOT/.trae/rules"
  mkdir -p "$dest"

  # Convert SKILL.md frontmatter to Trae format
  local skill_body
  skill_body=$(awk 'BEGIN{n=0} /^---$/{n++;next} n>=2' "$SKILL_SRC/SKILL.md")

  cat > "$dest/vitest-midscene-addon.md" <<TRAE_EOF
---
description: "Enhance Vitest with Midscene for smarter, easier UI testing. Use when setting up projects, creating, updating, or debugging E2E test files."
alwaysApply: false
globs: "e2e/**/*.test.ts,src/**/*.ts"
---
${skill_body}
TRAE_EOF

  # Copy references
  if [ -d "$SKILL_SRC/references" ]; then
    rm -rf "$dest/vitest-midscene-addon-references"
    cp -r "$SKILL_SRC/references" "$dest/vitest-midscene-addon-references"
  fi

  echo "  + Trae -> ${dest#$PROJECT_ROOT/}"
}

# --- main ---
if [ $# -eq 0 ]; then
  targets=(claude trae codex)
else
  targets=("${@}")
fi

echo "Installing vitest-midscene-addon skill..."
echo ""

for target in "${targets[@]}"; do
  case "$target" in
    claude) install_claude ;;
    trae)   install_trae ;;
    codex)  install_codex ;;
    *)      echo "Unknown target: $target (use: claude | trae | codex)"; exit 1 ;;
  esac
done

echo ""
echo "Done."
