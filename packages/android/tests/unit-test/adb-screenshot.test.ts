import type { ADB } from 'appium-adb';
import { describe, expect, it, vi } from 'vitest';
import {
  AdbScreenshotCommandError,
  takeAdbScreenshot,
} from '../../src/adb-screenshot';

describe('takeAdbScreenshot', () => {
  const adb = {
    executable: {
      path: '/opt/homebrew/bin/adb',
      defaultArgs: ['-P', '5037', '-s', 'device-id'],
    },
  } as ADB;

  it('runs screencap with a bounded, force-killed child process', async () => {
    const png = Buffer.from('png');
    const execFile = vi.fn((_file, _args, _options, callback) => {
      callback(null, png, Buffer.alloc(0));
      return {};
    });

    await expect(
      takeAdbScreenshot(adb, 1_234, execFile as any),
    ).resolves.toEqual(png);

    expect(execFile).toHaveBeenCalledWith(
      '/opt/homebrew/bin/adb',
      ['-P', '5037', '-s', 'device-id', 'exec-out', 'screencap', '-p'],
      expect.objectContaining({
        encoding: 'buffer',
        timeout: 1_234,
        killSignal: 'SIGKILL',
      }),
      expect.any(Function),
    );
  });

  it('reports whether the screencap process was killed by its timeout', async () => {
    const execFile = vi.fn((_file, _args, _options, callback) => {
      callback(
        Object.assign(new Error('timed out'), {
          killed: true,
          signal: 'SIGKILL',
          code: null,
        }),
        Buffer.alloc(0),
        Buffer.alloc(0),
      );
      return {};
    });

    const error = await takeAdbScreenshot(adb, 10, execFile as any).catch(
      (caught) => caught,
    );

    expect(error).toBeInstanceOf(AdbScreenshotCommandError);
    expect(error).toMatchObject({ timedOut: true });
    expect(error.message).toContain('killed=true');
    expect(error.message).toContain('signal=SIGKILL');
  });
});
