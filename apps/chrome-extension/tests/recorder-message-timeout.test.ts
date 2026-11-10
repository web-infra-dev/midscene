import { describe, expect, it, rs } from '@rstest/core';
import { withRecorderMessageTimeout } from '../src/extension/recorder/messageTimeout';

describe('withRecorderMessageTimeout', () => {
  it('rejects a message that never responds', async () => {
    rs.useFakeTimers();
    const operation = withRecorderMessageTimeout(
      new Promise<never>(() => {}),
      'recording cleanup (tab 42)',
      2_000,
    );

    const assertion = expect(operation).rejects.toEqual(
      expect.objectContaining({
        name: 'RecorderMessageTimeoutError',
        operation: 'recording cleanup (tab 42)',
        timeoutMs: 2_000,
      }),
    );
    await rs.advanceTimersByTimeAsync(2_000);
    await assertion;
    rs.useRealTimers();
  });

  it('returns a response that arrives before the timeout', async () => {
    await expect(
      withRecorderMessageTimeout(Promise.resolve({ success: true }), 'ping', 1),
    ).resolves.toEqual({ success: true });
  });

  it('does not leave an outer startup action pending when a nested operation stalls', async () => {
    rs.useFakeTimers();
    const startup = withRecorderMessageTimeout(
      new Promise<never>(() => {}),
      'recording startup at inject recorder scripts',
      15_000,
    );

    const assertion = expect(startup).rejects.toEqual(
      expect.objectContaining({
        operation: 'recording startup at inject recorder scripts',
        timeoutMs: 15_000,
      }),
    );
    await rs.advanceTimersByTimeAsync(15_000);
    await assertion;
    rs.useRealTimers();
  });
});
