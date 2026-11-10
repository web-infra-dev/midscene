/** A compact, transport-safe representation of an unknown thrown value. */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  code?: string | number;
  status?: string | number;
  requestId?: string | number;
}

const maxSerializedStringLength = 4_096;
const truncatedStringSuffix = '… [truncated]';

interface SerializedErrorResult {
  error: SerializedError;
  hasMessage: boolean;
}

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

function readBoundedDiagnostic(
  error: object,
  keys: readonly PropertyKey[],
): string | number | undefined {
  for (const key of keys) {
    const value = safelyReadProperty(error, key);
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      return truncateSerializedErrorString(value);
    }
  }
  return undefined;
}

/** Apply the same string bound used by {@link serializeError}. */
export function truncateSerializedErrorString(value: string): string {
  if (value.length <= maxSerializedStringLength) {
    return value;
  }

  return `${value.slice(
    0,
    maxSerializedStringLength - truncatedStringSuffix.length,
  )}${truncatedStringSuffix}`;
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
 * rather than `Error` instances. This helper returns the bounded message from
 * {@link serializeError}; message-less objects are summarized from the same
 * diagnostic whitelist instead of serializing arbitrary payload fields.
 */
export function getErrorMessage(error: unknown): string {
  const result = serializeErrorValue(error);
  const serialized = result.error;
  if (!isObject(error) || result.hasMessage) {
    return serialized.message;
  }

  const summary: SerializedError = {
    name: serialized.name,
    message: serialized.message,
  };
  for (const key of ['code', 'status', 'requestId'] as const) {
    const value = serialized[key];
    if (value !== undefined) {
      summary[key] = value;
    }
  }

  return truncateSerializedErrorString(JSON.stringify(summary));
}

/** Safely read a stack trace from an unknown thrown value when one exists. */
export function getErrorStack(error: unknown): string | undefined {
  if (!isObject(error)) {
    return undefined;
  }

  const stack = safelyReadProperty(error, 'stack');
  return typeof stack === 'string' ? stack : undefined;
}

function serializeErrorValue(error: unknown): SerializedErrorResult {
  if (!isObject(error)) {
    const message = truncateSerializedErrorString(String(error));
    return {
      error: {
        name: 'NonError',
        message: message.trim() ? message : 'Empty string thrown',
      },
      hasMessage: Boolean(message.trim()),
    };
  }

  const name = safelyReadProperty(error, 'name');
  const serializedName = truncateSerializedErrorString(
    typeof name === 'string' && name ? name : 'Error',
  );
  const message = extractStringMessage(error);
  const serialized: SerializedError = {
    name: serializedName,
    message: truncateSerializedErrorString(
      message ?? `${serializedName} without a message`,
    ),
  };

  const stack = getErrorStack(error);
  if (stack) {
    serialized.stack = truncateSerializedErrorString(stack);
  }

  const code = readBoundedDiagnostic(error, ['code']);
  const status = readBoundedDiagnostic(error, ['status', 'statusCode']);
  const requestId = readBoundedDiagnostic(error, ['requestId', 'requestID']);
  if (code !== undefined) serialized.code = code;
  if (status !== undefined) serialized.status = status;
  if (requestId !== undefined) serialized.requestId = requestId;

  return {
    error: serialized,
    hasMessage: message !== undefined,
  };
}

/**
 * Extract a small, bounded diagnostic object suitable for JSON and test-runner
 * transports. Only message, stack, and a few common diagnostic fields are
 * retained. Arbitrary payloads are never visited, and nested errors are only
 * inspected one level deep when the outer value has no message of its own.
 */
export function serializeError(error: unknown): SerializedError {
  return serializeErrorValue(error).error;
}
