// SPDX-License-Identifier: MIT
#include "png-encoder.h"
#include <assert.h>
#include <png.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

int main(void) {
  // Distinct BGR colors, ignored alpha and non-pixel row padding.
  const unsigned char pixels[] = {
    0, 0, 255, 0, 0, 255, 0, 50, 99, 99, 99, 99,
    255, 0, 0, 100, 60, 50, 40, 255, 99, 99, 99, 99,
  };
  const unsigned char expected[] = {255, 0, 0, 0, 255, 0, 0, 0, 255, 40, 50, 60};
  struct raw_image raw = {pixels, sizeof pixels, 2, 2, 12, 0};
  for (int adaptive = 0; adaptive < 2; adaptive++) {
    for (int inverted = 0; inverted < 2; inverted++) {
      raw.y_inverted = inverted;
      struct png_bytes encoded;
      assert(encode_png(&raw, adaptive, &encoded) == 0);
      png_image decoded = { .version = PNG_IMAGE_VERSION };
      assert(png_image_begin_read_from_memory(&decoded, encoded.data, encoded.size));
      assert(decoded.width == 2 && decoded.height == 2);
      decoded.format = PNG_FORMAT_RGB;
      unsigned char rgb[sizeof expected];
      assert(png_image_finish_read(&decoded, NULL, rgb, 0, NULL));
      for (int y = 0; y < 2; y++) {
        assert(memcmp(rgb + y * 6, expected + (inverted ? 1 - y : y) * 6, 6) == 0);
      }
      png_image_free(&decoded);
      free(encoded.data);
    }
  }
  struct png_bytes encoded;
  raw.size--;
  assert(encode_png(&raw, 0, &encoded) == -1);
  assert(encoded.data == NULL && encoded.size == 0);
  raw.size = sizeof pixels;
  raw.stride = 7;
  assert(encode_png(&raw, 0, &encoded) == -1);
  raw.stride = 12;
  raw.width = 0;
  assert(encode_png(&raw, 0, &encoded) == -1);
  puts("PNG encoder: 4 pixel round trips and 3 invalid-input cases passed");
  return 0;
}
