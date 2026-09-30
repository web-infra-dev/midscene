#!/usr/bin/env bash
# Read-only by default. --register-owner explicitly opts into adding this same
# installed package to user 0. Does not start Shizuku, grant permissions, or switch users.
set -euo pipefail

serial=""
register_owner=0
while [[ $# -gt 0 ]]; do
  case "$1" in
    --serial)
      [[ $# -ge 2 && -n "$2" ]] || { echo '--serial needs a value' >&2; exit 2; }
      serial="$2"; shift 2 ;;
    --register-owner) register_owner=1; shift ;;
    --help)
      echo 'Usage: bash scripts/check-multi-user.sh --serial ID [--register-owner]'
      exit 0 ;;
    *) echo "Unknown argument: $1" >&2; exit 2 ;;
  esac
done
[[ -n "$serial" ]] || { echo 'Select a device with --serial' >&2; exit 2; }
adb_cmd=("${ADB:-adb}" -s "$serial")
app_package=com.midscene.android
shizuku_package=moe.shizuku.privileged.api
current_user=$("${adb_cmd[@]}" shell am get-current-user | tr -d '\r')
[[ "$current_user" =~ ^[0-9]+$ ]] || { echo 'Cannot resolve Android user' >&2; exit 1; }

installed() {
  # Do not collapse a package-manager/permission failure into "not installed".
  local packages package_line
  packages=$("${adb_cmd[@]}" shell pm list packages --user "$1" "$2") || return 2
  [[ "$packages" != *Exception* && "$packages" != *Error* ]] || return 2
  while IFS= read -r package_line; do
    if [[ "${package_line%$'\r'}" == "package:$2" ]]; then
      return 0
    fi
  done <<< "$packages"
  return 1
}

echo "Foreground Android user: $current_user"
for required in "$app_package" "$shizuku_package"; do
  if installed "$current_user" "$required"; then
    echo "User $current_user: $required installed"
  else
    echo "Cannot verify $required for current user; install/authorize it there first." >&2
    exit 1
  fi
done

if ! installed 0 "$shizuku_package"; then
  echo 'Cannot verify Shizuku for user 0; resolve it through the approved deployment flow first.' >&2
  echo 'No package registration was attempted.' >&2
  exit 1
fi

missing=0
for required in "$app_package" "$shizuku_package"; do
  if installed 0 "$required"; then
    echo "User 0: $required installed"
  else
    check_status=$?
    [[ "$check_status" == 1 ]] || { echo 'Owner package query failed; no changes made.' >&2; exit 1; }
    if [[ "$register_owner" == 1 && "$required" == "$app_package" ]]; then
      echo "Explicit repair: register the existing $app_package APK for user 0."
      "${adb_cmd[@]}" shell cmd package install-existing --user 0 "$app_package"
      installed 0 "$app_package" || { echo 'Owner registration verification failed' >&2; exit 1; }
    else
      echo "User 0: $required missing"
      missing=1
    fi
  fi
done
if [[ "$missing" == 1 ]]; then
  echo 'Multi-user prerequisite missing. For Midscene, explicitly rerun with --register-owner.' >&2
  echo 'If Shizuku is missing for user 0, install it there through your approved deployment flow.' >&2
  exit 1
fi
echo 'Package visibility checks passed. Retry Install Agent Runtime in the foreground user.'
echo 'This check does not prove Shizuku authorization or UserService readiness.'
