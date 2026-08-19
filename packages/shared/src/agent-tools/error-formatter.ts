/** A compact, transport-safe representation of an unknown thrown value. */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
  code?: string | number;
  status?: string | number;
  statusCode?: string | number;
  requestId?: string | number;
  requestID?: string | number;
  type?: string | number;
  errno?: string | number;
  syscall?: string | number;
  hostname?: string | number;
}

const stringOrNumberDiagnosticKeys = [
  'code',
  'status',
  'statusCode',
  'requestId',
  'requestID',
  'type',
  'errno',
  'syscall',
  'hostname',
] as const satisfies ReadonlyArray<keyof SerializedError>;

const maxSerializedCauseDepth = 2;
const maxSerializedStringLength = 4_096;
const truncatedStringSuffix = '… [truncated]';

function isObject(error: unknown): error is object {
  return (
    (typeof error === 'object' && error !== null) || typeof error === 'function'
  );
}

function safelyReadProperty(error: object, key: PropertyKey): unknown {
  try {
    return Reflect.get(error, key);
  } catch {
    return undefined;
  }
}

function truncateSerializedString(value: string): string {
  if (value.length <= maxSerializedStringLength) {
    return value;
  }

  return `${value.slice(
    0,
    maxSerializedStringLength - truncatedStringSuffix.length,
  )}${truncatedStringSuffix}`;
}

function safelyStringifyObject(error: object): string {
  try {
    const serialized = JSON.stringify(error);
    if (serialized !== undefined) {
      return serialized;
    }
  } catch {
    // Fall through to the object's type tag.
  }

  try {
    return Object.prototype.toString.call(error);
  } catch {
    return 'Unknown thrown value';
  }
}

function isErrorInstance(error: object): error is Error {
  try {
    return error instanceof Error;
  } catch {
    return false;
  }
}

function readNonEmptyMessage(error: object): string | undefined {
  const message = safelyReadProperty(error, 'message');
  return typeof message === 'string' && message ? message : undefined;
}

function extractStringMessage(error: object): string | undefined {
  const directMessage = readNonEmptyMessage(error);
  if (directMessage) {
    return directMessage;
  }

  for (const nestedKey of ['error', 'cause'] as const) {
    const nestedError = safelyReadProperty(error, nestedKey);
    if (!isObject(nestedError)) {
      continue;
    }

    const nestedMessage = readNonEmptyMessage(nestedError);
    if (nestedMessage) {
      return nestedMessage;
    }
  }

  return undefined;
}

/**
 * Extract a human-readable message from an unknown thrown value.
 *
 * Many SDK/transport layers reject with structured objects (e.g.
 * `{ code, message }`, `{ error: { message } }`, `{ cause: { message } }`)
 * rather than `Error` instances. This helper reads those common shapes without
 * trusting property getters, then falls back to a printable object summary.
 */
export function getErrorMessage(error: unknown): string {
  if (!isObject(error)) {
    return String(error);
  }

  if (isErrorInstance(error)) {
    const message = safelyReadProperty(error, 'message');
    if (typeof message === 'string') {
      return message;
    }
  }

  return extractStringMessage(error) ?? safelyStringifyObject(error);
}

/** Safely read a stack trace from an unknown thrown value when one exists. */
export function getErrorStack(error: unknown): string | undefined {
  if (!isObject(error)) {
    return undefined;
  }

  const stack = safelyReadProperty(error, 'stack');
  return typeof stack === 'string' ? stack : undefined;
}

function serializeErrorValue(
  error: unknown,
  depth: number,
  seen: WeakSet<object>,
): SerializedError {
  if (!isObject(error)) {
    return {
      name: 'NonError',
      message: truncateSerializedString(String(error)),
    };
  }

  if (seen.has(error)) {
    return {
      name: 'CircularError',
      message: 'Circular error cause',
    };
  }
  seen.add(error);

  const name = safelyReadProperty(error, 'name');
  const serializedName = truncateSerializedString(
    typeof name === 'string' && name ? name : 'Error',
  );
  const message = extractStringMessage(error);
  const serialized: SerializedError = {
    name: serializedName,
    message: truncateSerializedString(
      message ?? `${serializedName} without a message`,
    ),
  };

  const stack = getErrorStack(error);
  if (stack) {
    serialized.stack = truncateSerializedString(stack);
  }

  for (const key of stringOrNumberDiagnosticKeys) {
    const value = safelyReadProperty(error, key);
    if (typeof value === 'string' || typeof value === 'number') {
      serialized[key] =
        typeof value === 'string' ? truncateSerializedString(value) : value;
    }
  }

  const cause = safelyReadProperty(error, 'cause');
  if (cause !== undefined && depth < maxSerializedCauseDepth) {
    serialized.cause = serializeErrorValue(cause, depth + 1, seen);
  }

  return serialized;
}

/**
 * Convert an unknown thrown value to a bounded diagnostic object suitable for
 * JSON and test-runner transports. Arbitrary payload fields are omitted, cause
 * chains are limited to two links, string fields are capped, and circular or
 * throwing properties cannot make serialization fail.
 */
export function serializeError(error: unknown): SerializedError {
  return serializeErrorValue(error, 0, new WeakSet());
}
