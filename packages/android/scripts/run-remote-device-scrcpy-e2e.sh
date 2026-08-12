#!/usr/bin/env bash

set -euo pipefail

: "${MIDSCENE_ANDROID_REMOTE_SERIAL:?MIDSCENE_ANDROID_REMOTE_SERIAL is required}"
: "${MIDSCENE_ANDROID_DIAGNOSTICS_DIR:?MIDSCENE_ANDROID_DIAGNOSTICS_DIR is required}"

diagnostics_dir="$MIDSCENE_ANDROID_DIAGNOSTICS_DIR"
serial="$MIDSCENE_ANDROID_REMOTE_SERIAL"
mkdir -p "$diagnostics_dir"

adb -s "$serial" get-state
{
  adb -s "$serial" get-serialno
  adb -s "$serial" get-state
} > "$diagnostics_dir/adb-device.txt"
{
  adb -s "$serial" shell getprop ro.product.model
  adb -s "$serial" shell getprop ro.build.version.release
  adb -s "$serial" shell getprop ro.build.version.sdk
  adb -s "$serial" shell wm size
  adb -s "$serial" shell wm density
} > "$diagnostics_dir/device-environment.txt" 2>&1

set +e
AI_TEST_TYPE=android \
MIDSCENE_ANDROID_REMOTE_SCRCPY_E2E=1 \
pnpm exec nx test @midscene/android --skip-nx-cache -- \
  tests/ai/android-remote-scrcpy.test.ts --retry=0 2>&1 |
  tee "$diagnostics_dir/remote-scrcpy-e2e.log"
test_exit=${PIPESTATUS[0]}
set -e

adb -s "$serial" logcat -d -t 2000 > "$diagnostics_dir/device-logcat.txt" 2>&1 || true
adb -s "$serial" exec-out screencap -p > "$diagnostics_dir/device-final.png" 2>/dev/null || true

exit "$test_exit"
