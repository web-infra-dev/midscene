// SPDX-License-Identifier: MIT
#include "png-encoder.h"
#include <png.h>
#include <stdlib.h>
#include <string.h>

struct encoder_state {
  struct png_bytes output;
  size_t capacity;
  unsigned char *row;
};

static void write_bytes(png_structp png, png_bytep data, png_size_t size) {
  struct encoder_state *state = png_get_io_ptr(png);
  if (size > SIZE_MAX - state->output.size) png_error(png, "PNG size overflow");
  size_t required = state->output.size + size;
  if (required > state->capacity) {
    size_t capacity = required <= SIZE_MAX / 2 ? required * 2 : required;
    void *next = realloc(state->output.data, capacity);
    if (!next) png_error(png, "PNG allocation failed");
    state->output.data = next;
    state->capacity = capacity;
  }
  memcpy(state->output.data + state->output.size, data, size);
  state->output.size += size;
}

static void flush_bytes(png_structp png) { (void)png; }

int encode_png(const struct raw_image *image, int adaptive_filter,
               struct png_bytes *encoded) {
  if (!encoded) return -1;
  *encoded = (struct png_bytes){0};
  if (!image || !image->data || !image->width || !image->height ||
      image->width > UINT32_MAX / 4 || image->stride < image->width * 4 ||
      image->height > SIZE_MAX / image->stride ||
      image->size < (size_t)image->stride * image->height) return -1;

  struct encoder_state *state = calloc(1, sizeof *state);
  if (!state) return -1;
  state->row = malloc((size_t)image->width * 3);
  png_structp png = png_create_write_struct(PNG_LIBPNG_VER_STRING, NULL, NULL, NULL);
  png_infop info = png ? png_create_info_struct(png) : NULL;
  if (!state->row || !png || !info) {
    if (png) png_destroy_write_struct(&png, info ? &info : NULL);
    free(state->row);
    free(state);
    return -1;
  }
  // Mutable buffers live on the heap so libpng's longjmp can clean them safely.
  if (setjmp(png_jmpbuf(png))) {
    png_destroy_write_struct(&png, &info);
    free(state->output.data);
    free(state->row);
    free(state);
    return -1;
  }
  png_set_write_fn(png, state, write_bytes, flush_bytes);
  png_set_compression_level(png, 1);
  // NONE and adaptive are both lossless; keep the controlled benchmark choice.
  if (!adaptive_filter) png_set_filter(png, PNG_FILTER_TYPE_BASE, PNG_FILTER_NONE);
  png_set_IHDR(png, info, image->width, image->height, 8, PNG_COLOR_TYPE_RGB,
               PNG_INTERLACE_NONE, PNG_COMPRESSION_TYPE_DEFAULT, PNG_FILTER_TYPE_DEFAULT);
  png_write_info(png, info);
  for (uint32_t y = 0; y < image->height; y++) {
    uint32_t source_y = image->y_inverted ? image->height - 1 - y : y;
    const unsigned char *source = image->data + (size_t)source_y * image->stride;
    for (uint32_t x = 0; x < image->width; x++) {
      state->row[x * 3] = source[x * 4 + 2];
      state->row[x * 3 + 1] = source[x * 4 + 1];
      state->row[x * 3 + 2] = source[x * 4];
    }
    png_write_row(png, state->row);
  }
  png_write_end(png, NULL);
  png_destroy_write_struct(&png, &info);
  *encoded = state->output;
  free(state->row);
  free(state);
  return 0;
}
