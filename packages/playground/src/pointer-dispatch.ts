import type {
  InputPrimitives,
  KeyboardInputPrimitives,
  PointerInputPrimitives,
  PointerPoint,
  TouchInputPrimitives,
} from '@midscene/core/device';
import { normalizePinchParam } from '@midscene/core/device';

/**
 * Thrown when an /interact request is malformed (missing field, wrong type)
 * or names an action / capability that the connected device does not support.
 * The route handler maps {400, 404} onto the HTTP response.
 */
export class PointerInputError extends Error {
  constructor(
    message: string,
    public statusCode: 400 | 404,
  ) {
    super(message);
    this.name = 'PointerInputError';
  }
}

function requireNumber(value: unknown, field: string): number {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    throw new PointerInputError(`${field} must be a number`, 400);
  }
  return value;
}

function optionalNumber(value: unknown, field: string): number | undefined {
  if (value === undefined) return undefined;
  return requireNumber(value, field);
}

function requireString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new PointerInputError(`${field} must be a string`, 400);
  }
  return value;
}

function requirePoint(
  body: Record<string, unknown>,
  xField: 'x' | 'endX' = 'x',
  yField: 'y' | 'endY' = 'y',
): PointerPoint {
  return {
    x: requireNumber(body[xField], xField),
    y: requireNumber(body[yField], yField),
  };
}

function ensureCapability<T>(
  fn: T | undefined,
  actionType: string,
): NonNullable<T> {
  if (typeof fn !== 'function') {
    throw new PointerInputError(
      `${actionType} is not supported on this device`,
      404,
    );
  }
  return fn as NonNullable<T>;
}

function getPointerInput(input: InputPrimitives): PointerInputPrimitives {
  if (!input.pointer) {
    throw new PointerInputError(
      'Pointer input is not supported on this device',
      404,
    );
  }
  return input.pointer;
}

function getKeyboardInput(input: InputPrimitives): KeyboardInputPrimitives {
  if (!input.keyboard) {
    throw new PointerInputError(
      'Keyboard input is not supported on this device',
      404,
    );
  }
  return input.keyboard;
}

function getTouchInput(input: InputPrimitives): TouchInputPrimitives {
  if (!input.touch) {
    throw new PointerInputError(
      'Touch input is not supported on this device',
      404,
    );
  }
  return input.touch;
}

function getScrollInput(input: InputPrimitives) {
  if (!input.scroll) {
    throw new PointerInputError(
      'Scroll input is not supported on this device',
      404,
    );
  }
  return input.scroll;
}

/**
 * Translate an `/interact` request body into device input primitive calls.
 *
 * The dispatcher is deliberately a flat switch: each case is HTTP-protocol
 * adaptation (parse + range-check fields, hand them to the typed primitive),
 * not platform business logic.
 */
