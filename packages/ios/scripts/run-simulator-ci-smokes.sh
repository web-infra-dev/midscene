#!/usr/bin/env bash

set -euo pipefail

: "${MIDSCENE_IOS_DIAGNOSTICS_DIR:?MIDSCENE_IOS_DIAGNOSTICS_DIR is required}"

diagnostics_dir="$MIDSCENE_IOS_DIAGNOSTICS_DIR"
wda_port="${MIDSCENE_IOS_WDA_PORT:-8100}"
mjpeg_port="${MIDSCENE_IOS_WDA_MJPEG_PORT:-9100}"
wda_project="${MIDSCENE_IOS_WDA_PROJECT:-.ci/WebDriverAgent/WebDriverAgent.xcodeproj}"
derived_data_dir="${RUNNER_TEMP:-/tmp}/midscene-wda-derived-data"
wda_log="$diagnostics_dir/webdriveragent-xcodebuild.log"
wda_pid=""
simulator_udid=""
mkdir -p "$diagnostics_dir"

collect_diagnostics() {
  set +e
  if [[ -n "$simulator_udid" ]]; then
    curl --max-time 10 -sS "http://127.0.0.1:${wda_port}/status" \
      > "$diagnostics_dir/webdriveragent-final-status.json" 2>&1
    xcrun simctl io "$simulator_udid" screenshot \
      "$diagnostics_dir/simulator-final.png" \
      > "$diagnostics_dir/simulator-screenshot.log" 2>&1
    xcrun simctl spawn "$simulator_udid" log show \
      --last 20m \
      --style compact \
      --predicate 'process == "WebDriverAgentRunner-Runner" OR process == "MobileSafari"' \
      > "$diagnostics_dir/simulator-system.log" 2>&1
  fi
  xcrun simctl list devices > "$diagnostics_dir/simulator-devices-final.txt" 2>&1

  if [[ -n "$wda_pid" ]] && kill -0 "$wda_pid" 2>/dev/null; then
    kill "$wda_pid" 2>/dev/null
    for _ in $(seq 1 15); do
      kill -0 "$wda_pid" 2>/dev/null || break
      sleep 1
    done
    if kill -0 "$wda_pid" 2>/dev/null; then
      kill -9 "$wda_pid" 2>/dev/null
    fi
    wait "$wda_pid" 2>/dev/null
  fi
  if [[ -n "$simulator_udid" ]]; then
    xcrun simctl shutdown "$simulator_udid" >/dev/null 2>&1
  fi
}
trap collect_diagnostics EXIT

{
  sw_vers
  uname -a
  xcodebuild -version
  xcode-select -p
  xcrun simctl list runtimes
  xcrun simctl list devicetypes
  xcrun simctl list devices available
} > "$diagnostics_dir/runner-environment.log" 2>&1

if [[ ! -d "$wda_project" ]]; then
  echo "WebDriverAgent project is missing at $wda_project" >&2
  exit 1
fi

selection=$(node - "$diagnostics_dir/simulator-selection.json" <<'NODE'
const { execFileSync } = require('node:child_process');
const { writeFileSync } = require('node:fs');

const outputFile = process.argv[2];
const listing = JSON.parse(
  execFileSync('xcrun', ['simctl', 'list', 'devices', 'available', '-j'], {
    encoding: 'utf8',
  }),
);

function versionOf(runtime) {
  const match = /iOS-(\d+(?:-\d+)*)$/.exec(runtime);
  return match ? match[1].split('-').map(Number) : [];
}

function compareVersions(left, right) {
  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference !== 0) return difference;
  }
  return 0;
}

const runtimes = Object.entries(listing.devices)
  .filter(([runtime]) => runtime.includes('SimRuntime.iOS-'))
  .map(([runtime, devices]) => ({
    runtime,
    version: versionOf(runtime),
    devices: devices.filter(
      (device) => device.isAvailable !== false && device.name.startsWith('iPhone'),
    ),
  }))
  .filter((entry) => entry.devices.length > 0)
  .sort((left, right) => compareVersions(right.version, left.version));

