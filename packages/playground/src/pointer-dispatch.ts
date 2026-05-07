import type { PointerCapability, PointerPoint } from '@midscene/core/device';

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

/**
 * Translate an `/interact` request body into a PointerCapability call.
 *
 * The dispatcher is deliberately a flat switch: each case is HTTP-protocol
 * adaptation (parse + range-check fields, hand them to the typed pointer
 * method), not business logic. Adding a new pointer method to
 * PointerCapability adds one case here and one method on each supporting
 * device — no AI-vocabulary coupling.
 */
export async function dispatchPointer(
  pointer: PointerCapability,
  body: Record<string, unknown>,
): Promise<void> {
  const { actionType } = body;
  if (typeof actionType !== 'string' || !actionType) {
    throw new PointerInputError('actionType is required', 400);
  }

  switch (actionType) {
    case 'Tap':
      return pointer.tap(requirePoint(body), {
        duration: optionalNumber(body.duration, 'duration'),
      });

    case 'DoubleClick':
      return pointer.doubleClick(requirePoint(body));

    case 'LongPress':
      return pointer.longPress(requirePoint(body), {
        duration: optionalNumber(body.duration, 'duration'),
      });

    case 'Swipe':
      return pointer.swipe(
        requirePoint(body),
        requirePoint(body, 'endX', 'endY'),
        {
          duration: optionalNumber(body.duration, 'duration'),
          repeat: optionalNumber(body.repeat, 'repeat'),
        },
      );

    case 'DragAndDrop':
      return pointer.dragAndDrop(
        requirePoint(body),
        requirePoint(body, 'endX', 'endY'),
      );

    case 'KeyboardPress':
      return pointer.keyboardPress(requireString(body.keyName, 'keyName'));

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
      return pointer.input(value, { at, mode, autoDismissKeyboard });
    }

    case 'Pinch':
      return ensureCapability(pointer.pinch, 'Pinch')(requirePoint(body), {
        direction: ((): 'in' | 'out' => {
          const d = body.direction;
          if (d !== 'in' && d !== 'out') {
            throw new PointerInputError('direction must be "in" or "out"', 400);
          }
          return d;
        })(),
        distance: optionalNumber(body.distance, 'distance'),
        duration: optionalNumber(body.duration, 'duration'),
      });

    default:
      throw new PointerInputError(`Unknown actionType "${actionType}"`, 404);
  }
}
