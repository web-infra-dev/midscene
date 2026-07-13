#!/usr/bin/env bash

set -euo pipefail

: "${MIDSCENE_ANDROID_DIAGNOSTICS_DIR:?MIDSCENE_ANDROID_DIAGNOSTICS_DIR is required}"

diagnostics_dir="$MIDSCENE_ANDROID_DIAGNOSTICS_DIR"
todo_url="https://todomvc.com/examples/react/dist/"
mkdir -p "$diagnostics_dir"

adb devices -l > "$diagnostics_dir/adb-devices.txt"
{
  adb shell getprop ro.product.model
  adb shell getprop ro.build.version.sdk
  adb shell wm size
  adb shell wm density
} > "$diagnostics_dir/device-environment.txt" 2>&1

adb shell settings put system system_locales en-US
adb shell settings put system font_scale 1.0
adb shell settings put secure show_ime_with_hard_keyboard 0
adb shell settings put system screen_off_timeout 1800000

set +e
resolve_output=$(adb shell cmd package resolve-activity --brief \
  -a android.intent.action.VIEW -d "$todo_url" 2>&1)
resolve_exit=$?
set -e
printf '%s\n' "$resolve_output" > "$diagnostics_dir/browser-resolve-activity.txt"

browser_preflight_exit=$resolve_exit
if [[ -z "$resolve_output" || "$resolve_output" == *"No activity found"* ]]; then
  browser_preflight_exit=1
fi

set +e
AI_TEST_TYPE=android \
MIDSCENE_ANDROID_EMULATOR_SMOKE=1 \
pnpm exec nx test @midscene/android --skip-nx-cache -- \
  tests/ai/android-emulator-smoke.test.ts --retry=0 2>&1 |
  tee "$diagnostics_dir/emulator-smoke.log"
smoke_exit=${PIPESTATUS[0]}

AI_TEST_TYPE=android \
pnpm exec nx test @midscene/android --skip-nx-cache -- \
  tests/ai/todo.test.ts --retry=1 2>&1 |
  tee "$diagnostics_dir/todo-mvc.log"
todo_exit=${PIPESTATUS[0]}
set -e

adb logcat -d -t 2000 > "$diagnostics_dir/emulator-logcat.txt" 2>&1 || true
adb exec-out screencap -p > "$diagnostics_dir/emulator-final.png" 2>/dev/null || true

BROWSER_PREFLIGHT_EXIT="$browser_preflight_exit" \
SMOKE_EXIT="$smoke_exit" \
TODO_EXIT="$todo_exit" \
node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const outcomes = {
    browserPreflight: Number(process.env.BROWSER_PREFLIGHT_EXIT),
    deterministicSmoke: Number(process.env.SMOKE_EXIT),
    todoMvc: Number(process.env.TODO_EXIT),
  };
  fs.writeFileSync(
    path.join(process.env.MIDSCENE_ANDROID_DIAGNOSTICS_DIR, "emulator-step-outcomes.json"),
    `${JSON.stringify(outcomes, null, 2)}\n`,
  );
'

if ((browser_preflight_exit != 0 || smoke_exit != 0 || todo_exit != 0)); then
  echo "Android emulator validation failed: browser=$browser_preflight_exit smoke=$smoke_exit todo=$todo_exit" >&2
  exit 1
fi
