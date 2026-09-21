import type { ChildProcess } from 'node:child_process';
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import {
  type CliInterruptSource,
  hasActiveCliInterruptWaiter,
} from '@midscene/shared/cli/interrupt';
import { getDebug } from '@midscene/shared/logger';

const debugXvfb = getDebug('computer:xvfb');

export interface XvfbOptions {
  resolution?: string; // default '1920x1080x24'
  displayNumber?: number; // auto-assigned if not specified
}

export interface XvfbInstance {
  process: ChildProcess;
  display: string; // e.g. ':99'
  stop(): void;
}

const xvfbCleanupMonitorScript = String.raw`
const parentPid = Number(process.argv[1]);
const xvfbPid = Number(process.argv[2]);
const timer = setInterval(() => {
  try {
    process.kill(xvfbPid, 0);
  } catch {
    clearInterval(timer);
    process.exit(0);
  }
  try {
    process.kill(parentPid, 0);
    return;
  } catch {
    // The owner is gone, so its X11 clients can no longer receive XIO errors.
  }
  try {
    process.kill(xvfbPid, 'SIGTERM');
  } catch {
    // Xvfb may have already exited.
  }
  clearInterval(timer);
}, 100);
`;

/**
 * Let a detached monitor stop Xvfb only after the owning process has exited.
 *
 * libnut keeps a process-wide X11 connection open and exposes no close API.
 * Killing Xvfb from that same process makes Xlib call exit(1), even after a
 * successful CLI command. The monitor runs outside the owner, waits until its
 * X11 sockets have closed with process exit, and then stops the server.
 */
export function scheduleXvfbStopAfterProcessExit(
  instance: XvfbInstance,
  parentPid = process.pid,
): ChildProcess {
  const xvfbPid = instance.process.pid;
  if (!xvfbPid) {
    throw new Error('Cannot schedule Xvfb cleanup before its process starts');
  }

  const monitor = spawn(
    process.execPath,
    ['-e', xvfbCleanupMonitorScript, String(parentPid), String(xvfbPid)],
    { detached: true, stdio: 'ignore' },
  );
  monitor.on('error', (error) => {
    debugXvfb(`Xvfb cleanup monitor failed: ${error.message}`);
  });
  instance.process.unref();
  monitor.unref();
  return monitor;
}

/**
 * Keep Xvfb alive while the foreground recorder handles a termination signal
 * and saves its artifact. Other signal listeners do not defer cleanup.
 */
export function createXvfbSignalCleanup(
  cleanup: () => void,
  source: CliInterruptSource = process,
): () => void {
  return () => {
    if (!hasActiveCliInterruptWaiter(source)) {
      cleanup();
    }
  };
}

/**
 * Check if Xvfb is installed on the system
 */
export function checkXvfbInstalled(): boolean {
  try {
    execSync('which Xvfb', { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Find an available display number by checking /tmp/.X{n}-lock files
 */
export function findAvailableDisplay(startFrom = 99): number {
  for (let n = startFrom; n < startFrom + 100; n++) {
    if (!existsSync(`/tmp/.X${n}-lock`)) {
      return n;
    }
  }
  throw new Error(
    `No available display number found (checked ${startFrom} to ${startFrom + 99})`,
  );
}

/**
 * Start an Xvfb process
 */
export function startXvfb(options?: XvfbOptions): Promise<XvfbInstance> {
  const resolution = options?.resolution || '1920x1080x24';
  const displayNum = options?.displayNumber ?? findAvailableDisplay();
  const display = `:${displayNum}`;

  return new Promise<XvfbInstance>((resolve, reject) => {
    debugXvfb(
      `Starting Xvfb on display ${display} with resolution ${resolution}`,
    );

    const xvfbProcess = spawn(
      'Xvfb',
      [display, '-screen', '0', resolution, '-ac', '-nolisten', 'tcp'],
      { stdio: 'ignore' },
    );

    let settled = false;

    xvfbProcess.on('error', (err) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Failed to start Xvfb: ${err.message}`));
      }
    });

    xvfbProcess.on('exit', (code) => {
      if (!settled) {
        settled = true;
        reject(new Error(`Xvfb exited unexpectedly with code ${code}`));
      }
    });

    const instance: XvfbInstance = {
      process: xvfbProcess,
      display,
      stop() {
        try {
          xvfbProcess.kill('SIGTERM');
        } catch {
          // process may already be dead
        }
      },
    };

    // Wait for Xvfb to start
    setTimeout(() => {
      if (!settled) {
        settled = true;
        debugXvfb(`Xvfb started on display ${display}`);
        resolve(instance);
      }
    }, 500);
  });
}

/**
 * Determine whether Xvfb is needed.
 * Only starts when explicitly requested via `headless: true`.
 * Non-Linux platforms always return false.
 */
export function needsXvfb(explicitOpt?: boolean): boolean {
  if (process.platform !== 'linux') {
    return false;
  }
  return explicitOpt === true;
}
