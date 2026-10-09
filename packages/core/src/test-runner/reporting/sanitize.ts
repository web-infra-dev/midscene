import type {
  TestRunReportError,
  TestRunReportValue,
} from '../../test-run-report';

const MAX_DEPTH = 6;
const MAX_STRING_LENGTH = 2_000;
const MAX_ARRAY_ITEMS = 50;
const MAX_OBJECT_KEYS = 50;
const MAX_SERIALIZED_BYTES = 64 * 1024;
const TRUNCATED_VALUE = '[Truncated: display value exceeded 64 KiB]';

const normalizedSecretKeys = [
  'password',
  'passwd',
  'secret',
  'token',
  'authorization',
  'cookie',
  'apikey',
];

const normalizedKey = (key: string): string =>
  key.toLowerCase().replace(/[^a-z0-9]/g, '');

export const isReportSecretKey = (key: string): boolean => {
  const normalized = normalizedKey(key);
  return normalizedSecretKeys.some((secret) => normalized.includes(secret));
};

const objectPath = (parent: string, key: string): string =>
  /^[A-Za-z_$][\w$]*$/.test(key)
    ? `${parent}.${key}`
    : `${parent}[${JSON.stringify(key)}]`;

const stringByteLength = (value: string): number =>
  new TextEncoder().encode(value).byteLength;

export function sanitizeReportText(
  value: string,
  maximumLength = MAX_STRING_LENGTH,
): string {
  return value.length <= maximumLength
    ? value
    : `${value.slice(0, maximumLength)}… [truncated]`;
}

/** Convert arbitrary Node input/output to a bounded, JSON-safe display value. */
export function sanitizeReportValue(value: unknown): TestRunReportValue {
  const truncatedPaths = new Set<string>();
  const redactedPaths = new Set<string>();
  const ancestors = new WeakSet<object>();
  let remainingBytes = MAX_SERIALIZED_BYTES;

  const consume = (path: string, text: string): boolean => {
    remainingBytes -= stringByteLength(text);
    if (remainingBytes >= 0) return true;
    truncatedPaths.add(path);
    return false;
  };

  const visit = (current: unknown, path: string, depth: number): unknown => {
    if (remainingBytes <= 0) {
      truncatedPaths.add(path);
      return '[Truncated: size limit]';
    }
    if (current === null || typeof current === 'boolean') {
      consume(path, String(current));
      return current;
    }
    if (typeof current === 'string') {
      if (current.length > MAX_STRING_LENGTH) {
        truncatedPaths.add(path);
        const shortened = `${current.slice(0, MAX_STRING_LENGTH)}… [truncated]`;
        consume(path, shortened);
        return shortened;
      }
      consume(path, current);
      return current;
    }
    if (typeof current === 'number') {
      if (Number.isFinite(current)) {
        consume(path, String(current));
        return current;
      }
      truncatedPaths.add(path);
      return `[Unsupported number: ${String(current)}]`;
    }
    if (typeof current === 'bigint') {
      truncatedPaths.add(path);
      return `[Unsupported bigint: ${String(current)}]`;
    }
    if (
      current === undefined ||
      typeof current === 'function' ||
      typeof current === 'symbol'
    ) {
      truncatedPaths.add(path);
      return `[Unsupported ${typeof current}]`;
    }
    if (depth >= MAX_DEPTH) {
      truncatedPaths.add(path);
      return '[Truncated: maximum depth]';
    }

    if (current instanceof Date) {
      const date = Number.isNaN(current.getTime())
        ? '[Invalid Date]'
        : current.toISOString();
      consume(path, date);
      return date;
    }
    if (ancestors.has(current)) {
      truncatedPaths.add(path);
      return '[Unsupported circular value]';
    }

    if (Array.isArray(current)) {
      ancestors.add(current);
      const output: unknown[] = [];
      const itemCount = Math.min(current.length, MAX_ARRAY_ITEMS);
      for (let index = 0; index < itemCount; index += 1) {
        if (remainingBytes <= 0) break;
        output.push(visit(current[index], `${path}[${index}]`, depth + 1));
      }
      if (current.length > output.length) truncatedPaths.add(path);
      ancestors.delete(current);
      return output;
    }

    const prototype = Object.getPrototypeOf(current);
    if (prototype !== Object.prototype && prototype !== null) {
      truncatedPaths.add(path);
      const constructorName =
        (current as { constructor?: { name?: string } }).constructor?.name ??
        'object';
      return `[Unsupported object: ${constructorName}]`;
    }

    ancestors.add(current);
    const output: Record<string, unknown> = {};
    const keys = Object.keys(current as Record<string, unknown>);
    for (const key of keys.slice(0, MAX_OBJECT_KEYS)) {
      const childPath = objectPath(path, key);
      if (!consume(childPath, key)) break;
      if (isReportSecretKey(key)) {
        output[key] = '[REDACTED]';
        redactedPaths.add(childPath);
      } else {
        output[key] = visit(
          (current as Record<string, unknown>)[key],
          childPath,
          depth + 1,
        );
      }
      if (remainingBytes <= 0) break;
    }
    if (keys.length > Object.keys(output).length) truncatedPaths.add(path);
    ancestors.delete(current);
    return output;
  };

  const sanitized = visit(value, '$', 0);
  const serialized = JSON.stringify(sanitized);
  if (
    serialized === undefined ||
    stringByteLength(serialized) > MAX_SERIALIZED_BYTES
  ) {
    return { value: TRUNCATED_VALUE, truncatedPaths: ['$'] };
  }

  return {
    value: sanitized,
    ...(truncatedPaths.size > 0 ? { truncatedPaths: [...truncatedPaths] } : {}),
    ...(redactedPaths.size > 0 ? { redactedPaths: [...redactedPaths] } : {}),
  };
}

