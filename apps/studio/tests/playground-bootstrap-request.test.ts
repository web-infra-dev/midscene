import { describe, expect, it, rs } from '@rstest/core';
import { requestPlaygroundBootstrap } from '../src/main/playground/bootstrap-request';
import type { PlaygroundRuntimeService } from '../src/main/playground/types';

function createRuntimeMock(
  overrides: Partial<PlaygroundRuntimeService> = {},
): PlaygroundRuntimeService {
  return {
    close: rs.fn().mockResolvedValue(undefined),
    getBootstrap: rs.fn().mockReturnValue({
      status: 'starting',
      serverUrl: null,
      port: null,
      error: null,
    }),
    restart: rs.fn(),
    start: rs.fn().mockResolvedValue({
      status: 'ready',
      serverUrl: 'http://127.0.0.1:3000',
      port: 3000,
      error: null,
    }),
    ...overrides,
  };
}

describe('requestPlaygroundBootstrap', () => {
  it('returns the current bootstrap immediately while starting in background', () => {
    const runtime = createRuntimeMock();
    const onStartError = rs.fn();

    const bootstrap = requestPlaygroundBootstrap(runtime, onStartError);

    expect(runtime.start).toHaveBeenCalledTimes(1);
    expect(runtime.getBootstrap).toHaveBeenCalledTimes(1);
    expect(onStartError).not.toHaveBeenCalled();
    expect(bootstrap).toEqual({
      status: 'starting',
      serverUrl: null,
      port: null,
      error: null,
    });
  });

  it('reports asynchronous start failures without throwing synchronously', async () => {
    const failure = new Error('runtime failed');
    const runtime = createRuntimeMock({
      start: rs.fn().mockRejectedValue(failure),
    });
    const onStartError = rs.fn();

    const bootstrap = requestPlaygroundBootstrap(runtime, onStartError);
    await Promise.resolve();
    await Promise.resolve();

    expect(bootstrap.status).toBe('starting');
    expect(onStartError).toHaveBeenCalledWith(failure);
  });
});
