import { waitForRetry } from '@/ai-model/service-caller/request-timeout';
import { callAiAndParseWithRetry } from '@/ai-model/service-caller/semantic-retry';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

afterEach(() => {
  rs.useRealTimers();
});

describe('cancellable retry waiting', () => {
  it('rejects immediately when cancelled during the wait', async () => {
    rs.useFakeTimers();
    const controller = new AbortController();
    const promise = waitForRetry(60_000, controller.signal);
    const assertion = expect(promise).rejects.toThrow('stop');
    controller.abort(new Error('stop'));
    await assertion;
    expect(rs.getTimerCount()).toBe(0);
  });
  it('does not schedule a timer when already cancelled', () => {
    rs.useFakeTimers();
    const controller = new AbortController();
    controller.abort(new Error('stop'));
    expect(() => waitForRetry(60_000, controller.signal)).toThrow('stop');
    expect(rs.getTimerCount()).toBe(0);
  });
  it('cleans up the abort listener when backoff completes', async () => {
    rs.useFakeTimers();
    const controller = new AbortController();
    const remove = rs.spyOn(controller.signal, 'removeEventListener');
    const promise = waitForRetry(20, controller.signal);
    await rs.advanceTimersByTimeAsync(20);
    await promise;
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
    expect(rs.getTimerCount()).toBe(0);
  });
  it('propagates request failures without parsing retries', async () => {
    const callAi = rs.fn().mockRejectedValue(new Error('request failed'));
    const parseResponse = rs.fn();
    await expect(
      callAiAndParseWithRetry({
        callAi,
        parseResponse,
        toParseError: (error) => error as Error,
        parseRetryTimes: 3,
      }),
    ).rejects.toThrow('request failed');
    expect(callAi).toHaveBeenCalledTimes(1);
    expect(parseResponse).not.toHaveBeenCalled();
  });
});
