// SPDX-License-Identifier: MIT
// Local microbenchmark of the actual encoder; no Wayland connection or inference.
#define _POSIX_C_SOURCE 200809L
#include "png-encoder.h"
#include <stdio.h>
#include <stdlib.h>
#include <time.h>

static uint64_t monotonic_ns(void) {
  struct timespec time;
  if (clock_gettime(CLOCK_MONOTONIC, &time)) exit(1);
  return (uint64_t)time.tv_sec * 1000000000 + time.tv_nsec;
}

int main(int argc, char **argv) {
  if (argc != 7) return 2;
  uint32_t width = (uint32_t)atoi(argv[2]), height = (uint32_t)atoi(argv[3]);
  uint32_t stride = (uint32_t)atoi(argv[4]);
  int adaptive_filter = atoi(argv[5]);
  if (!width || !height || width > UINT32_MAX / 4 || stride < width * 4 ||
      (uint64_t)stride * height > 256 * 1024 * 1024) return 2;
  size_t pixel_bytes = (size_t)stride * height;
  unsigned char *pixels = malloc(pixel_bytes);
  FILE *input = fopen(argv[1], "rb");
  if (!input || !pixels || fread(pixels, 1, pixel_bytes, input) != pixel_bytes) return 3;
  fclose(input);
  const struct raw_image image = { pixels, pixel_bytes, width, height, stride, 0 };
  for (int i = 0; i < 105; i++) {
    uint64_t start = monotonic_ns();
    struct png_bytes encoded;
    if (encode_png(&image, adaptive_filter, &encoded)) return 4;
    uint64_t end = monotonic_ns();
    if (i >= 5) printf("%llu,%zu\n", (unsigned long long)(end - start), encoded.size);
    if (i == 104) {
      FILE *out = fopen(argv[6], "wb");
      if (!out || fwrite(encoded.data, 1, encoded.size, out) != encoded.size || fclose(out)) return 4;
    }
    free(encoded.data);
  }
  free(pixels);
  return 0;
}
