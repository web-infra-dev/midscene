#!/usr/bin/env bash
# Build the cached arm64 libadbbin.so and its libraries.
#
# The host app drives the device's own adbd over the wireless-debugging channel
# instead of going through Shizuku. `adb pair` needs an adb *client*, and the
# only one that runs on arm64 Android without a host is the AOSP client that
# Termux ships as `android-tools`. It is a native executable plus a set of
# shared libraries, so it is delivered the same way as the Node runtime:
# a file in lib/<abi>/ (the one place Android 10+ still allows execve) with its
# dependencies beside it, renamed so AGP keeps them and the linker finds them.
#
# Everything is pinned: a build must not depend on what the package index
# happens to hold today.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
host_root="$(cd "${here}/.." && pwd)"
source "${here}/termux-package-cache.sh"
# AGP packages the hidden .cache/native directory as a jniLibs source set.
out_dir="${host_root}/.cache/native/arm64-v8a"
work_dir="${termux_cache}/adb-runtime"
trap 'rm -rf "${work_dir}"' EXIT

PACKAGES=(
  'a/android-tools/android-tools_36.0.1%2Breally35.0.2-1_aarch64.deb 59710261c5cb614701943c19e7b18d074a84b5d16163844237d51e3e64c92773'
  'b/brotli/brotli_1.2.0_aarch64.deb db1502601d40fb44e6085ad8bfd9311a8b472e98db831ceec9d404c5708bb52c'
  'libl/liblz4/liblz4_1.10.0-1_aarch64.deb 09b9449418d5c2dc4f5c1c140ba8138d56be3e9ae5fd3be3318825ec9f8a0499'
  'libp/libprotobuf/libprotobuf_2%3A35.1_aarch64.deb a1ba7c7f0e5903a2134662653d3e7b9ffceaa78bdd00e07ac985e2d313ebc738'
  'z/zlib/zlib_1.3.2_aarch64.deb 75e7d0af17fcc3b40004309fdc00a1ddb9ae08346dce5e269902c34ac3966ac9'
  'z/zstd/zstd_1.5.7-1_aarch64.deb e1b4a5113648da8de189620ba1fce74c48b2d0833d9043391b9a1c91fb606fd3'
  'a/abseil-cpp/abseil-cpp_20260526.0_aarch64.deb e489fac652cddc39d9436141e627285f1034a545a06fbb19c420514a419ad877'
)
staging="${work_dir}/staging"
rm -rf "${staging}" "${work_dir}/unpack"
mkdir -p "${staging}/lib"

for spec in "${PACKAGES[@]}"; do
  read -r entry sha256 <<< "${spec}"
  package="$(fetch_termux_package "${entry}" "${sha256}")"
  extract_termux_package "${package}" "${work_dir}/unpack/$(basename "${entry}")"
done

prefix="data/data/com.termux/files/usr"
find "${work_dir}/unpack" -path "*/${prefix}/bin/adb" -type f -exec cp {} "${staging}/adb" \;
find "${work_dir}/unpack" -path "*/${prefix}/lib/*.so*" -type f -exec cp -n {} "${staging}/lib/" \;

if [[ ! -s "${staging}/adb" ]]; then
  echo "the android-tools package did not contain bin/adb" >&2
  exit 1
fi

echo "staged $(ls -1 "${staging}/lib" | wc -l | tr -d ' ') libraries"
python3 "${here}/patch-adb-sonames.py" "${staging}" "${out_dir}"

echo
echo "Done. Rebuild the app: pnpm --filter android-host assemble"
