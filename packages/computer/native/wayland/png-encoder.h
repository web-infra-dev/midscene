// SPDX-License-Identifier: MIT
#ifndef MIDSCENE_PNG_ENCODER_H
#define MIDSCENE_PNG_ENCODER_H

#include <stddef.h>
#include <stdint.h>

/* BGRX/BGRA bytes with explicit row padding and orientation. Alpha is ignored. */
struct raw_image {
  const unsigned char *data;
  size_t size;
  uint32_t width, height, stride;
  int y_inverted;
};

struct png_bytes {
  unsigned char *data;
  size_t size;
};

/* Returns 0 on success; caller frees encoded->data. On failure returns -1 and
 * leaves encoded empty. No Wayland connection or mutable capture state is used. */
int encode_png(const struct raw_image *image, int adaptive_filter,
               struct png_bytes *encoded);

#endif
