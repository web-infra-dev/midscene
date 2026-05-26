// Synthesize trackpad-like scroll-wheel events with proper gesture phase so
// that WebKit (Safari) and other AppKit scroll views accept them without
// requiring keyboard focus. libnut's CGEventCreateScrollWheelEvent path
// omits the phase fields, which modern scroll views filter out.
//
// Usage: phased-scroll <up|down|left|right> <totalPixels> [steps]
//
// IMPORTANT: after editing this file you MUST rebuild the committed binary:
//   pnpm --filter @midscene/computer run build:native
// and commit the resulting bin/darwin/phased-scroll in the same change.
// The prepublishOnly hook also rebuilds it on publish, but drift during
// development is only visible if you rebuild locally.

#include <ApplicationServices/ApplicationServices.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <unistd.h>

// Field identifiers (documented in CGEventTypes.h, duplicated here to avoid
// requiring a specific SDK version).
static const CGEventField kScrollPhase = 99;            // kCGScrollWheelEventScrollPhase
static const CGEventField kIsContinuous = 88;           // kCGScrollWheelEventIsContinuous

// NSEventPhase bitmask
static const int64_t kPhaseBegan = 1;
static const int64_t kPhaseChanged = 2;
static const int64_t kPhaseEnded = 4;

static void postScroll(int32_t dx, int32_t dy, int64_t phase) {
  CGEventRef ev = CGEventCreateScrollWheelEvent2(
      NULL, kCGScrollEventUnitPixel, 2, dy, dx, 0);
  if (!ev) return;
  CGEventSetIntegerValueField(ev, kIsContinuous, 1);
  CGEventSetIntegerValueField(ev, kScrollPhase, phase);
  CGEventPost(kCGHIDEventTap, ev);
  CFRelease(ev);
}

int main(int argc, const char **argv) {
  if (argc < 3) {
    fprintf(stderr, "usage: %s <up|down|left|right> <pixels> [steps]\n", argv[0]);
    return 2;
  }
  const char *dir = argv[1];
  int total = atoi(argv[2]);
  if (total < 0) total = -total;
  int steps = (argc >= 4) ? atoi(argv[3]) : 20;
  if (steps < 1) steps = 1;

  int horizontal = (strcmp(dir, "left") == 0 || strcmp(dir, "right") == 0);
  int sign = (strcmp(dir, "up") == 0 || strcmp(dir, "left") == 0) ? 1 : -1;
  int perStep = total / steps;
  if (perStep < 1) perStep = 1;

  postScroll(0, 0, kPhaseBegan);
  usleep(20000);

  for (int i = 0; i < steps; i++) {
    int32_t delta = sign * perStep;
    if (horizontal) postScroll(delta, 0, kPhaseChanged);
    else            postScroll(0, delta, kPhaseChanged);
    usleep(16000);
  }

  postScroll(0, 0, kPhaseEnded);
  return 0;
}
