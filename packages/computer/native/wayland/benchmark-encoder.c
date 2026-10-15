// SPDX-License-Identifier: MIT
// Local microbenchmark of the actual encoder; no Wayland connection or inference.
#define main capture_main
#include "capture.c"
#undef main
int main(int argc, char **argv) {
  if (argc != 7) return 2;
  width = (uint32_t)atoi(argv[2]); height = (uint32_t)atoi(argv[3]);
  stride = (uint32_t)atoi(argv[4]); adaptive_filter = atoi(argv[5]);
  if (!width || !height || stride < width * 4 || (uint64_t)stride * height > 256 * 1024 * 1024) return 2;
  pixel_bytes = (size_t)stride * height; pixels = malloc(pixel_bytes);
  FILE *input = fopen(argv[1], "rb");
  if (!input || !pixels || fread(pixels, 1, pixel_bytes, input) != pixel_bytes) return 3;
  fclose(input);
  for (int i = 0; i < 105; i++) {
    uint64_t start = mono(); struct bytes b = encode_png(); uint64_t end = mono();
    if (i >= 5) printf("%llu,%zu\n", (unsigned long long)(end-start), b.size);
    if (i == 104) {
      FILE *out = fopen(argv[6], "wb");
      if (!out || fwrite(b.data, 1, b.size, out) != b.size || fclose(out)) return 4;
    }
    free(b.data);
  }
  free(pixels); return 0;
}