if (runtimes.length === 0) {
  throw new Error('No available iOS iPhone Simulator was found');
}

const runtime = runtimes[0];
const device =
  runtime.devices.find((candidate) => / Pro$/.test(candidate.name)) ||
  runtime.devices[0];
const result = {
  runtime: runtime.runtime,
  runtimeVersion: runtime.version.join('.'),
  name: device.name,
  udid: device.udid,
  stateBeforeBoot: device.state,
};
writeFileSync(outputFile, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${result.udid}\t${result.name}\t${result.runtimeVersion}`);
NODE
)

IFS=$'\t' read -r simulator_udid simulator_name simulator_runtime <<< "$selection"
echo "Selected $simulator_name ($simulator_udid) on iOS $simulator_runtime"

xcrun simctl boot "$simulator_udid" 2> "$diagnostics_dir/simulator-boot.log" || true
xcrun simctl bootstatus "$simulator_udid" -b 2>&1 |
  tee -a "$diagnostics_dir/simulator-boot.log"
xcrun simctl list devices > "$diagnostics_dir/simulator-devices-booted.txt"

rm -rf "$derived_data_dir"
USE_PORT="$wda_port" \
MJPEG_SERVER_PORT="$mjpeg_port" \
xcodebuild \
  -project "$wda_project" \
  -scheme WebDriverAgentRunner \
  -destination "platform=iOS Simulator,id=$simulator_udid" \
  -derivedDataPath "$derived_data_dir" \
  CODE_SIGNING_ALLOWED=NO \
  COMPILER_INDEX_STORE_ENABLE=NO \
  test > "$wda_log" 2>&1 &
wda_pid=$!
echo "$wda_pid" > "$diagnostics_dir/webdriveragent.pid"

wda_ready=0
for attempt in $(seq 1 300); do
  if curl --max-time 5 -fsS "http://127.0.0.1:${wda_port}/status" \
    > "$diagnostics_dir/webdriveragent-status.json"; then
    wda_ready=1
    echo "WebDriverAgent became ready after $attempt seconds"
    break
  fi
  if ! kill -0 "$wda_pid" 2>/dev/null; then
    echo "WebDriverAgent xcodebuild exited before the status endpoint became ready" >&2
    tail -n 200 "$wda_log" >&2 || true
    break
  fi
  sleep 1
done

if ((wda_ready == 0)); then
  echo "WebDriverAgent did not become ready on port $wda_port" >&2
  tail -n 200 "$wda_log" >&2 || true
  exit 1
fi

set +e
AI_TEST_TYPE=iOS \
MIDSCENE_IOS_SIMULATOR_SMOKE=1 \
pnpm exec nx test @midscene/ios --skip-nx-cache -- \
  tests/ai/ios-simulator-smoke.test.ts --retry=0 2>&1 |
  tee "$diagnostics_dir/simulator-smoke.log"
smoke_exit=${PIPESTATUS[0]}

AI_TEST_TYPE=iOS \
pnpm exec nx test @midscene/ios --skip-nx-cache -- \
  tests/ai/todo.test.ts --retry=0 2>&1 |
  tee "$diagnostics_dir/todo-mvc.log"
todo_exit=${PIPESTATUS[0]}
set -e

SMOKE_EXIT="$smoke_exit" \
TODO_EXIT="$todo_exit" \
node -e '
  const fs = require("node:fs");
  const path = require("node:path");
  const outcomes = {
    deterministicSmoke: Number(process.env.SMOKE_EXIT),
    todoMvc: Number(process.env.TODO_EXIT),
  };
  fs.writeFileSync(
    path.join(process.env.MIDSCENE_IOS_DIAGNOSTICS_DIR, "simulator-step-outcomes.json"),
    `${JSON.stringify(outcomes, null, 2)}\n`,
  );
'

if ((smoke_exit != 0 || todo_exit != 0)); then
  echo "iOS Simulator validation failed: smoke=$smoke_exit todo=$todo_exit" >&2
  exit 1
fi
