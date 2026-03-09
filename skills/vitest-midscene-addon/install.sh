#!/usr/bin/env bash
#
# Install the vitest-midscene-addon skill for AI coding tools.
#
# Usage:
#   bash install.sh              # auto-detect & install all
#   bash install.sh claude       # Claude Code only
#   bash install.sh trae         # Trae only
#   bash install.sh codex        # Codex only

set -euo pipefail

SKILL_SOURCE_DIR="$(cd "$(dirname "$0")" && pwd)"
INSTALL_TARGET_DIR="$(pwd)"

# Skill source files (relative to SKILL_SOURCE_DIR)
SKILL_FILES=(SKILL.md metadata.json)
SKILL_DIRS=(references boilerplate)

copy_skill() {
  local dest="$1"
  mkdir -p "$dest"
  for f in "${SKILL_FILES[@]}"; do
    cp "$SKILL_SOURCE_DIR/$f" "$dest/$f"
  done
  for d in "${SKILL_DIRS[@]}"; do
    rm -rf "$dest/$d"
    cp -r "$SKILL_SOURCE_DIR/$d" "$dest/$d"
  done
}

install_claude() {
  local dest="$INSTALL_TARGET_DIR/.claude/skills/vitest-midscene-addon"
  local alias_dest="$INSTALL_TARGET_DIR/.claude/skills/vma"
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest" "$alias_dest"
  copy_skill "$dest"
  # Create shorthand alias: /vma redirects to /vitest-midscene-addon
  mkdir -p "$alias_dest"
  cat > "$alias_dest/SKILL.md" <<'ALIAS_EOF'
---
name: vma
description: "Shorthand for /vitest-midscene-addon. Triggers on the same keywords."
user-invocable: true
argument-hint: "[create|update|run|init] <feature-name>"
---

This is a shorthand alias. Execute /vitest-midscene-addon with the same arguments.
ALIAS_EOF
  echo "  + Claude Code -> ${dest#$INSTALL_TARGET_DIR/} (shorthand: /vma)"
}

install_codex() {
  local dest="$INSTALL_TARGET_DIR/.agents/skills/vitest-midscene-addon"
  mkdir -p "$(dirname "$dest")"
  rm -rf "$dest"
  copy_skill "$dest"
  echo "  + Codex -> ${dest#$INSTALL_TARGET_DIR/}"
}

install_trae() {
  local dest="$INSTALL_TARGET_DIR/.trae/rules"
  mkdir -p "$dest"

  # Convert SKILL.md frontmatter to Trae format
  local skill_body
  skill_body=$(awk 'BEGIN{n=0} /^---$/{n++;next} n>=2' "$SKILL_SOURCE_DIR/SKILL.md")

  cat > "$dest/vitest-midscene-addon.md" <<TRAE_EOF
---
description: "Enhance Vitest with Midscene for smarter, easier UI testing. Use when setting up projects, creating, updating, or debugging E2E test files."
alwaysApply: false
globs: "e2e/**/*.test.ts,src/**/*.ts"
---
${skill_body}
TRAE_EOF

  # Copy references and boilerplate
  for d in references boilerplate; do
    if [ -d "$SKILL_SOURCE_DIR/$d" ]; then
      rm -rf "$dest/vitest-midscene-addon-$d"
      cp -r "$SKILL_SOURCE_DIR/$d" "$dest/vitest-midscene-addon-$d"
    fi
  done

  echo "  + Trae -> ${dest#$INSTALL_TARGET_DIR/}"
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
