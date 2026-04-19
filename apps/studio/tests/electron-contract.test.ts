import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../src/shared/electron-contract';

describe('IPC_CHANNELS', () => {
  it('includes shell and playground bridge channels', () => {
    expect(IPC_CHANNELS.openExternalUrl).toBe('shell:open-external-url');
    expect(IPC_CHANNELS.getPlaygroundBootstrap).toBe(
      'studio:get-playground-bootstrap',
    );
    expect(IPC_CHANNELS.restartPlayground).toBe('studio:restart-playground');
    expect(IPC_CHANNELS.discoverDevices).toBe('studio:discover-devices');
  });
});
