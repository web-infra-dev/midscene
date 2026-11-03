import { execFile } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { describe, expect, it, rs } from '@rstest/core';
import { installAndroidSystemImage } from '../install-android-system-image.mjs';

const image = 'system-images;android-35;google_apis;x86_64';
const exec = promisify(execFile);

describe('Android system image preparation', () => {
  it
    .skipIf(process.platform === 'win32')
    .each(['ANDROID_HOME', 'ANDROID_SDK_ROOT'])(
    'resolves sdkmanager from %s when command-line tools are absent from PATH',
    async (variable) => {
      const root = await mkdtemp(join(tmpdir(), 'android-sdk-resolution-'));
      try {
        const sdk = join(root, 'android sdk');
        const executable = join(
          sdk,
          'cmdline-tools',
          'latest',
          'bin',
          'sdkmanager',
        );
        const log = join(root, 'sdkmanager.log');
        await mkdir(join(sdk, 'cmdline-tools', 'latest', 'bin'), {
          recursive: true,
        });
        await writeFile(
          executable,
          '#!/bin/sh\nprintf "%s\\n" "$*" >> "$SDKMANAGER_TEST_LOG"\nif [ "$1" = "--licenses" ]; then read -r answer; [ "$answer" = y ]; fi\n',
        );
        await chmod(executable, 0o755);
        await exec(
          process.execPath,
          [
            fileURLToPath(
              new URL('../install-android-system-image.mjs', import.meta.url),
            ),
            image,
          ],
          {
            env: {
              ...process.env,
              PATH: '/usr/bin:/bin',
              ANDROID_HOME: '',
              ANDROID_SDK_ROOT: '',
              [variable]: sdk,
              SDKMANAGER_TEST_LOG: log,
            },
            timeout: 10_000,
          },
        );
        expect((await readFile(log, 'utf8')).trim().split('\n')).toEqual([
          '--licenses',
          `--install ${image}`,
        ]);
      } finally {
        await rm(root, { recursive: true, force: true });
      }
    },
  );
  it('accepts licenses and installs the image once on success', async () => {
    const run = rs.fn().mockResolvedValue(undefined);
    const wait = rs.fn();
    await installAndroidSystemImage(image, { run, wait });
    expect(run.mock.calls).toEqual([
      [['--licenses'], 'y\n'.repeat(100)],
      [['--install', image]],
    ]);
    expect(wait).not.toHaveBeenCalled();
  });

  it('retries failed downloads with backoff without running any test command', async () => {
    const run = rs
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Archive is not a ZIP archive'))
      .mockRejectedValueOnce(new Error('connection reset'))
      .mockResolvedValue(undefined);
    const wait = rs.fn().mockResolvedValue(undefined);
    const onRetry = rs.fn();
    await installAndroidSystemImage(image, { run, wait, onRetry });
    expect(run.mock.calls.slice(1)).toEqual(
      Array.from({ length: 3 }, () => [['--install', image]]),
    );
    expect(wait.mock.calls).toEqual([[5000], [10000]]);
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('preserves a persistent download failure after three attempts', async () => {
    const error = new Error('Archive is not a ZIP archive');
    const run = rs
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(error);
    const wait = rs.fn().mockResolvedValue(undefined);
    await expect(
      installAndroidSystemImage(image, { run, wait, onRetry: rs.fn() }),
    ).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(4);
    expect(wait).toHaveBeenCalledTimes(2);
  });

  it('stops if licenses cannot be accepted or sdkmanager is absent', async () => {
    const error = new Error('license failure');
    const run = rs.fn().mockRejectedValue(error);
    await expect(installAndroidSystemImage(image, { run })).rejects.toBe(error);
    expect(run).toHaveBeenCalledTimes(1);
    const missing = Object.assign(new Error('sdkmanager missing'), {
      code: 'ENOENT',
    });
    const absent = rs
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValue(missing);
    await expect(
      installAndroidSystemImage(image, { run: absent, wait: rs.fn() }),
    ).rejects.toBe(missing);
    expect(absent).toHaveBeenCalledTimes(2);
  });
});