export function sanitizeReportError(error: unknown): TestRunReportError {
  const messageText = (value: string) =>
    sanitizeReportText(
      value
        .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
        .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[REDACTED]@')
        .replace(
          /(["']?\b(?:password|passwd|secret|token|authorization|cookie|api[_-]?key)\b["']?\s*[:=]\s*)(?:\[REDACTED\]|"[^"]*"|'[^']*'|[^\s,;}\]]+)/gi,
          '$1[REDACTED]',
        ),
    );
  const ancestors = new WeakSet<object>();
  let remainingBytes = MAX_SERIALIZED_BYTES - 1024;
  let nodes = 0;
  const shortened = (): TestRunReportError => ({
    format: 'midscene-error',
    name: 'Error',
    message: '[Truncated: error cause chain]',
    truncated: true,
  });
  const visit = (current: unknown, depth: number): TestRunReportError => {
    if (depth >= MAX_DEPTH || nodes++ >= 25 || remainingBytes < 4096)
      return shortened();
    if (typeof current !== 'object' || current === null)
      return {
        format: 'midscene-error',
        name: 'Error',
        message: messageText(String(current)),
      };
    if (ancestors.has(current)) return shortened();
    ancestors.add(current);
    const source = current as {
      format?: unknown;
      truncated?: unknown;
      name?: unknown;
      message?: unknown;
      code?: unknown;
      details?: unknown;
      cause?: unknown;
      errors?: unknown;
    };
    const result: TestRunReportError = {
      format: 'midscene-error',
      ...(source.truncated === true ? { truncated: true } : {}),
      name:
        typeof source.name === 'string'
          ? sanitizeReportText(source.name, 200)
          : 'Error',
      message: messageText(
        typeof source.message === 'string' ? source.message : String(current),
      ),
      ...(typeof source.code === 'string'
        ? { code: sanitizeReportText(source.code, 200) }
        : {}),
    };
    remainingBytes -= stringByteLength(JSON.stringify(result)) + 128;
    if (source.details !== undefined) {
      // Current encoded errors may cross JSON/worker boundaries more than
      // once. An explicit format marker keeps detail values from nesting.
      const encodedDetails =
        source.format === 'midscene-error' &&
        typeof source.details === 'object' &&
        source.details !== null &&
        'value' in source.details
          ? (source.details as TestRunReportValue)
          : undefined;
      const details = sanitizeReportValue(
        encodedDetails ? encodedDetails.value : source.details,
      );
      for (const field of ['redactedPaths', 'truncatedPaths'] as const) {
        const paths = encodedDetails?.[field];
        if (Array.isArray(paths))
          details[field] = [
            ...new Set([
              ...(details[field] ?? []),
              ...paths
                .filter((path): path is string => typeof path === 'string')
                .slice(0, 50)
                .map((path) => sanitizeReportText(path)),
            ]),
          ];
      }
      const bytes = stringByteLength(JSON.stringify(details));
      if (bytes < remainingBytes - 4096) {
        result.details = details;
        remainingBytes -= bytes;
      } else {
        result.details = {
          value: '[Truncated: error details size limit]',
          truncatedPaths: ['$'],
        };
        result.truncated = true;
      }
    }
    if (source.cause !== undefined)
      result.cause = visit(source.cause, depth + 1);
    if (Array.isArray(source.errors)) {
      result.errors = [];
      for (const item of source.errors.slice(0, 10)) {
        if (nodes >= 25 || remainingBytes < 4096) {
          result.truncated = true;
          break;
        }
        result.errors.push(visit(item, depth + 1));
      }
      if (result.errors.length < source.errors.length) result.truncated = true;
    }
    ancestors.delete(current);
    return result;
  };
  const result = visit(error, 0);
  if (stringByteLength(JSON.stringify(result)) <= MAX_SERIALIZED_BYTES)
    return result;
  return {
    format: 'midscene-error',
    name: result.name,
    message: result.message,
    ...(result.code ? { code: result.code } : {}),
    truncated: true,
    cause: {
      format: 'midscene-error',
      name: 'Error',
      message: '[Truncated: serialized error exceeded 64 KiB]',
      truncated: true,
    },
  };
}
