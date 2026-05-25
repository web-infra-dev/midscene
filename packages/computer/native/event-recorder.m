// Listen to macOS input events and stream compact JSON lines to stdout.
//
// Usage: event-recorder [displayId]
//
// The helper is intentionally read-only: it uses a listen-only CGEventTap and
// never mutates or swallows the user's real input events.

#include <ApplicationServices/ApplicationServices.h>
#include <CoreGraphics/CoreGraphics.h>
#include <signal.h>
#include <stdbool.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/time.h>

typedef struct RecorderContext {
  bool hasDisplayFilter;
  int screenIndex;
  CGDirectDisplayID displayId;
  CGRect displayBounds;
  unsigned long counter;
} RecorderContext;

static CFMachPortRef gEventTap = NULL;

static long long nowMs(void) {
  struct timeval tv;
  gettimeofday(&tv, NULL);
  return ((long long)tv.tv_sec * 1000LL) + ((long long)tv.tv_usec / 1000LL);
}

static bool pointInDisplay(const RecorderContext *ctx, CGPoint point) {
  if (!ctx->hasDisplayFilter) {
    return true;
  }
  return CGRectContainsPoint(ctx->displayBounds, point);
}

static double localX(const RecorderContext *ctx, CGPoint point) {
  if (!ctx->hasDisplayFilter) {
    return point.x;
  }
  return point.x - ctx->displayBounds.origin.x;
}

static double localY(const RecorderContext *ctx, CGPoint point) {
  if (!ctx->hasDisplayFilter) {
    return point.y;
  }
  return point.y - ctx->displayBounds.origin.y;
}

static double displayWidth(const RecorderContext *ctx) {
  return ctx->hasDisplayFilter ? ctx->displayBounds.size.width : 0;
}

static double displayHeight(const RecorderContext *ctx) {
  return ctx->hasDisplayFilter ? ctx->displayBounds.size.height : 0;
}

static const char *mouseButtonForType(CGEventType type) {
  switch (type) {
    case kCGEventRightMouseUp:
      return "right";
    case kCGEventOtherMouseUp:
      return "middle";
    default:
      return "left";
  }
}

static void emitClick(RecorderContext *ctx, CGPoint point, CGEventType type) {
  long long timestamp = nowMs();
  ctx->counter++;
  printf(
      "{\"type\":\"click\",\"button\":\"%s\",\"x\":%.2f,\"y\":%.2f,"
      "\"globalX\":%.2f,\"globalY\":%.2f,\"displayId\":%u,"
      "\"screenIndex\":%d,"
      "\"displayWidth\":%.0f,\"displayHeight\":%.0f,"
      "\"timestamp\":%lld,\"hashId\":\"computer-click-%lld-%lu\"}\n",
      mouseButtonForType(type), localX(ctx, point), localY(ctx, point),
      point.x, point.y, ctx->displayId, ctx->screenIndex, displayWidth(ctx),
      displayHeight(ctx), timestamp, timestamp, ctx->counter);
  fflush(stdout);
}

static void emitScroll(RecorderContext *ctx, CGPoint point, CGEventRef event) {
  int64_t deltaY =
      CGEventGetIntegerValueField(event, kCGScrollWheelEventPointDeltaAxis1);
  int64_t deltaX =
      CGEventGetIntegerValueField(event, kCGScrollWheelEventPointDeltaAxis2);

  if (deltaX == 0 && deltaY == 0) {
    deltaY = CGEventGetIntegerValueField(event, kCGScrollWheelEventDeltaAxis1);
    deltaX = CGEventGetIntegerValueField(event, kCGScrollWheelEventDeltaAxis2);
  }

  if (deltaX == 0 && deltaY == 0) {
    return;
  }

  long long timestamp = nowMs();
  ctx->counter++;
  printf(
      "{\"type\":\"scroll\",\"x\":%.2f,\"y\":%.2f,"
      "\"globalX\":%.2f,\"globalY\":%.2f,\"deltaX\":%lld,"
      "\"deltaY\":%lld,\"displayId\":%u,\"screenIndex\":%d,"
      "\"displayWidth\":%.0f,"
      "\"displayHeight\":%.0f,\"timestamp\":%lld,"
      "\"hashId\":\"computer-scroll-%lld-%lu\"}\n",
      localX(ctx, point), localY(ctx, point), point.x, point.y,
      (long long)deltaX, (long long)deltaY, ctx->displayId, ctx->screenIndex,
      displayWidth(ctx), displayHeight(ctx), timestamp, timestamp,
      ctx->counter);
  fflush(stdout);
}

static void emitKeydown(RecorderContext *ctx, CGPoint point, CGEventRef event) {
  int64_t keyCode =
      CGEventGetIntegerValueField(event, kCGKeyboardEventKeycode);
  uint64_t flags = CGEventGetFlags(event);
  long long timestamp = nowMs();
  ctx->counter++;
  printf(
      "{\"type\":\"keydown\",\"x\":%.2f,\"y\":%.2f,"
      "\"globalX\":%.2f,\"globalY\":%.2f,\"keyCode\":%lld,"
      "\"flags\":%llu,\"displayId\":%u,\"screenIndex\":%d,"
      "\"displayWidth\":%.0f,"
      "\"displayHeight\":%.0f,\"timestamp\":%lld,"
      "\"hashId\":\"computer-keydown-%lld-%lu\"}\n",
      localX(ctx, point), localY(ctx, point), point.x, point.y,
      (long long)keyCode, (unsigned long long)flags, ctx->displayId,
      ctx->screenIndex,
      displayWidth(ctx), displayHeight(ctx), timestamp, timestamp,
      ctx->counter);
  fflush(stdout);
}

