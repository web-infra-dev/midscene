import type {
  KeyboardInputPrimitives,
  MobileInputPrimitives,
  PointerPoint,
  ScrollInputPrimitives,
  TouchInputPrimitives,
} from '@midscene/core/device';

import {
  ANDROID_SYSTEM_KEY_CODES,
  KEYCODE_BACKSPACE,
  KEYCODE_FORWARD_DELETE,
  KEYCODE_MOVE_END,
  isKeyCombination,
  resolveKeyCode,
} from './keycodes';
import {
  DEFAULT_SCROLL_DURATION_MS,
  DEFAULT_SCROLL_SETTLE_MS,
  DEFAULT_SCROLL_UNTIL_TIMES,
  FAST_SCROLL_DURATION_MS,
  type ScreenSize,
  computeScrollGesture,
  computeScrollRequest,
  scrollUntilDelta,
} from './scroll-math';
import type { AndroidTransport, Point } from './transport/types';

/**
 * Adapts transport primitives to the input surface the core action space
 * expects, so `createDefaultMobileActions` can drive any transport.
 *
 * Anything a transport cannot do is simply not registered: `pinch` needs
 * multi-touch injection that `input swipe` cannot express, so it is omitted
 * instead of silently degrading into two separate swipes.
 */

/** Mirrors `packages/android`: clearing sends 100 delete pairs after MOVE_END. */
export const CLEAR_INPUT_KEY_REPEAT_COUNT = 100;
const DOUBLE_TAP_INTERVAL_MS = 80;
const DEFAULT_LONG_PRESS_DURATION_MS = 2000;
const DEFAULT_SWIPE_DURATION_MS = 300;

