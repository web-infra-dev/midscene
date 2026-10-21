#!/usr/bin/env bash
set -euo pipefail

: "${PNPM_VERSION:?PNPM_VERSION is required}"
: "${RUNNER_TEMP:?RUNNER_TEMP is required}"
: "${GITHUB_PATH:?GITHUB_PATH is required}"
: "${GITHUB_ENV:?GITHUB_ENV is required}"

pnpm_bin="$RUNNER_TEMP/midscene-pnpm/bin"
mkdir -p "$pnpm_bin"
corepack enable --install-directory "$pnpm_bin" pnpm
corepack install --global "pnpm@$PNPM_VERSION"
# Honor the workflow's version override even when package.json pins another one.
export COREPACK_ENABLE_PROJECT_SPEC=0
installed_version=$("$pnpm_bin/pnpm" --version)
if [[ "$installed_version" != "$PNPM_VERSION" ]]; then
  echo "Expected pnpm $PNPM_VERSION, received $installed_version" >&2
  exit 1
fi
printf '%s\n' "$installed_version"
printf '%s\n' "$pnpm_bin" >> "$GITHUB_PATH"
printf '%s\n' 'COREPACK_ENABLE_PROJECT_SPEC=0' >> "$GITHUB_ENV"
