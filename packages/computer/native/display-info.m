// Print the macOS display geometry used by @midscene/computer as JSON.
//
// The order intentionally follows screenshot-desktop's public macOS contract:
// primary display first, then the remaining active displays. Studio stores that
// screen index in form values, so native helpers must use the same index rather
// than treating it as a CGDirectDisplayID.

#include <ApplicationServices/ApplicationServices.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>

static void printDisplay(
    int screenIndex,
    CGDirectDisplayID displayId,
    bool primary,
    bool *first) {
  CGRect bounds = CGDisplayBounds(displayId);
  if (*first) {
    *first = false;
  } else {
    printf(",");
  }
  printf(
      "{\"screenIndex\":%d,\"cgDisplayId\":%u,\"primary\":%s,"
      "\"bounds\":{\"x\":%.0f,\"y\":%.0f,\"width\":%.0f,\"height\":%.0f}}",
      screenIndex, displayId, primary ? "true" : "false", bounds.origin.x,
      bounds.origin.y, bounds.size.width, bounds.size.height);
}

int main(void) {
  uint32_t count = 0;
  CGError countErr = CGGetActiveDisplayList(0, NULL, &count);
  if (countErr != kCGErrorSuccess || count == 0) {
    fprintf(stderr, "No active displays found\n");
    return 1;
  }

  CGDirectDisplayID *displays =
      (CGDirectDisplayID *)calloc(count, sizeof(CGDirectDisplayID));
  if (!displays) {
    fprintf(stderr, "Failed to allocate display list\n");
    return 1;
  }

  CGError listErr = CGGetActiveDisplayList(count, displays, &count);
  if (listErr != kCGErrorSuccess) {
    free(displays);
    fprintf(stderr, "Failed to list active displays\n");
    return 1;
  }

  CGDirectDisplayID mainDisplay = CGMainDisplayID();
  bool first = true;
  int screenIndex = 0;

  printf("{\"displays\":[");
  for (uint32_t i = 0; i < count; i++) {
    if (displays[i] == mainDisplay) {
      printDisplay(screenIndex++, displays[i], true, &first);
      break;
    }
  }
  for (uint32_t i = 0; i < count; i++) {
    if (displays[i] == mainDisplay) {
      continue;
    }
    printDisplay(screenIndex++, displays[i], false, &first);
  }
  printf("]}\n");

  free(displays);
  return 0;
}
