import { describe, expect, it, rs } from '@rstest/core';
import { installAndroidSystemImage } from '../install-android-system-image.mjs';

const image = 'system-images;android-35;google_apis;x86_64';

describe('Android system image preparation', () => {
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
