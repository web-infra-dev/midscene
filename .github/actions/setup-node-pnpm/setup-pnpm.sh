#!/usr/bin/env bash
set -euo pipefail

: "${PNPM_VERSION:?PNPM_VERSION is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_PATH:?GITHUB_PATH is required}"

pnpm_bin="$RUNNER_TEMP/midscene-pnpm/bin"
mkdir -p "$pnpm_bin"
corepack enable --install-directory "$pnpm_bin" pnpm
corepack install --global "pnpm@$PNPM_VERSION"
"$pnpm_bin/pnpm" --version
printf '%s\n' "$pnpm_bin" >> "$GITHUB_PATH"
