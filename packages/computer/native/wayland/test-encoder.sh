#!/bin/sh
# Standalone libpng tests and benchmark; no Wayland headers or session required.
set -eu
src=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
out=${1:?provide an output directory}
mkdir -p "$out"
# pkg-config output is deliberately word-split into compiler arguments.
cc -std=c11 -O2 -Wall -Wextra -Werror "$src/png-encoder.test.c" "$src/png-encoder.c" $(pkg-config --cflags --libs libpng) -o "$out/test-encoder"
"$out/test-encoder"
cc -std=c11 -O2 -Wall -Wextra -Werror "$src/benchmark-encoder.c" "$src/png-encoder.c" $(pkg-config --cflags --libs libpng) -o "$out/benchmark-encoder"
