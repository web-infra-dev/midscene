#!/usr/bin/env bash
# Shared, Git-ignored cache for pinned Termux arm64 packages.
termux_pool="https://packages.termux.dev/apt/termux-main/pool/main"
termux_cache="${host_root}/.cache/termux"

verify_sha256() {
  python3 - "$1" "$2" <<'PY'
import hashlib
import sys

digest = hashlib.sha256()
with open(sys.argv[1], 'rb') as package:
    for chunk in iter(lambda: package.read(1024 * 1024), b''):
        digest.update(chunk)
sys.exit(0 if digest.hexdigest() == sys.argv[2] else 1)
PY
}

fetch_termux_package() {
  local entry="$1" expected_sha256="$2"
  local target="${termux_cache}/debs/$(basename "${entry}")"
  local temporary="${target}.tmp.$$"
  mkdir -p "${termux_cache}/debs"
  if [[ -f "${target}" ]] && ! verify_sha256 "${target}" "${expected_sha256}"; then
    echo "discarding corrupt cached package: ${target}" >&2
    rm -f "${target}"
  fi
  if [[ ! -f "${target}" ]]; then
    echo "fetching $(basename "${entry}")" >&2
    if ! curl -fsSL --retry 5 --retry-all-errors --max-time 300 \
      -o "${temporary}" "${termux_pool}/${entry}"; then
      rm -f "${temporary}"
      return 1
    fi
    if ! verify_sha256 "${temporary}" "${expected_sha256}"; then
      rm -f "${temporary}"
      echo "SHA-256 mismatch for ${entry}" >&2
      return 1
    fi
    mv "${temporary}" "${target}"
  fi
  printf '%s\n' "${target}"
}

extract_termux_package() {
  local package="$1" destination="$2" member
  rm -rf "${destination}"
  mkdir -p "${destination}"
  (
    cd "${destination}"
    if ! tar -xf "${package}" 2>/dev/null; then
      ar x "${package}"
    fi
    for member in data.tar.xz data.tar.zst data.tar.gz data.tar; do
      if [[ -f "${member}" ]]; then
        tar -xf "${member}"
        return 0
      fi
    done
    echo "no data.tar member in ${package}" >&2
    return 1
  )
}
