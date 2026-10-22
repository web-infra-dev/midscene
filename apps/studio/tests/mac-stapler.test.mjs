import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { notarizeMacArtifact } from '../scripts/mac-notarization.mjs';
import { runMacStapler } from '../scripts/mac-stapler.mjs';

const execFileAsync = promisify(execFile);

const networkError = (output = 'stdout', code = -1005) =>
  Object.assign(new Error('stapler exited with code 68'), {
    code: 68,
    [output]: `error is Error Domain=NSURLErrorDomain Code=${code} "The network connection was lost."\nThe validate action failed! Error 68.\n`,
  });

afterEach(() => {
  vi.restoreAllMocks();
});

const runStaplerSubprocess = async (responses, action) => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'studio-stapler-'));
  const fixturePath = path.join(root, 'responses.json');
  const helperUrl = new URL('../scripts/mac-stapler.mjs', import.meta.url).href;
  const targetPath = path.join(root, 'Midscene Studio Beta.app');
  try {
    await fs.copyFile(
      new URL('./fixtures/fake-stapler.cjs', import.meta.url),
      path.join(root, 'xcrun'),
    );
    await fs.chmod(path.join(root, 'xcrun'), 0o755);
    await fs.writeFile(fixturePath, JSON.stringify({ calls: [], responses }));

    // Keep execute at its production default. Only bypass the real retry waits.
    const source = `
      import { runMacStapler } from ${JSON.stringify(helperUrl)};
      const delays = [];
      let outcome;
      try {
        await runMacStapler(${JSON.stringify(action)}, ${JSON.stringify(targetPath)}, {
          wait: async (ms) => { delays.push(ms); },
        });
        outcome = { success: true, delays };
      } catch (error) {
        outcome = { success: false, code: error.code, message: error.message, delays };
      }
      console.log('STAPLER_RESULT=' + JSON.stringify(outcome));
    `;
    const { stdout, stderr } = await execFileAsync(
      process.execPath,
      ['--input-type=module', '-e', source],
      {
        timeout: 10000,
        env: {
          ...process.env,
          PATH: `${root}${path.delimiter}${process.env.PATH}`,
          MIDSCENE_STAPLER_FIXTURE: fixturePath,
        },
      },
    );
    const resultLine = stdout
      .split('\n')
      .find((line) => line.startsWith('STAPLER_RESULT='));
    expect(resultLine).toBeDefined();
    const { calls } = JSON.parse(await fs.readFile(fixturePath, 'utf8'));
    for (const args of calls) {
      expect(args).toEqual(['stapler', action, targetPath]);
    }
    return {
      result: JSON.parse(resultLine.slice('STAPLER_RESULT='.length)),
      attempts: calls.length,
      stdout,
      stderr,
    };
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
};

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

