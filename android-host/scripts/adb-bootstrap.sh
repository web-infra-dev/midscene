#!/usr/bin/env bash
# Unattended device setup over adb: the whole "install and configure" path that
# the UI would otherwise have to walk a human through.
#
#   1. install the agent APK (and Shizuku, when an APK is provided)
#   2. start the Shizuku server through its own native launcher
#   3. deploy rish + rish_shizuku.dex (read-only dex on Android 14+)
#   4. seed model.env and config.yaml into the app's private storage
#   5. exempt the app from battery optimisation and grant notifications
#   6. trigger runtime provisioning (agent bundle + yadb) through the service
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
PKG=com.midscene.localagent
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
repo_root="$(cd "${host_root}/.." && pwd)"
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

say "deploy rish"
if [[ ! -f "${ASSETS}/yadb" ]]; then
  echo "warning: ${ASSETS}/yadb missing; non-ASCII input will be unavailable" >&2
fi
RISH_SRC="$(mktemp -d)/rish"
# rish + its dex ship inside the Shizuku APK assets.
if [[ -n "$SHIZUKU_APK" ]]; then
  unzip -o -q "$SHIZUKU_APK" assets/rish assets/rish_shizuku.dex -d "$(dirname "$RISH_SRC")"
  "${ADB[@]}" push "$(dirname "$RISH_SRC")/assets/rish" /data/local/tmp/rish >/dev/null
  "${ADB[@]}" push "$(dirname "$RISH_SRC")/assets/rish_shizuku.dex" /data/local/tmp/rish_shizuku.dex >/dev/null
else
  echo "no --shizuku-apk given: keeping the rish already on the device" >&2
fi
sh_ 'chmod 755 /data/local/tmp/rish 2>/dev/null; chmod 400 /data/local/tmp/rish_shizuku.dex 2>/dev/null; ls -l /data/local/tmp/rish /data/local/tmp/rish_shizuku.dex' | tail -2

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
  sh_ "run-as ${PKG} cp /data/local/tmp/config.yaml files/config.yaml"
  sh_ 'rm -f /data/local/tmp/config.yaml'
  echo "config.yaml installed into the app's private storage"
fi

say "permissions"
sh_ "dumpsys deviceidle whitelist +${PKG}" | tail -1
sh_ "pm grant ${PKG} android.permission.POST_NOTIFICATIONS" 2>/dev/null || true

say "provision runtime (bundle + yadb) through the service"
sh_ "am start-foreground-service -n ${PKG}/.AgentService -a ${PKG}.PROVISION" | tail -1
sleep 25
sh_ "run-as ${PKG} tail -6 files/run/agent.log" | tail -7
sh_ 'ls -l /data/local/tmp/yadb 2>/dev/null || echo "yadb missing"'

say "done"
echo "Launch the console with: adb shell am start -n ${PKG}/.MainActivity"
