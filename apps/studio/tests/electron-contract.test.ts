import { describe, expect, it } from 'vitest';
import { IPC_CHANNELS } from '../src/shared/electron-contract';

describe('IPC_CHANNELS', () => {
  it('includes Android playground runtime bridge channels', () => {
    expect(IPC_CHANNELS.getAndroidPlaygroundBootstrap).toBe(
      'studio:get-android-playground-bootstrap',
    );
    expect(IPC_CHANNELS.restartAndroidPlayground).toBe(
      'studio:restart-android-playground',
    );
  });
});
