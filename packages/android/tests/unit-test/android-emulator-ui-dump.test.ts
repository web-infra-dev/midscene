import { describe, expect, it, vi } from 'vitest';
import {
  dumpUiHierarchyWithRetry,
  isTransientAdbTransportError,
} from '../android-emulator-ui-dump';
import type {
  DumpUiHierarchyOptions,
  UiDumpAdb,
} from '../android-emulator-ui-dump';

type ShellResult = string | Error;

function createAdbMock(results: ShellResult[]) {
  const queue = [...results];
  const shell = vi.fn(async () => {
    const result = queue.shift();
    if (result instanceof Error) {
      throw result;
    }
    return result ?? '';
  });
  const waitForDevice = vi.fn(async () => undefined);
  const adb: UiDumpAdb = { shell, waitForDevice };
  return { adb, shell, waitForDevice };
}

function execError(
  message: string,
  code: number,
  details: { stdout?: string; stderr?: string } = {},
): Error & { code: number; stdout: string; stderr: string } {
  return Object.assign(new Error(message), {
    code,
    stdout: details.stdout ?? '',
    stderr: details.stderr ?? '',
  });
}

const options: DumpUiHierarchyOptions = {
  remotePath: '/sdcard/window.xml',
  label: 'uiautomator',
  retryIntervalMs: 0,
};

describe('Android emulator UI hierarchy dump', () => {
  it.each([
    'device offline',
    'device unauthorized',
    'no devices/emulators found',
  ])('recognizes transient adb transport errors: %s', (message) => {
    expect(isTransientAdbTransportError(new Error(message))).toBe(true);
  });

  it('recognizes transport errors reported through process stderr', () => {
    expect(
      isTransientAdbTransportError(
        execError('adb failed', 1, { stderr: 'error: device offline' }),
      ),
    ).toBe(true);
  });

  it('returns the first valid hierarchy without retrying', async () => {
    const { adb, shell } = createAdbMock(['', '', '<hierarchy />']);

    await expect(dumpUiHierarchyWithRetry(adb, options)).resolves.toEqual({
      xml: '<hierarchy />',
      attempts: 1,
    });
    expect(shell).toHaveBeenNthCalledWith(1, 'rm -f /sdcard/window.xml');
    expect(shell).toHaveBeenNthCalledWith(
      2,
      'uiautomator dump --compressed /sdcard/window.xml',
    );
    expect(shell).toHaveBeenNthCalledWith(3, 'cat /sdcard/window.xml');
  });

  it('retries a structured exit code 255 in the dump phase', async () => {
    const failure = execError('uiautomator was not ready', 255);
    const { adb, waitForDevice } = createAdbMock([
      '',
      failure,
      '',
      '',
      '<hierarchy />',
    ]);
    const onRetry = vi.fn();

    await expect(
      dumpUiHierarchyWithRetry(adb, { ...options, onRetry }),
    ).resolves.toMatchObject({ attempts: 2 });
    expect(onRetry).toHaveBeenCalledWith({
      attempt: 1,
      nextAttempt: 2,
      phase: 'dump',
      error: failure,
    });
    expect(waitForDevice).not.toHaveBeenCalled();
  });

  it.each([
    {
      name: 'a missing dump file',
      results: [
        '',
        '',
        new Error('cat: window.xml: No such file or directory'),
        '',
        '',
        '<hierarchy />',
      ],
      phase: 'read',
    },
    {
      name: 'an empty hierarchy',
      results: ['', '', '', '', '', '<hierarchy />'],
      phase: 'validate',
    },
  ] satisfies Array<{
    name: string;
    results: ShellResult[];
    phase: 'read' | 'validate';
  }>)('retries $name', async ({ results, phase }) => {
    const { adb } = createAdbMock(results);
    const onRetry = vi.fn();

    await expect(
      dumpUiHierarchyWithRetry(adb, { ...options, onRetry }),
    ).resolves.toMatchObject({ attempts: 2 });
    expect(onRetry).toHaveBeenCalledWith(expect.objectContaining({ phase }));
  });

  it('waits for the device before retrying a transport failure', async () => {
    const { adb, waitForDevice } = createAdbMock([
      new Error('device offline'),
      '',
      '',
      '<hierarchy />',
    ]);

    await expect(dumpUiHierarchyWithRetry(adb, options)).resolves.toMatchObject(
      { attempts: 2 },
    );
    expect(waitForDevice).toHaveBeenCalledWith(15);
  });

  it.each([
    {
      name: 'an unrelated dump failure',
      results: ['', execError('permission denied', 1)],
      calls: 2,
    },
    {
      name: 'exit code 255 during cleanup',
      results: [execError('cleanup failed', 255)],
      calls: 1,
    },
  ])('does not retry $name', async ({ results, calls }) => {
    const failure = results.at(-1);
    const { adb, shell } = createAdbMock(results);

    await expect(dumpUiHierarchyWithRetry(adb, options)).rejects.toBe(failure);
    expect(shell).toHaveBeenCalledTimes(calls);
  });

  it('stops after the configured number of attempts', async () => {
    const failure = execError('uiautomator was not ready', 255);
    const shell = vi.fn(async (command: string) => {
      if (command.startsWith('uiautomator dump')) {
        throw failure;
      }
      return '';
    });
    const adb: UiDumpAdb = {
      shell,
      waitForDevice: vi.fn(async () => undefined),
    };
    const onRetry = vi.fn();

    await expect(
      dumpUiHierarchyWithRetry(adb, {
        ...options,
        maxAttempts: 3,
        onRetry,
      }),
    ).rejects.toBe(failure);
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(shell).toHaveBeenCalledTimes(6);
  });
});
