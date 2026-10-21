import { afterEach, describe, expect, it, vi } from 'vitest';
import { runMacStapler } from '../scripts/mac-stapler.mjs';

const networkError = (output = 'stdout', code = -1005) =>
  Object.assign(new Error('stapler exited with code 68'), {
    code: 68,
    [output]: `error is Error Domain=NSURLErrorDomain Code=${code} "The network connection was lost."\nThe validate action failed! Error 68.\n`,
  });

afterEach(() => {
  vi.restoreAllMocks();
});

describe('macOS stapler retries', () => {
  it.each(['staple', 'validate'])(
    'runs %s once when it succeeds',
    async (action) => {
      const execute = vi.fn().mockResolvedValue({ stdout: '', stderr: '' });
      const wait = vi.fn();
      const targetPath = '/tmp/Midscene Studio Beta.app';

      await runMacStapler(action, targetPath, { execute, wait });

      expect(execute).toHaveBeenCalledExactlyOnceWith('xcrun', [
        'stapler',
        action,
        targetPath,
      ]);
      expect(wait).not.toHaveBeenCalled();
    },
  );

  it.each(['stdout', 'stderr'])(
    'retries the release network failure reported in %s and preserves diagnostics',
    async (stream) => {
      const error = networkError(stream);
      const write = vi.spyOn(process[stream], 'write').mockReturnValue(true);
      const log = vi.spyOn(console, 'log').mockImplementation(() => {});
      const execute = vi
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue({ stdout: '', stderr: '' });
      const wait = vi.fn().mockResolvedValue(undefined);

      await runMacStapler('validate', '/tmp/Studio.app', { execute, wait });

      expect(execute).toHaveBeenCalledTimes(2);
      expect(wait).toHaveBeenCalledExactlyOnceWith(5000);
      expect(write).toHaveBeenCalledWith(error[stream]);
      expect(log).toHaveBeenCalledWith(expect.stringContaining('attempt 1/3'));
    },
  );

  it('fails after three network failures with increasing delays and the final error', async () => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const finalError = networkError('stdout', -1001);
    const execute = vi
      .fn()
      .mockRejectedValueOnce(networkError())
      .mockRejectedValueOnce(networkError())
      .mockRejectedValue(finalError);
    const wait = vi.fn().mockResolvedValue(undefined);

    await expect(
      runMacStapler('staple', '/tmp/Studio.dmg', { execute, wait }),
    ).rejects.toBe(finalError);

    expect(execute).toHaveBeenCalledTimes(3);
    expect(wait.mock.calls).toEqual([[5000], [10000]]);
  });

  it('retries a request timeout', async () => {
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const execute = vi
      .fn()
      .mockRejectedValueOnce(networkError('stderr', -1001))
      .mockResolvedValue({ stdout: '', stderr: '' });
    const wait = vi.fn().mockResolvedValue(undefined);

    await runMacStapler('validate', '/tmp/Studio.app', { execute, wait });

    expect(execute).toHaveBeenCalledTimes(2);
    expect(wait).toHaveBeenCalledExactlyOnceWith(5000);
  });

  it.each([
    { code: 68, stdout: 'A ticket has not been stapled to this software.' },
    { code: 65, stderr: 'Could not validate ticket.' },
    { code: 68, stderr: 'Error Domain=NSURLErrorDomain Code=-1200' },
    { code: 'ENOENT' },
  ])('does not retry a non-network failure: %j', async (details) => {
    vi.spyOn(process.stdout, 'write').mockReturnValue(true);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
    const error = Object.assign(new Error('stapler failed'), details);
    const execute = vi.fn().mockRejectedValue(error);
    const wait = vi.fn();

    await expect(
      runMacStapler('validate', '/tmp/Studio.app', { execute, wait }),
    ).rejects.toBe(error);

    expect(execute).toHaveBeenCalledTimes(1);
    expect(wait).not.toHaveBeenCalled();
  });
});
