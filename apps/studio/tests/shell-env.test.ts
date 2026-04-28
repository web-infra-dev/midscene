import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  configureStudioShellEnvHydration,
  ensureStudioShellEnvHydrated,
  hydrateLoginShellEnv,
  resetStudioShellEnvHydrationForTests,
} from '../src/main/shell-env';

const MARKER = '___MIDSCENE_SHELL_ENV___';

function fakeShellOutput(entries: Record<string, string>, noise = ''): string {
  const body = Object.entries(entries)
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');
  return `${noise}${MARKER}\n${body}\n`;
}

afterEach(() => {
  resetStudioShellEnvHydrationForTests();
});

describe('hydrateLoginShellEnv', () => {
  it('skips non-packaged runs (dev already inherits shell env)', () => {
    const env: NodeJS.ProcessEnv = {};
    const runShell = vi.fn();
    const result = hydrateLoginShellEnv({
      isPackaged: false,
      platform: 'darwin',
      env,
      runShell,
    });
    expect(result).toEqual({
      applied: false,
      reason: 'not-packaged',
      mutatedKeys: [],
    });
    expect(runShell).not.toHaveBeenCalled();
  });

  it('skips Windows (GUI launches inherit env there)', () => {
    const runShell = vi.fn();
    const result = hydrateLoginShellEnv({
      isPackaged: true,
      platform: 'win32',
      env: {},
      runShell,
    });
    expect(result.applied).toBe(false);
    expect(result.reason).toBe('windows');
    expect(runShell).not.toHaveBeenCalled();
  });

  it('merges missing keys like ANDROID_HOME into process.env', () => {
    const env: NodeJS.ProcessEnv = { HOME: '/Users/test', PATH: '/usr/bin' };
    const result = hydrateLoginShellEnv({
      isPackaged: true,
      platform: 'darwin',
      env,
      runShell: () =>
        fakeShellOutput({
          ANDROID_HOME: '/Users/test/Library/Android/sdk',
          ANDROID_SDK_ROOT: '/Users/test/Library/Android/sdk',
          PATH: '/Users/test/Library/Android/sdk/platform-tools:/usr/bin',
        }),
    });
    expect(result.applied).toBe(true);
    expect(env.ANDROID_HOME).toBe('/Users/test/Library/Android/sdk');
    expect(env.ANDROID_SDK_ROOT).toBe('/Users/test/Library/Android/sdk');
    expect(result.mutatedKeys).toEqual(
      expect.arrayContaining(['ANDROID_HOME', 'ANDROID_SDK_ROOT', 'PATH']),
    );
  });

  it('force-overrides PATH so adb/hdc become discoverable', () => {
    const env: NodeJS.ProcessEnv = { PATH: '/usr/bin:/bin' };
    hydrateLoginShellEnv({
      isPackaged: true,
      platform: 'darwin',
      env,
      runShell: () =>
        fakeShellOutput({ PATH: '/opt/homebrew/bin:/usr/bin:/bin' }),
    });
    expect(env.PATH).toBe('/opt/homebrew/bin:/usr/bin:/bin');
  });

  it('preserves non-PATH keys that already exist (system/Electron wins)', () => {
    const env: NodeJS.ProcessEnv = {
      HOME: '/Users/real',
      ANDROID_HOME: '/explicit/override',
    };
    hydrateLoginShellEnv({
      isPackaged: true,
      platform: 'darwin',
      env,
      runShell: () =>
        fakeShellOutput({
          HOME: '/Users/ignored',
          ANDROID_HOME: '/Users/ignored/sdk',
        }),
    });
    expect(env.HOME).toBe('/Users/real');
    expect(env.ANDROID_HOME).toBe('/explicit/override');
  });

  it('ignores rc-file stdout noise preceding the marker', () => {
    const env: NodeJS.ProcessEnv = {};
    hydrateLoginShellEnv({
      isPackaged: true,
      platform: 'darwin',
      env,
      runShell: () =>
        fakeShellOutput(
          { ANDROID_HOME: '/sdk' },
          'welcome banner\nsome=thing that should not leak\n',
        ),
    });
    expect(env.ANDROID_HOME).toBe('/sdk');
    expect(env.some).toBeUndefined();
  });

  it('reports shell-failed without throwing when the spawn rejects', () => {
    const log = vi.fn();
    const env: NodeJS.ProcessEnv = {};
    const result = hydrateLoginShellEnv({
      isPackaged: true,
      platform: 'darwin',
      env,
      runShell: () => {
        throw new Error('shell missing');
      },
      log,
    });
    expect(result).toEqual({
      applied: false,
      reason: 'shell-failed',
      mutatedKeys: [],
    });
    expect(log).toHaveBeenCalledWith(
      'login shell env extraction failed',
      expect.any(Error),
    );
  });

  it('skips malformed lines without a valid identifier', () => {
    const env: NodeJS.ProcessEnv = {};
    hydrateLoginShellEnv({
      isPackaged: true,
      platform: 'darwin',
      env,
      runShell: () => `${MARKER}\n=nokey\n9FOO=bad\nBAD KEY=x\nGOOD=yes\n`,
    });
    expect(env.GOOD).toBe('yes');
    expect(env['']).toBeUndefined();
    expect(env['9FOO']).toBeUndefined();
    expect(env['BAD KEY']).toBeUndefined();
  });
});

describe('ensureStudioShellEnvHydrated', () => {
  it('throws until studio hydration is configured', () => {
    expect(() => ensureStudioShellEnvHydrated()).toThrow(
      'Studio shell env hydration was used before it was configured.',
    );
  });

  it('hydrates at most once after configuration', () => {
    const runShell = vi.fn(() =>
      fakeShellOutput({
        PATH: '/opt/homebrew/bin:/usr/bin:/bin',
        ANDROID_HOME: '/sdk',
      }),
    );

    configureStudioShellEnvHydration({
      env: { PATH: '/usr/bin:/bin' },
      isPackaged: true,
      platform: 'darwin',
      runShell,
    });

    const first = ensureStudioShellEnvHydrated();
    const second = ensureStudioShellEnvHydrated();

    expect(runShell).toHaveBeenCalledTimes(1);
    expect(first).toEqual(second);
    expect(first.mutatedKeys).toEqual(
      expect.arrayContaining(['PATH', 'ANDROID_HOME']),
    );
  });
});
