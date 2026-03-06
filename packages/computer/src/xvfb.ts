import type { ChildProcess } from 'node:child_process';
import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
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