export interface TransportInputPrimitivesOptions {
  transport: AndroidTransport;
  /** Screen size of the display the primitives act on. */
  getScreenSize: () => Promise<ScreenSize>;
  sleep?: (ms: number) => Promise<void>;
  displayId?: number;
  /** Delay after a single scroll action, so the view can settle. */
  scrollSettleMs?: number;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Keycode batch that clears the focused field, matching the ADB path. */
export function buildClearInputKeyCodes(
  repeatCount = CLEAR_INPUT_KEY_REPEAT_COUNT,
): number[] {
  const keyCodes: number[] = [KEYCODE_MOVE_END];
  for (let index = 0; index < repeatCount; index += 1) {
    keyCodes.push(KEYCODE_BACKSPACE, KEYCODE_FORWARD_DELETE);
  }

  return keyCodes;
}

function readElementCenter(target: unknown): Point | undefined {
  const center = (target as { center?: unknown } | undefined)?.center;
  if (!Array.isArray(center) || center.length < 2) {
    return undefined;
  }

  const [x, y] = center as [unknown, unknown];
  if (typeof x !== 'number' || typeof y !== 'number') {
    return undefined;
  }

  return { x, y };
}

export function createTransportInputPrimitives(
  options: TransportInputPrimitivesOptions,
): MobileInputPrimitives {
  const { transport, getScreenSize } = options;
  const sleep = options.sleep ?? defaultSleep;
  const scrollSettleMs = options.scrollSettleMs ?? DEFAULT_SCROLL_SETTLE_MS;

  const inputOptions = () => ({ displayId: options.displayId });

  const tap: MobileInputPrimitives['pointer']['tap'] = async (
    point: PointerPoint,
    tapOptions,
  ) => {
    await transport.tap(point.x, point.y, {
      ...inputOptions(),
      durationMs: tapOptions?.duration,
    });
  };

  const clearInput: KeyboardInputPrimitives['clearInput'] = async (target) => {
    const center = readElementCenter(target);
    if (center) {
      await transport.tap(center.x, center.y, inputOptions());
    }

    await transport.keyEvent(buildClearInputKeyCodes(), inputOptions());
  };

  const typeText: KeyboardInputPrimitives['typeText'] = async (value, opts) => {
    const center = readElementCenter(opts?.target);
    if (center) {
      if (opts?.replace !== false) {
        await clearInput(opts?.target);
      } else {
        await transport.tap(center.x, center.y, inputOptions());
      }
    }

    if (opts?.focusOnly) {
      return;
    }

    await transport.inputText(value, inputOptions());
  };

  const keyboard: KeyboardInputPrimitives = {
    keyboardPress: async (keyName) => {
      if (isKeyCombination(keyName)) {
        throw new Error(
          `keyboardPress does not support key combinations: ${JSON.stringify(
            keyName,
          )}`,
        );
      }

      const keyCode = resolveKeyCode(keyName);
      if (keyCode === undefined) {
        throw new Error(`Unsupported key: ${JSON.stringify(keyName)}`);
      }

      await transport.keyEvent(keyCode, inputOptions());
    },
    typeText,
    clearInput,
    cursorMove: async (direction, times = 1) => {
      const keyCode = resolveKeyCode(
        direction === 'left' ? 'ArrowLeft' : 'ArrowRight',
      ) as number;
      for (let index = 0; index < times; index += 1) {
        await transport.keyEvent(keyCode, inputOptions());
      }
    },
  };

  const swipe: TouchInputPrimitives['swipe'] = async (start, end, opts) => {
    const duration = opts?.duration ?? DEFAULT_SWIPE_DURATION_MS;
    const repeatCount = opts?.repeat ?? 1;
    for (let index = 0; index < repeatCount; index += 1) {
      await transport.swipe(start, end, {
        ...inputOptions(),
        durationMs: duration,
      });
    }
  };

  const scroll: ScrollInputPrimitives['scroll'] = async (param) => {
    const display = await getScreenSize();
    const startPoint = readElementCenter(param?.locate);
    const scrollType = param?.scrollType ?? 'singleAction';

    if (scrollType === 'singleAction') {
      const gesture = computeScrollRequest(
        {
          direction: param?.direction,
          distance: param?.distance,
          startPoint,
        },
        display,
      );
      await transport.swipe(gesture.start, gesture.end, {
        ...inputOptions(),
        durationMs: DEFAULT_SCROLL_DURATION_MS,
      });
      await sleep(500);
      return;
    }

    const directionByScrollType = {
      scrollToBottom: 'down',
      scrollToTop: 'up',
      scrollToRight: 'right',
      scrollToLeft: 'left',
    } as const;

    const direction =
      directionByScrollType[scrollType as keyof typeof directionByScrollType];
    if (!direction) {
      throw new Error(`Unknown scroll type: ${String(scrollType)}`);
    }

    const delta = scrollUntilDelta(direction);
    for (let index = 0; index < DEFAULT_SCROLL_UNTIL_TIMES; index += 1) {
      const gesture = computeScrollGesture(display, delta.x, delta.y);
      await transport.swipe(gesture.start, gesture.end, {
        ...inputOptions(),
        durationMs: FAST_SCROLL_DURATION_MS,
      });
    }

    await sleep(scrollSettleMs);
  };

  return {
    pointer: {
      tap,
      doubleClick: async (point) => {
        await tap(point);
        await sleep(DOUBLE_TAP_INTERVAL_MS);
        await tap(point);
      },
      longPress: async (point, opts) => {
        await transport.tap(point.x, point.y, {
          ...inputOptions(),
          durationMs: opts?.duration ?? DEFAULT_LONG_PRESS_DURATION_MS,
        });
      },
      dragAndDrop: async (from, to) => {
        await transport.swipe(from, to, {
          ...inputOptions(),
          durationMs: DEFAULT_SCROLL_DURATION_MS,
        });
      },
    },
    keyboard,
    touch: {
      swipe,
    },
    scroll: {
      scroll,
    },
    system: {
      backButton: async () => {
        await transport.keyEvent(ANDROID_SYSTEM_KEY_CODES.back, inputOptions());
      },
      homeButton: async () => {
        await transport.keyEvent(ANDROID_SYSTEM_KEY_CODES.home, inputOptions());
      },
      recentAppsButton: async () => {
        await transport.keyEvent(
          ANDROID_SYSTEM_KEY_CODES.recentApps,
          inputOptions(),
        );
      },
    },
  };
}
