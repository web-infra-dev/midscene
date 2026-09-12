#!/usr/bin/env bash
# Build app/src/main/jniLibs/arm64-v8a from an on-device Node installation.
#
# Source options:
#   1. A device with Termux (nodejs-lts installed) — the default: pull node and
#      the shared libraries it links against through `adb exec-out run-as`.
#   2. A local directory prepared like the device layout (bin/node + lib/) via
#      `--from <dir>`.
#
# The Android linker matches dependencies by file name and AGP only packages
# *.so entries, so the bundle script rewrites DT_NEEDED (and the matching
# version-need names) before copying anything into jniLibs.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
host_root="$(cd "${here}/.." && pwd)"
out_dir="${host_root}/app/src/main/jniLibs"
work_dir="${host_root}/build/node-runtime"
termux_prefix="/data/data/com.termux/files/usr"

from_dir=""
if [[ "${1:-}" == "--from" ]]; then
  from_dir="${2:?--from needs a directory}"
fi

mkdir -p "${work_dir}/lib"
if [[ -n "${from_dir}" ]]; then
  cp "${from_dir}/bin/node" "${work_dir}/node"
  for lib in "${from_dir}"/lib/*.so*; do
    cp "${lib}" "${work_dir}/lib/"
  done
else
  echo "Pulling Node from the connected device (Termux at ${termux_prefix})..."
  adb exec-out run-as com.termux cat "${termux_prefix}/bin/node" > "${work_dir}/node"
  for lib in libz.so.1.3.1 libcares.so libsqlite3.so.3.53.4 libcrypto.so.3 libssl.so.3 \
             libicui18n.so.78.3 libicuuc.so.78.3 libicudata.so.78.3 libc++_shared.so; do
    adb exec-out run-as com.termux cat "${termux_prefix}/lib/${lib}" > "${work_dir}/lib/${lib}"
    printf '  %-26s %s bytes\n' "${lib}" "$(wc -c < "${work_dir}/lib/${lib}")"
  done
fi

echo "Building jniLibs at ${out_dir} ..."
python3 "${here}/patch-elf-sonames.py" "${work_dir}" "${out_dir}"
echo
echo "Done. Rebuild the app: cd android-host && gradle assembleDebug"
