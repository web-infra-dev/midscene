#!/usr/bin/env bash
# Build app/src/main/jniLibs/arm64-v8a/libadbbin.so and its libraries.
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
# AGP only packages libraries that sit in a per-ABI directory, so the output has
# to be jniLibs/<abi> — jniLibs itself is not a directory it reads.
out_dir="${host_root}/app/src/main/jniLibs/arm64-v8a"
work_dir="${host_root}/build/adb-runtime"
pool="https://packages.termux.dev/apt/termux-main/pool/main"

ANDROID_TOOLS="android-tools_36.0.1%2Breally35.0.2-1_aarch64.deb"
BROTLI="brotli_1.2.0_aarch64.deb"
LIBLZ4="liblz4_1.10.0-1_aarch64.deb"
LIBPROTOBUF="libprotobuf_2%3A35.1_aarch64.deb"
ZLIB="zlib_1.3.2_aarch64.deb"
ZSTD="zstd_1.5.7-1_aarch64.deb"
ABSEIL="abseil-cpp_20260526.0_aarch64.deb"

PACKAGES=(
  "a/android-tools/${ANDROID_TOOLS}"
  "b/brotli/${BROTLI}"
  "libl/liblz4/${LIBLZ4}"
  "libp/libprotobuf/${LIBPROTOBUF}"
  "z/zlib/${ZLIB}"
  "z/zstd/${ZSTD}"
  "a/abseil-cpp/${ABSEIL}"
)

extract_deb() {
  local deb="$1" dest="$2"
  rm -rf "${dest}"
  mkdir -p "${dest}"
  (
    cd "${dest}"
    # macOS bsdtar reads the ar container directly; GNU tar does not, so fall
    # back to `ar` there.
    if ! tar -xf "${deb}" 2>/dev/null; then
      ar x "${deb}"
    fi
    for member in data.tar.xz data.tar.zst data.tar.gz data.tar; do
      if [[ -f "${member}" ]]; then
        tar -xf "${member}"
        return 0
      fi
    done
    echo "no data.tar member in ${deb}" >&2
    return 1
  )
}

downloaded="${work_dir}/debs"
staging="${work_dir}/staging"
mkdir -p "${downloaded}" "${staging}/lib"

for entry in "${PACKAGES[@]}"; do
  name="$(basename "${entry}")"
  target="${downloaded}/${name}"
  if [[ ! -s "${target}" ]]; then
    printf 'fetching %s\n' "${name}"
    curl -fsSL --retry 3 --max-time 300 -o "${target}" "${pool}/${entry}"
  fi
  extract_deb "${target}" "${work_dir}/unpack/${name}"
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
