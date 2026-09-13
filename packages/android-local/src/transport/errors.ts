import type { TransportBackend } from './types';

/**
 * Unified transport error codes. Upper layers switch on `code` only — they must
 * never parse stderr text to decide what happened.
 */
export type AndroidTransportErrorCode =
  /** uid is too low, Shizuku is not authorized, or the command was denied. */
  | 'PermissionDenied'
  /** The command ran but exited non-zero. */
  | 'CommandFailed'
  /** Screenshot acquisition, decoding or magic-byte validation failed. */
  | 'ScreenshotFailed'
  /** The command did not finish within its timeout. */
  | 'Timeout'
  /** The shell channel is unreachable or the transport was closed. */
  | 'ServiceUnavailable'
  /** The backend cannot do this (e.g. non-ASCII text on `input text`). */
  | 'NotSupported'
  /** The caller passed an invalid argument. */
  | 'InvalidArgument';

export interface AndroidTransportErrorOptions {
  code: AndroidTransportErrorCode;
  backend: TransportBackend;
  /** The exact command that failed, for diagnostics. */
  command?: string;
  exitCode?: number | null;
  stdout?: string;
  stderr?: string;
  timeoutMs?: number;
  cause?: unknown;
}

const MAX_STREAM_SNIPPET = 200;

export function truncateStream(
  value: string,
  max = MAX_STREAM_SNIPPET,
): string {
  if (value.length <= max) {
    return value;
  }

  return `${value.slice(0, max)}…[${value.length - max} more chars]`;
}

export class AndroidTransportError extends Error {
  readonly code: AndroidTransportErrorCode;
  readonly backend: TransportBackend;
  readonly command?: string;
  readonly exitCode?: number | null;
  readonly stdout?: string;
  readonly stderr?: string;
  readonly timeoutMs?: number;

  constructor(message: string, options: AndroidTransportErrorOptions) {
    super(message, { cause: options.cause });
    this.name = 'AndroidTransportError';
    this.code = options.code;
    this.backend = options.backend;
    this.command = options.command;
    this.exitCode = options.exitCode;
    this.stdout = options.stdout;
    this.stderr = options.stderr;
    this.timeoutMs = options.timeoutMs;
  }

  /** Single-line description used in logs and report messages. */
  describe(): string {
    const parts = [`[${this.code}] ${this.message}`];
    if (this.command) {
      parts.push(`command: ${this.command}`);
    }
    if (this.exitCode !== undefined && this.exitCode !== null) {
      parts.push(`exitCode: ${this.exitCode}`);
    }
    if (this.stderr) {
      parts.push(`stderr: ${truncateStream(this.stderr)}`);
    }

    return parts.join(' | ');
  }
}

export function isAndroidTransportError(
  error: unknown,
): error is AndroidTransportError {
  return error instanceof AndroidTransportError;
}

/**
 * Wrap an arbitrary failure into a transport error, preserving an existing
 * transport error (its code is authoritative).
 */
export function toAndroidTransportError(
  error: unknown,
  fallback: {
    code: AndroidTransportErrorCode;
    backend: TransportBackend;
    message?: string;
    command?: string;
    timeoutMs?: number;
  },
): AndroidTransportError {
  if (isAndroidTransportError(error)) {
    return error;
  }

  const message = error instanceof Error ? error.message : String(error);

  return new AndroidTransportError(
    fallback.message ? `${fallback.message}: ${message}` : message,
    {
      code: fallback.code,
      backend: fallback.backend,
      command: fallback.command,
      timeoutMs: fallback.timeoutMs,
      cause: error,
    },
  );
}
