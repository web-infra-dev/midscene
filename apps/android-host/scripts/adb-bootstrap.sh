#!/usr/bin/env bash
# Unattended device setup over adb: the whole "install and configure" path that
# the UI would otherwise have to walk a human through.
#
#   1. install the agent APK (and Shizuku, when an APK is provided)
#   2. start the Shizuku server through its own native launcher
#   3. seed model.env and config.yaml into the app's private storage
#   4. exempt the app from battery optimisation and grant notifications
#   5. trigger runtime provisioning (agent bundle + yadb) through the service
#
# Usage:
#   scripts/adb-bootstrap.sh [--serial <id>] [--shizuku-apk <path>]
#                            [--model-env <path>] [--config <path>] [--skip-install]
set -euo pipefail

SERIAL=""
SHIZUKU_APK=""
MODEL_ENV=""
CONFIG=""
SKIP_INSTALL=0
PKG=com.midscene.android
SHIZUKU_PKG=moe.shizuku.privileged.api

while [[ $# -gt 0 ]]; do
  case "$1" in
    --serial) SERIAL="$2"; shift 2 ;;
    --shizuku-apk) SHIZUKU_APK="$2"; shift 2 ;;
    --model-env) MODEL_ENV="$2"; shift 2 ;;
    --config) CONFIG="$2"; shift 2 ;;
    --skip-install) SKIP_INSTALL=1; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

ADB=(adb)
[[ -n "$SERIAL" ]] && ADB=(adb -s "$SERIAL")
say() { printf '\n=== %s ===\n' "$1"; }
sh_() { "${ADB[@]}" shell "$@"; }

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
host_root="$(cd "${here}/.." && pwd)"
repo_root="$(cd "${host_root}/../.." && pwd)"
APK="${host_root}/app/build/outputs/apk/debug/app-debug.apk"
ASSETS="${repo_root}/packages/android/bin"

say "device"
"${ADB[@]}" wait-for-device
sh_ getprop ro.build.version.release
sh_ getprop ro.product.cpu.abi

if [[ "$SKIP_INSTALL" == "0" ]]; then
  say "install agent apk"
  "${ADB[@]}" install -r "$APK" | tail -2
  if [[ -n "$SHIZUKU_APK" ]]; then
    say "install shizuku"
    "${ADB[@]}" install -r "$SHIZUKU_APK" | tail -2
  fi
fi

say "start shizuku server"
SHIZUKU_PATH="$(sh_ dumpsys package "$SHIZUKU_PKG" | grep -m1 codePath | sed 's/.*codePath=//' | tr -d '\r')"
if [[ -z "$SHIZUKU_PATH" ]]; then
  echo "Shizuku is not installed; pass --shizuku-apk" >&2
else
  sh_ "exec ${SHIZUKU_PATH}/lib/arm64/libshizuku.so" | tail -2
fi

# The app's private directories only exist once it has run at least once.
sh_ "run-as ${PKG} mkdir -p files" >/dev/null 2>&1 || true

if [[ -n "$MODEL_ENV" ]]; then
  say "seed model.env"
  "${ADB[@]}" push "$MODEL_ENV" /data/local/tmp/model.env >/dev/null
  sh_ "run-as ${PKG} cp /data/local/tmp/model.env files/model.env"
  sh_ 'rm -f /data/local/tmp/model.env'
  echo "model.env installed into the app's private storage"
fi

if [[ -n "$CONFIG" ]]; then
  say "seed config.yaml"
  "${ADB[@]}" push "$CONFIG" /data/local/tmp/config.yaml >/dev/null
  sh_ "run-as ${PKG} mkdir -p files"
  sh_ "run-as ${PKG} cp /data/local/tmp/config.yaml files/config.yaml"
  sh_ 'rm -f /data/local/tmp/config.yaml'
  echo "config.yaml installed into the app's private storage"
fi

say "permissions"
sh_ "dumpsys deviceidle whitelist +${PKG}" | tail -1
sh_ "pm grant ${PKG} android.permission.POST_NOTIFICATIONS" 2>/dev/null || true
# Authorize Shizuku without a human: the API_V23 permission is what Shizuku
# checks for API clients, and granting it over adb is the unattended equivalent
# of answering its prompt.
if sh_ "pm grant ${PKG} moe.shizuku.manager.permission.API_V23" 2>/dev/null; then
  echo "Shizuku API permission granted over adb"
else
  echo "warning: could not grant the Shizuku permission; tap 'Authorize Shizuku' in Setup" >&2
fi

say "provision runtime (bundle + yadb) through the service"
# Android 14 refuses to start a foreground service from the background, so bring
# the console up first; the service then runs in the foreground it is allowed to use.
sh_ "am start -n ${PKG}/.ConsoleActivity" >/dev/null
sleep 4
sh_ "am start-foreground-service -n ${PKG}/.AgentService -a ${PKG}.PROVISION" | tail -1
sleep 25
sh_ "run-as ${PKG} tail -6 files/run/agent.log" | tail -7
sh_ 'ls -l /data/local/tmp/yadb 2>/dev/null || echo "yadb missing"'

say "done"
echo "Launch the console with: adb shell am start -n ${PKG}/.ConsoleActivity"
