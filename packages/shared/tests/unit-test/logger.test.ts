import { afterEach, describe, expect, it, rs } from '@rstest/core';

const mocks = rs.hoisted(() => ({
  debugFn: rs.fn(),
}));

rs.mock('debug', () => ({
  default: rs.fn(() => mocks.debugFn),
}));

rs.mock('../../src/utils', () => ({
  ifInNode: false,
}));

import {
  getDebug,
  logReport,
  runWithConsoleLogHandler,
  runWithConsoleLogScope,
} from '../../src/logger';

describe('getDebug', () => {
  afterEach(() => {
    rs.restoreAllMocks();
    mocks.debugFn.mockClear();
  });

  it('does not throw when console logging cannot write', () => {
    const warnSpy = rs.spyOn(console, 'warn').mockImplementation(() => {
      throw new Error('write EIO');
    });
    const debugLog = getDebug('logger:test', { console: true });

    expect(() => {
      debugLog('android scan failed:', new Error('adb unavailable'));
    }).not.toThrow();

    expect(mocks.debugFn).toHaveBeenCalledWith(
      'android scan failed:',
      expect.any(Error),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      '[Midscene]',
      'android scan failed:',
      expect.any(Error),
    );
  });

  it('isolates concurrent console handlers and restores ordinary SDK output', async () => {
    const warn = rs.spyOn(console, 'warn').mockImplementation(() => {});
    const first = rs.fn();
    const second = rs.fn();
    const log = getDebug('logger:scoped', { console: true });
    await Promise.all([
      runWithConsoleLogHandler(first, async () => {
        await Promise.resolve();
        log('first warning');
        logReport('first report');
      }),
      runWithConsoleLogHandler(second, async () => {
        await Promise.resolve();
        log('second warning');
      }),
    ]);
    expect(first.mock.calls.map((call) => call[0].message)).toEqual([
      'first warning',
      'first report',
    ]);
    expect(second.mock.calls.map((call) => call[0].message)).toEqual([
      'second warning',
    ]);
    expect(warn).not.toHaveBeenCalled();
    expect(mocks.debugFn).toHaveBeenCalledWith('first warning');
    log('outside warning');
    expect(warn).toHaveBeenCalledWith('[Midscene]', 'outside warning');
  });

  it('keeps nested asynchronous warning scopes and per-call metadata isolated', async () => {
    const entries = rs.fn();
    await runWithConsoleLogHandler(entries, () =>
      runWithConsoleLogScope(
        { projectName: 'web', sourcePath: 'cases/shop.yaml' },
        () =>
          Promise.all(
            ['first', 'second'].map((caseName) =>
              runWithConsoleLogScope(
                {
                  projectName: 'web',
                  caseName,
                  phase: 'steps',
                  stepIndex: 0,
                  node: 'aiAct',
                },
                async () => {
                  await Promise.resolve();
                  const error = new Error(`${caseName} failure`);
                  getDebug('logger:metadata', {
                    console: true,
                    warning: {
                      kind: 'model-request-retry',
                      modelName: 'model',
                      error,
                      callId: caseName,
                      attempt: 1,
                      maxAttempts: 2,
                      delayMs: 2000,
                    },
                  })('request failed', error);
                },
              ),
            ),
          ),
      ),
    );
    expect(
      entries.mock.calls.map(([entry]) => ({
        caseName: entry.scope.caseName,
        sourcePath: entry.scope.sourcePath,
        callId: entry.warning.callId,
        error: entry.warning.error.message,
      })),
    ).toEqual(
      ['first', 'second'].map((caseName) => ({
        caseName,
        sourcePath: 'cases/shop.yaml',
        callId: caseName,
        error: `${caseName} failure`,
      })),
    );
    expect(entries.mock.calls[0][0].message).toContain('Error: first failure');
    expect(entries.mock.calls[0][0].args[1]).toBe(
      entries.mock.calls[0][0].warning.error,
    );
  });
});
