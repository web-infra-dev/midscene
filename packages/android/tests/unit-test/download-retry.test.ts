import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_DOWNLOAD_MAX_RETRIES,
  getDownloadMaxRetries,
  getDownloadRetryDelayMs,
  retryDownload,
} from '../../scripts/download-retry.mjs';

describe('download retry helper', () => {
  it('uses six attempts by default for CI release asset downloads', () => {
    expect(getDownloadMaxRetries({} as NodeJS.ProcessEnv)).toBe(
      DEFAULT_DOWNLOAD_MAX_RETRIES,
    );
    expect(DEFAULT_DOWNLOAD_MAX_RETRIES).toBe(6);
  });

  it('allows overriding the attempt count from the environment', () => {
    expect(
      getDownloadMaxRetries({
        MIDSCENE_ANDROID_DOWNLOAD_RETRIES: '8',
      } as NodeJS.ProcessEnv),
    ).toBe(8);
  });

  it('caps exponential retry delays', () => {
    expect(getDownloadRetryDelayMs(1)).toBe(2000);
    expect(getDownloadRetryDelayMs(2)).toBe(4000);
    expect(getDownloadRetryDelayMs(6)).toBe(30000);
  });

  it('retries transient failures before resolving', async () => {
    const download = vi
      .fn()
      .mockRejectedValueOnce(new Error('Response code 504 (Gateway Time-out)'))
      .mockRejectedValueOnce(new Error('Response code 502 (Bad Gateway)'))
      .mockResolvedValue(undefined);
    const sleepImpl = vi.fn(async () => undefined);
    const log = vi.fn();

    await retryDownload({
      download,
      label: 'scrcpy',
      log,
      maxRetries: 6,
      sleepImpl,
    });

    expect(download).toHaveBeenCalledTimes(3);
    expect(sleepImpl).toHaveBeenNthCalledWith(1, 2000);
    expect(sleepImpl).toHaveBeenNthCalledWith(2, 4000);
    expect(log).toHaveBeenCalledWith(
      '[scrcpy] Download attempt 1/6 failed: Response code 504 (Gateway Time-out), retrying in 2s...',
    );
  });

  it('throws the final download error after all attempts fail', async () => {
    const error = new Error('Response code 504 (Gateway Time-out)');

    await expect(
      retryDownload({
        download: vi.fn().mockRejectedValue(error),
        label: 'scrcpy',
        log: vi.fn(),
        maxRetries: 2,
        sleepImpl: vi.fn(async () => undefined),
      }),
    ).rejects.toThrow(error);
  });

  it('always attempts the download at least once', async () => {
    const download = vi.fn().mockResolvedValue(undefined);

    await retryDownload({
      download,
      label: 'scrcpy',
      log: vi.fn(),
      maxRetries: 0,
      sleepImpl: vi.fn(async () => undefined),
    });

    expect(download).toHaveBeenCalledTimes(1);
  });
});
