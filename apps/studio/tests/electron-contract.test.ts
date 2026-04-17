import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../src/shared/electron-contract';

describe('IPC_CHANNELS', () => {
  it('includes shell and playground bridge channels', () => {
    expect(IPC_CHANNELS.openExternalUrl).toBe('shell:open-external-url');
    // Multi-platform playground channels
    expect(IPC_CHANNELS.getPlaygroundBootstrap).toBe(
      'studio:get-playground-bootstrap',
    );
    expect(IPC_CHANNELS.restartPlayground).toBe('studio:restart-playground');
    // Legacy aliases resolve to the same channel names
    expect(IPC_CHANNELS.getAndroidPlaygroundBootstrap).toBe(
      IPC_CHANNELS.getPlaygroundBootstrap,
    );
    expect(IPC_CHANNELS.restartAndroidPlayground).toBe(
      IPC_CHANNELS.restartPlayground,
    );
  });
});
