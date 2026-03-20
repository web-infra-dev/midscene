#!/bin/bash
# Setup all external dependencies for WebVoyager benchmark
# Usage: bash setup.sh [--browser-use] [--stagehand] [--all]
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
WORKSPACE="$SCRIPT_DIR/_workspace"
mkdir -p "$WORKSPACE"

setup_browser_use() {
  echo "=== Setting up Browser Use ==="
  cd "$WORKSPACE"

  if [ ! -d "eval" ]; then
    echo "Cloning browser-use/eval..."
    git clone https://github.com/browser-use/eval.git
  fi

  # Require Python 3.11+
  PYTHON=$(command -v python3.12 || command -v python3.11 || command -v python3.13 || echo "")
  if [ -z "$PYTHON" ]; then
    echo "ERROR: Python 3.11+ is required for Browser Use"
    exit 1
  fi
  echo "Using Python: $($PYTHON --version)"

  if [ ! -d "bu-venv" ]; then
    $PYTHON -m venv bu-venv
  fi
  source bu-venv/bin/activate
  pip install --upgrade pip -q
  pip install browser-use playwright openai python-dotenv -q
  python -m playwright install chromium

  # Copy runner into eval dir
  cp "$SCRIPT_DIR/runner-browseruse.py" "$WORKSPACE/eval/run_qwen.py"

  echo "=== Browser Use ready ==="
}

setup_stagehand() {
  echo "=== Setting up Stagehand ==="
  cd "$WORKSPACE"

  if [ ! -d "stagehand" ]; then
    echo "Cloning browserbase/stagehand..."
    git clone https://github.com/browserbase/stagehand.git
  fi

  cd stagehand
  pnpm install
  pnpm run --filter @browserbasehq/stagehand build || true

  # Apply patches for Qwen compatibility (AI SDK v2 uses /responses + developer role)
  echo "Applying AI SDK patches for Qwen compatibility..."
  AISDK_DIR=$(find node_modules/.pnpm -path "*@ai-sdk+openai*/dist" -type d | head -1)
  if [ -n "$AISDK_DIR" ]; then
    for f in "$AISDK_DIR/index.js" "$AISDK_DIR/index.mjs" "$AISDK_DIR/internal/index.js" "$AISDK_DIR/internal/index.mjs"; do
      if [ -f "$f" ]; then
        # Patch 1: default to "system" role instead of "developer"
        sed -i '' 's/systemMessageMode) != null ? _b : "developer"/systemMessageMode) != null ? _b : "system"/g' "$f"
        # Patch 2: remove tool_choice when STAGEHAND_NO_TOOL_CHOICE is set
        sed -i '' 's/tool_choice: openaiToolChoice/tool_choice: (typeof globalThis !== "undefined" \&\& globalThis.process?.env?.STAGEHAND_NO_TOOL_CHOICE === "true") ? undefined : openaiToolChoice/g' "$f"
      fi
    done
    echo "AI SDK patches applied"
  fi

  # Copy runner
  cp "$SCRIPT_DIR/runner-stagehand.ts" "$WORKSPACE/stagehand/run_qwen.ts"

  echo "=== Stagehand ready ==="
}

# Parse args
if [ "$1" = "--all" ] || [ $# -eq 0 ]; then
  setup_browser_use
  setup_stagehand
elif [ "$1" = "--browser-use" ]; then
  setup_browser_use
elif [ "$1" = "--stagehand" ]; then
  setup_stagehand
else
  echo "Usage: bash setup.sh [--browser-use] [--stagehand] [--all]"
  exit 1
fi

echo ""
echo "=== All done ==="
echo ""
echo "Run benchmarks:"
echo "  # Midscene (no setup needed)"
echo "  npx tsx runner-midscene.ts --subset 30"
echo ""
echo "  # Browser Use"
echo "  source _workspace/bu-venv/bin/activate"
echo "  cd _workspace/eval && python run_qwen.py --subset 30"
echo ""
echo "  # Stagehand"
echo "  cd _workspace/stagehand && STAGEHAND_USE_CHAT_COMPLETIONS=true STAGEHAND_NO_TOOL_CHOICE=true npx tsx run_qwen.ts"
