#!/usr/bin/env bash
# Build the arm64 Node runtime from pinned Termux packages. Pass --from <dir>
# to use a prepared bin/node + lib/*.so* tree instead.
set -euo pipefail

here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
host_root="$(cd "${here}/.." && pwd)"
source "${here}/termux-package-cache.sh"

out_dir="${host_root}/.cache/native/arm64-v8a"
work_dir="${termux_cache}/node-runtime"
staging="${work_dir}/staging"
trap 'rm -rf "${work_dir}"' EXIT
from_dir=""
if [[ "${1:-}" == "--from" ]]; then
  from_dir="${2:?--from needs a directory}"
elif [[ "$#" -ne 0 ]]; then
  echo "usage: $0 [--from <runtime-dir>]" >&2
  exit 2
fi

rm -rf "${staging}"
mkdir -p "${staging}/lib"
if [[ -n "${from_dir}" ]]; then
  cp "${from_dir}/bin/node" "${staging}/node"
  for lib in "${from_dir}"/lib/*.so*; do
    cp "${lib}" "${staging}/lib/"
  done
else
  # Versions and hashes come from the official Termux aarch64 Packages index.
  packages=(
    'n/nodejs-lts/nodejs-lts_24.18.0-1_aarch64.deb 490f4d08c45b25a7ea7db6ee466ebb3ee61f07083260b85332704ed018f59a87'
    'c/c-ares/c-ares_1.34.8_aarch64.deb 7681fc23e822d7988ba8b2adf3468f93ae68f724dda365cff1385096a9fa87e6'
    'libc/libc++/libc++_29_aarch64.deb bb9f12113c137aa0e8513bb51cc49fe77a5ce3ca39ab9e92c57d228ecdf00222'
    'libi/libicu/libicu_78.3_aarch64.deb f536403f65a08fe0df6e7304184e902d54def77d5c3bd5edfd9109d57601d276'
    'libs/libsqlite/libsqlite_3.53.4_aarch64.deb 0e909ce0d50fe123305446cd22e0c5edf535d40344b9b065fbdcdee52f53198d'
    'o/openssl/openssl_1%3A3.6.3_aarch64.deb 86760e9ce736f463236f2c15b1eb3a3fdcfc5778d0fd7077a917448dcc90f3aa'
    'z/zlib/zlib_1.3.2_aarch64.deb 75e7d0af17fcc3b40004309fdc00a1ddb9ae08346dce5e269902c34ac3966ac9'
  )
  unpack="${work_dir}/unpack"
  rm -rf "${unpack}"
  for spec in "${packages[@]}"; do
    read -r entry sha256 <<< "${spec}"
    package="$(fetch_termux_package "${entry}" "${sha256}")"
    extract_termux_package "${package}" "${unpack}/$(basename "${entry}")"
  done

  prefix='data/data/com.termux/files/usr'
  node="$(find "${unpack}" -path "*/${prefix}/bin/node" -type f -print -quit)"
  if [[ -z "${node}" ]]; then
    echo 'nodejs-lts package did not contain bin/node' >&2
    exit 1
  fi
  cp "${node}" "${staging}/node"
  for name in libz.so.1.3.2 libcares.so libsqlite3.so.3.53.4 \
              libcrypto.so.3 libssl.so.3 libicui18n.so.78.3 \
              libicuuc.so.78.3 libicudata.so.78.3 libc++_shared.so; do
    library="$(find "${unpack}" -path "*/${prefix}/lib/${name}" -type f -print -quit)"
    if [[ -z "${library}" ]]; then
      echo "Termux packages did not contain ${name}" >&2
      exit 1
    fi
    cp "${library}" "${staging}/lib/${name}"
  done
fi

echo "Building jniLibs at ${out_dir} ..."
python3 "${here}/patch-elf-sonames.py" "${staging}" "${out_dir}"
