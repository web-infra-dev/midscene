import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../src/shared/electron-contract';

describe('IPC_CHANNELS', () => {
  it('includes shell and Android playground bridge channels', () => {
    expect(IPC_CHANNELS.openExternalUrl).toBe('shell:open-external-url');
    expect(IPC_CHANNELS.getAndroidPlaygroundBootstrap).toBe(
      'studio:get-android-playground-bootstrap',
    );
    expect(IPC_CHANNELS.restartAndroidPlayground).toBe(
      'studio:restart-android-playground',
    );
  });
});
