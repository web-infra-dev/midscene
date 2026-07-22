import { execFile } from 'node:child_process';
import type { ADB } from 'appium-adb';

export const ADB_SCREENSHOT_TIMEOUT_MS = 10_000;
const ADB_SCREENSHOT_MAX_BUFFER_BYTES = 64 * 1024 * 1024;

type ExecFileImplementation = typeof execFile;

interface ExecFileError extends Error {
  killed?: boolean;
  signal?: NodeJS.Signals | null;
  code?: string | number | null;
}

export class AdbScreenshotCommandError extends Error {
  constructor(
    message: string,
    readonly elapsedMs: number,
    readonly timedOut: boolean,
  ) {
    super(message);
    this.name = 'AdbScreenshotCommandError';
  }
}

/**
 * Run `adb exec-out screencap -p` with a real child-process timeout.
 *
 * appium-adb's takeScreenshot() calls teen_process.exec() without forwarding
 * adbExecTimeout, so a stuck device-side screencap can otherwise block forever.
 */
export function takeAdbScreenshot(
  adb: ADB,
  timeoutMs = ADB_SCREENSHOT_TIMEOUT_MS,
  execFileImplementation: ExecFileImplementation = execFile,
): Promise<Buffer> {
  const startedAt = Date.now();
  const args = [
    ...(adb.executable.defaultArgs ?? []),
    'exec-out',
    'screencap',
    '-p',
  ];

  return new Promise<Buffer>((resolve, reject) => {
    execFileImplementation(
      adb.executable.path,
      args,
      {
        encoding: 'buffer',
        timeout: timeoutMs,
        killSignal: 'SIGKILL',
        maxBuffer: ADB_SCREENSHOT_MAX_BUFFER_BYTES,
      },
      (error, stdout, stderr) => {
        const elapsedMs = Date.now() - startedAt;
        if (error) {
          const execError = error as ExecFileError;
          const timedOut = execError.killed === true;
          const stderrText = Buffer.isBuffer(stderr)
            ? stderr.toString('utf8').trim()
            : String(stderr ?? '').trim();
          const details = [
            `elapsed=${elapsedMs}ms`,
            `timeout=${timeoutMs}ms`,
            `killed=${String(execError.killed ?? false)}`,
            `signal=${String(execError.signal ?? 'none')}`,
            `code=${String(execError.code ?? 'none')}`,
          ];
          if (stderrText) details.push(`stderr=${stderrText}`);
          reject(
            new AdbScreenshotCommandError(
              `ADB exec-out screencap failed (${details.join(', ')})`,
              elapsedMs,
              timedOut,
            ),
          );
          return;
        }

        if (!Buffer.isBuffer(stdout)) {
          reject(
            new AdbScreenshotCommandError(
              `ADB exec-out screencap returned non-buffer output after ${elapsedMs}ms`,
              elapsedMs,
              false,
            ),
          );
          return;
        }

        resolve(stdout);
      },
    );
  });
}