export async function dispatchPointer(
  input: InputPrimitives,
  body: Record<string, unknown>,
  getScreenSize: () => Promise<{ width: number; height: number }>,
): Promise<void> {
  const { actionType } = body;
  if (typeof actionType !== 'string' || !actionType) {
    throw new PointerInputError('actionType is required', 400);
  }

  switch (actionType) {
    case 'Tap': {
      const pointer = getPointerInput(input);
      return ensureCapability(pointer.tap, 'Tap')(requirePoint(body), {
        duration: optionalNumber(body.duration, 'duration'),
      });
    }

    case 'DoubleClick': {
      const pointer = getPointerInput(input);
      return ensureCapability(
        pointer.doubleClick,
        'DoubleClick',
      )(requirePoint(body));
    }

    case 'LongPress': {
      const pointer = getPointerInput(input);
      return ensureCapability(pointer.longPress, 'LongPress')(
        requirePoint(body),
        {
          duration: optionalNumber(body.duration, 'duration'),
        },
      );
    }

    case 'Swipe': {
      const touch = getTouchInput(input);
      return ensureCapability(touch.swipe, 'Swipe')(
        requirePoint(body),
        requirePoint(body, 'endX', 'endY'),
        {
          duration: optionalNumber(body.duration, 'duration'),
          repeat: optionalNumber(body.repeat, 'repeat'),
        },
      );
    }

    case 'DragAndDrop': {
      const pointer = getPointerInput(input);
      return ensureCapability(pointer.dragAndDrop, 'DragAndDrop')(
        requirePoint(body),
        requirePoint(body, 'endX', 'endY'),
      );
    }

    case 'KeyboardPress': {
      const keyboard = getKeyboardInput(input);
      return ensureCapability(
        keyboard.keyboardPress,
        'KeyboardPress',
      )(requireString(body.keyName, 'keyName'));
    }

    case 'Input': {
      const keyboard = getKeyboardInput(input);
      const value = requireString(body.value, 'value');
      const at =
        typeof body.x === 'number' && typeof body.y === 'number'
          ? requirePoint(body)
          : undefined;
      const mode =
        typeof body.mode === 'string'
          ? (body.mode as 'replace' | 'clear' | 'typeOnly')
          : undefined;
      const autoDismissKeyboard =
        typeof body.autoDismissKeyboard === 'boolean'
          ? body.autoDismissKeyboard
          : undefined;
      const target = at
        ? {
            center: [at.x, at.y] as [number, number],
            rect: { left: at.x, top: at.y, width: 1, height: 1 },
            description: 'manual input target',
          }
        : undefined;
      if (mode === 'clear') {
        await ensureCapability(keyboard.clearInput, 'ClearInput')(target);
        return;
      }
      if (!value) return;
      return ensureCapability(keyboard.typeText, 'Input')(value, {
        autoDismissKeyboard,
        target,
        replace: mode !== 'typeOnly',
      });
    }

    case 'Scroll': {
      const scroll = getScrollInput(input);
      const x =
        typeof body.x === 'number' ? requireNumber(body.x, 'x') : undefined;
      const y =
        typeof body.y === 'number' ? requireNumber(body.y, 'y') : undefined;
      const direction =
        body.direction === 'up' ||
        body.direction === 'down' ||
        body.direction === 'left' ||
        body.direction === 'right'
          ? body.direction
          : 'down';
      const scrollType =
        body.scrollType === 'scrollToBottom' ||
        body.scrollType === 'scrollToTop' ||
        body.scrollType === 'scrollToLeft' ||
        body.scrollType === 'scrollToRight' ||
        body.scrollType === 'singleAction'
          ? body.scrollType
          : 'singleAction';
      const distance =
        typeof body.distance === 'number'
          ? requireNumber(body.distance, 'distance')
          : undefined;
      return ensureCapability(
        scroll.scroll,
        'Scroll',
      )({
        direction,
        scrollType,
        distance,
        locate:
          x !== undefined && y !== undefined
            ? {
                center: [x, y],
                rect: { left: x, top: y, width: 1, height: 1 },
                description: 'manual scroll target',
              }
            : undefined,
      });
    }

    case 'Pinch': {
      const center = requirePoint(body);
      const direction = ((): 'in' | 'out' => {
        const d = body.direction;
        if (d !== 'in' && d !== 'out') {
          throw new PointerInputError('direction must be "in" or "out"', 400);
        }
        return d;
      })();
      const touch = getTouchInput(input);
      const { startDistance, endDistance, duration } = normalizePinchParam(
        {
          locate: {
            center: [center.x, center.y],
            rect: { left: center.x, top: center.y, width: 1, height: 1 },
            description: 'manual pinch target',
          },
          direction,
          distance: optionalNumber(body.distance, 'distance'),
          duration: optionalNumber(body.duration, 'duration'),
        },
        await getScreenSize(),
      );
      return ensureCapability(touch.pinch, 'Pinch')(center, {
        startDistance,
        endDistance,
        duration,
      });
    }

    default:
      throw new PointerInputError(`Unknown actionType "${actionType}"`, 404);
  }
}
