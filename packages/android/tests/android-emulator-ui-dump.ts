type UiDumpPhase = 'cleanup' | 'dump' | 'read' | 'validate';

export interface UiDumpAdb {
  shell(command: string): Promise<string>;
  waitForDevice(timeoutSeconds: number): Promise<unknown>;
}

interface ProcessError {
  code?: unknown;
  stdout?: unknown;
  stderr?: unknown;
}

export interface UiDumpRetryContext {
  attempt: number;
  nextAttempt: number;
  phase: UiDumpPhase;
  error: unknown;
}

export interface DumpUiHierarchyOptions {
  remotePath: string;
  label: string;
  maxAttempts?: number;
  retryIntervalMs?: number;
  waitForDeviceTimeoutSeconds?: number;
  onRetry?: (context: UiDumpRetryContext) => Promise<void> | void;
}

export interface UiHierarchyDump {
  xml: string;
  attempts: number;
}

class EmptyUiHierarchyDumpError extends Error {
  constructor(label: string) {
    super(`Android emulator returned an empty ${label} dump`);
    this.name = 'EmptyUiHierarchyDumpError';
  }
}

function processError(error: unknown): ProcessError | undefined {
  return typeof error === 'object' && error !== null
    ? (error as ProcessError)
    : undefined;
}

function errorText(error: unknown): string {
  const detail = processError(error);
  return [
    error instanceof Error ? error.message : String(error),
    detail?.stdout,
    detail?.stderr,
  ]
    .filter((value): value is string => typeof value === 'string')
    .join('\n');
}

function processExitCode(error: unknown): number | null | undefined {
  const code = processError(error)?.code;
  return typeof code === 'number' || code === null ? code : undefined;
}

export function isTransientAdbTransportError(error: unknown): boolean {
  return /device offline|device unauthorized|no devices\/emulators found/i.test(
    errorText(error),
  );
}

function isRetryableUiDumpError(error: unknown, phase: UiDumpPhase): boolean {
  return (
    isTransientAdbTransportError(error) ||
    (phase === 'dump' && processExitCode(error) === 255) ||
    (phase === 'read' && /No such file or directory/i.test(errorText(error))) ||
    (phase === 'validate' && error instanceof EmptyUiHierarchyDumpError)
  );
}

function sleep(timeMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, timeMs));
}

export async function dumpUiHierarchyWithRetry(
  adb: UiDumpAdb,
  options: DumpUiHierarchyOptions,
): Promise<UiHierarchyDump> {
  const {
    remotePath,
    label,
    maxAttempts = 3,
    retryIntervalMs = 500,
    waitForDeviceTimeoutSeconds = 15,
    onRetry,
  } = options;

  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error('UI dump maxAttempts must be a positive integer');
  }

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let phase: UiDumpPhase = 'cleanup';
    try {
      await adb.shell(`rm -f ${remotePath}`);
      phase = 'dump';
      await adb.shell(`uiautomator dump --compressed ${remotePath}`);
      phase = 'read';
      const xml = await adb.shell(`cat ${remotePath}`);
      phase = 'validate';
      if (typeof xml !== 'string' || xml.trim().length === 0) {
        throw new EmptyUiHierarchyDumpError(label);
      }
      return { xml, attempts: attempt };
    } catch (error) {
      if (attempt === maxAttempts || !isRetryableUiDumpError(error, phase)) {
        throw error;
      }

      await onRetry?.({
        attempt,
        nextAttempt: attempt + 1,
        phase,
        error,
      });
      if (isTransientAdbTransportError(error)) {
        await adb.waitForDevice(waitForDeviceTimeoutSeconds);
      } else {
        await sleep(retryIntervalMs);
      }
    }
  }

  throw new Error('UI dump retry loop completed without a result');
}