static CGEventRef recorderCallback(
    CGEventTapProxy proxy,
    CGEventType type,
    CGEventRef event,
    void *userInfo) {
  (void)proxy;
  RecorderContext *ctx = (RecorderContext *)userInfo;
  CGPoint point = CGEventGetLocation(event);

  if (!pointInDisplay(ctx, point)) {
    return event;
  }

  switch (type) {
    case kCGEventLeftMouseUp:
    case kCGEventRightMouseUp:
    case kCGEventOtherMouseUp:
      emitClick(ctx, point, type);
      break;
    case kCGEventScrollWheel:
      emitScroll(ctx, point, event);
      break;
    case kCGEventKeyDown:
      emitKeydown(ctx, point, event);
      break;
    case kCGEventTapDisabledByTimeout:
    case kCGEventTapDisabledByUserInput:
      if (gEventTap) {
        CGEventTapEnable(gEventTap, true);
      }
      break;
    default:
      break;
  }

  return event;
}

static void stopRecorder(int signal) {
  (void)signal;
  CFRunLoopStop(CFRunLoopGetMain());
}

static bool setDisplayByScreenIndex(RecorderContext *ctx, int screenIndex) {
  uint32_t count = 0;
  CGError countErr = CGGetActiveDisplayList(0, NULL, &count);
  if (countErr != kCGErrorSuccess || count == 0) {
    fprintf(stderr, "No active displays found\n");
    return false;
  }

  CGDirectDisplayID *displays =
      (CGDirectDisplayID *)calloc(count, sizeof(CGDirectDisplayID));
  if (!displays) {
    fprintf(stderr, "Failed to allocate display list\n");
    return false;
  }

  CGError listErr = CGGetActiveDisplayList(count, displays, &count);
  if (listErr != kCGErrorSuccess) {
    free(displays);
    fprintf(stderr, "Failed to list active displays\n");
    return false;
  }

  CGDirectDisplayID mainDisplay = CGMainDisplayID();
  int orderedIndex = 0;
  CGDirectDisplayID selected = 0;

  for (uint32_t i = 0; i < count; i++) {
    if (displays[i] == mainDisplay) {
      if (orderedIndex == screenIndex) {
        selected = displays[i];
      }
      orderedIndex++;
      break;
    }
  }

  if (!selected) {
    for (uint32_t i = 0; i < count; i++) {
      if (displays[i] == mainDisplay) {
        continue;
      }
      if (orderedIndex == screenIndex) {
        selected = displays[i];
        break;
      }
      orderedIndex++;
    }
  }

  free(displays);

  if (!selected) {
    fprintf(stderr, "Display not found for screen index: %d\n", screenIndex);
    return false;
  }

  ctx->hasDisplayFilter = true;
  ctx->screenIndex = screenIndex;
  ctx->displayId = selected;
  ctx->displayBounds = CGDisplayBounds(selected);
  if (CGRectIsEmpty(ctx->displayBounds)) {
    fprintf(stderr, "Display bounds are empty for screen index: %d\n", screenIndex);
    return false;
  }
  return true;
}

static bool configureDisplayFilter(
    RecorderContext *ctx,
    const char *displayArg) {
  if (!displayArg || strlen(displayArg) == 0) {
    ctx->hasDisplayFilter = false;
    ctx->screenIndex = -1;
    ctx->displayId = CGMainDisplayID();
    ctx->displayBounds = CGDisplayBounds(ctx->displayId);
    return true;
  }

  char *end = NULL;
  long value = strtol(displayArg, &end, 10);
  if (!end || *end != '\0' || value < 0) {
    fprintf(stderr, "Invalid screen index: %s\n", displayArg);
    return false;
  }

  return setDisplayByScreenIndex(ctx, (int)value);
}

int main(int argc, const char **argv) {
  setvbuf(stdout, NULL, _IOLBF, 0);

  RecorderContext ctx;
  memset(&ctx, 0, sizeof(ctx));
  if (!configureDisplayFilter(&ctx, argc >= 2 ? argv[1] : NULL)) {
    return 2;
  }

  signal(SIGINT, stopRecorder);
  signal(SIGTERM, stopRecorder);

  CGEventMask mask =
      CGEventMaskBit(kCGEventLeftMouseUp) |
      CGEventMaskBit(kCGEventRightMouseUp) |
      CGEventMaskBit(kCGEventOtherMouseUp) |
      CGEventMaskBit(kCGEventScrollWheel) |
      CGEventMaskBit(kCGEventKeyDown);

  gEventTap = CGEventTapCreate(
      kCGSessionEventTap,
      kCGHeadInsertEventTap,
      kCGEventTapOptionListenOnly,
      mask,
      recorderCallback,
      &ctx);

  if (!gEventTap) {
    fprintf(
        stderr,
        "Failed to create macOS event tap. Grant Accessibility/Input Monitoring "
        "permission to the application running Studio and relaunch it.\n");
    return 1;
  }

  CFRunLoopSourceRef runLoopSource =
      CFMachPortCreateRunLoopSource(kCFAllocatorDefault, gEventTap, 0);
  CFRunLoopAddSource(CFRunLoopGetCurrent(), runLoopSource, kCFRunLoopCommonModes);
  CGEventTapEnable(gEventTap, true);

  CFRunLoopRun();

  CGEventTapEnable(gEventTap, false);
  CFRunLoopRemoveSource(
      CFRunLoopGetCurrent(), runLoopSource, kCFRunLoopCommonModes);
  CFRelease(runLoopSource);
  CFRelease(gEventTap);
  gEventTap = NULL;
  return 0;
}
