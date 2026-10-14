#!/bin/sh
# Explicit optional build: requires cc, pkg-config, wayland-scanner, wayland-client and libpng headers.
set -eu
src=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
out=${1:?provide an output directory}
mkdir -p "$out"
wayland-scanner client-header "$src/wlr-screencopy-unstable-v1.xml" "$out/screencopy-client.h"
wayland-scanner private-code "$src/wlr-screencopy-unstable-v1.xml" "$out/screencopy-protocol.c"
# pkg-config output is deliberately word-split into compiler arguments.
cc -std=c11 -O2 -Wall -Wextra -Werror -I"$out" "$src/capture.c" "$out/screencopy-protocol.c" $(pkg-config --cflags --libs wayland-client libpng) -o "$out/midscene-wayland-capture"