describe('macOS notarization recovery', () => {
  it.each(['Studio.app', 'Studio.dmg'])(
    'validates %s after submission without stapling it twice',
    async (appPath) => {
      const options = {
        appPath,
        appleApiKey: '/tmp/fixture.p8',
        appleApiKeyId: 'fixture',
      };
      const submit = vi.fn().mockResolvedValue(undefined);
      const staple = vi.fn().mockResolvedValue(undefined);

      await notarizeMacArtifact(options, { submit, staple });

      expect(submit).toHaveBeenCalledExactlyOnceWith(options);
      expect(staple.mock.calls).toEqual([['validate', appPath]]);
    },
  );

  it.each(['Studio.app', 'Studio.dmg'])(
    'recovers the library-internal network failure for %s without submitting again',
    async (appPath) => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const error = new Error(
        'Failed to staple your application with code: 68\n\nError Domain=NSURLErrorDomain Code=-1005 "The network connection was lost."',
      );
      const submit = vi.fn().mockRejectedValue(error);
      const staple = vi.fn().mockResolvedValue(undefined);

      await notarizeMacArtifact({ appPath }, { submit, staple });

      expect(submit).toHaveBeenCalledTimes(1);
      expect(staple.mock.calls).toEqual([
        ['staple', appPath],
        ['validate', appPath],
      ]);
      expect(console.error).toHaveBeenCalledWith(error.message);
    },
  );

  it.each([
    'notarytool submission failed: Error Domain=NSURLErrorDomain Code=-1005',
    'Failed to staple your application with code: 68\nA ticket has not been stapled.',
    'Failed to staple your application with code: 68\nError Domain=NSURLErrorDomain Code=-1200',
    'Invalid notarization credentials',
  ])(
    'propagates failures outside the recoverable staple phase: %s',
    async (message) => {
      const error = new Error(message);
      const submit = vi.fn().mockRejectedValue(error);
      const staple = vi.fn();

      await expect(
        notarizeMacArtifact({ appPath: 'Studio.app' }, { submit, staple }),
      ).rejects.toBe(error);

      expect(submit).toHaveBeenCalledTimes(1);
      expect(staple).not.toHaveBeenCalled();
    },
  );

  it('propagates exhausted staple recovery without validating or resubmitting', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const submit = vi
      .fn()
      .mockRejectedValue(
        new Error(
          'Failed to staple your application with code: 68\nError Domain=NSURLErrorDomain Code=-1005',
        ),
      );
    const finalError = new Error('stapler recovery exhausted');
    const staple = vi.fn().mockRejectedValue(finalError);

    await expect(
      notarizeMacArtifact({ appPath: 'Studio.dmg' }, { submit, staple }),
    ).rejects.toBe(finalError);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(staple.mock.calls).toEqual([['staple', 'Studio.dmg']]);
  });

  it('propagates validation failures without repeating submission', async () => {
    const error = new Error('validation failed');
    const submit = vi.fn().mockResolvedValue(undefined);
    const staple = vi.fn().mockRejectedValue(error);

    await expect(
      notarizeMacArtifact({ appPath: 'Studio.app' }, { submit, staple }),
    ).rejects.toBe(error);

    expect(submit).toHaveBeenCalledTimes(1);
    expect(staple.mock.calls).toEqual([['validate', 'Studio.app']]);
  });
});

// The fake xcrun uses a POSIX shebang; stapler itself is macOS-only.
describe.skipIf(process.platform === 'win32')('real stapler subprocess', () => {
  it.each(['stdout', 'stderr'])(
    'captures %s from execFile and recovers from a network failure',
    async (stream) => {
      const diagnostic = 'Error Domain=NSURLErrorDomain Code=-1005\n';
      const outcome = await runStaplerSubprocess(
        [
          { code: 68, [stream]: diagnostic },
          { code: 0, stdout: 'The validate action worked!\n' },
        ],
        'validate',
      );

      expect(outcome.result).toEqual({ success: true, delays: [5000] });
      expect(outcome.attempts).toBe(2);
      expect(outcome[stream]).toContain(diagnostic);
      expect(outcome.stdout).toContain('The validate action worked!');
    },
  );

  it('does not retry a real exit 68 without a network diagnostic', async () => {
    const diagnostic = 'A ticket has not been stapled to this software.\n';
    const outcome = await runStaplerSubprocess(
      [{ code: 68, stdout: diagnostic }],
      'validate',
    );

    expect(outcome.result).toMatchObject({
      success: false,
      code: 68,
      delays: [],
    });
    expect(outcome.attempts).toBe(1);
    expect(outcome.stdout).toContain(diagnostic);
  });

  it('propagates the final subprocess error after exhausting retries', async () => {
    const diagnostic = 'Error Domain=kCFErrorDomainCFNetwork Code=-1001\n';
    const outcome = await runStaplerSubprocess(
      [{ code: 68, stderr: diagnostic }],
      'staple',
    );

    expect(outcome.result).toMatchObject({
      success: false,
      code: 68,
      delays: [5000, 10000],
    });
    expect(outcome.result.message).toContain(diagnostic.trim());
    expect(outcome.attempts).toBe(3);
    expect(outcome.stderr).toContain(diagnostic);
  });
});
