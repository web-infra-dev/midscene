#!/usr/bin/env bash
set -euo pipefail
output_dir="${1:?output directory required}"
fixture_dir=$(cd "$(dirname "$0")/../tests/fixtures/scroll-probe" && pwd)
app="$output_dir/ScrollProbe.app"
mkdir -p "$app"
cp "$fixture_dir/Info.plist" "$app/Info.plist"
xcrun --sdk iphonesimulator swiftc "$fixture_dir/main.swift" \
  -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  -target "$(uname -m)-apple-ios15.0-simulator" -o "$app/ScrollProbe"
codesign --force --sign - "$app"
