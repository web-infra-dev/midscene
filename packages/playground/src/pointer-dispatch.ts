import type {
  DeviceInputPrimitives,
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

function getPointerInput(
  input: InputPrimitives | DeviceInputPrimitives,
): PointerInputPrimitives {
  const flat = input as DeviceInputPrimitives;
  return (
    input.pointer ?? {
      tap: flat.tap?.bind(input),
      doubleClick: flat.doubleClick?.bind(input),
      longPress: flat.longPress?.bind(input),
      dragAndDrop: flat.dragAndDrop?.bind(input),
    }
  );
}

function getKeyboardInput(
  input: InputPrimitives | DeviceInputPrimitives,
): KeyboardInputPrimitives {
  const flat = input as DeviceInputPrimitives;
  return (
    input.keyboard ?? {
      keyboardPress: flat.keyboardPress?.bind(input),
      typeText: flat.typeText?.bind(input),
      clearInput: flat.clearInput?.bind(input),
    }
  );
}

function getTouchInput(
  input: InputPrimitives | DeviceInputPrimitives,
): TouchInputPrimitives {
  const flat = input as DeviceInputPrimitives;
  return (
    input.touch ?? {
      swipe: flat.swipe?.bind(input),
      pinch: flat.pinch?.bind(input),
    }
  );
}

/**
 * Translate an `/interact` request body into device input primitive calls.
 *
 * The dispatcher is deliberately a flat switch: each case is HTTP-protocol
 * adaptation (parse + range-check fields, hand them to the typed primitive),
 * not platform business logic.
 */
export async function dispatchPointer(
  input: InputPrimitives | DeviceInputPrimitives,
  body: Record<string, unknown>,
  getScreenSize: () => Promise<{ width: number; height: number }>,
): Promise<void> {
  const { actionType } = body;
  if (typeof actionType !== 'string' || !actionType) {
    throw new PointerInputError('actionType is required', 400);
  }

  const pointer = getPointerInput(input);
  const keyboard = getKeyboardInput(input);
  const touch = getTouchInput(input);

  switch (actionType) {
    case 'Tap':
      return ensureCapability(pointer.tap, 'Tap')(requirePoint(body), {
        duration: optionalNumber(body.duration, 'duration'),
      });

    case 'DoubleClick':
      return ensureCapability(
        pointer.doubleClick,
        'DoubleClick',
      )(requirePoint(body));

    case 'LongPress':
      return ensureCapability(pointer.longPress, 'LongPress')(
        requirePoint(body),
        {
          duration: optionalNumber(body.duration, 'duration'),
        },
      );

    case 'Swipe':
      return ensureCapability(touch.swipe, 'Swipe')(
        requirePoint(body),
        requirePoint(body, 'endX', 'endY'),
        {
          duration: optionalNumber(body.duration, 'duration'),
          repeat: optionalNumber(body.repeat, 'repeat'),
        },
      );

    case 'DragAndDrop':
      return ensureCapability(pointer.dragAndDrop, 'DragAndDrop')(
        requirePoint(body),
        requirePoint(body, 'endX', 'endY'),
      );

    case 'KeyboardPress':
      return ensureCapability(
        keyboard.keyboardPress,
        'KeyboardPress',
      )(requireString(body.keyName, 'keyName'));

    case 'Input': {
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
      if (mode !== 'typeOnly' && at) {
        await ensureCapability(pointer.tap, 'Tap')(at);
        await ensureCapability(keyboard.clearInput, 'ClearInput')(target);
      }
      if (mode === 'clear') return;
      if (!value) return;
      return ensureCapability(keyboard.typeText, 'Input')(value, {
        autoDismissKeyboard,
        target,
        replace: mode !== 'typeOnly',
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
