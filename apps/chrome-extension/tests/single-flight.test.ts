import { describe, expect, it, vi } from 'vitest';
import { runSingleFlight } from '../src/extension/recorder/hooks/singleFlight';

describe('runSingleFlight', () => {
  it('shares an in-progress operation and allows a new one after it settles', async () => {
    let resolveOperation: (() => void) | undefined;
    const operation = new Promise<void>((resolve) => {
      resolveOperation = resolve;
    });
    const action = vi.fn(() => operation);
    const inFlightOperation = { current: null as Promise<void> | null };

    const firstRequest = runSingleFlight(inFlightOperation, action);
    const secondRequest = runSingleFlight(inFlightOperation, action);

    expect(action).toHaveBeenCalledTimes(1);
    expect(secondRequest).toBe(firstRequest);

    resolveOperation?.();
    await firstRequest;
    expect(inFlightOperation.current).toBeNull();

    await runSingleFlight(inFlightOperation, action);
    expect(action).toHaveBeenCalledTimes(2);
  });
});
