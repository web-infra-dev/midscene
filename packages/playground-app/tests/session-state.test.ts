import { describe, expect, test } from 'vitest';
import { resolveAutoCreateSessionInput } from '../src/session-setup';
import {
  buildSessionInitialValues,
  resolveSessionViewState,
} from '../src/session-state';

describe('playground session state helpers', () => {
  test('resolves session connection state from runtime metadata', () => {
    expect(
      resolveSessionViewState({
        interface: { type: 'android' },
        preview: { kind: 'scrcpy', capabilities: [] },
        executionUxHints: [],
        metadata: {
          sessionConnected: true,
          sessionDisplayName: 'SERIAL123',
          setupState: 'ready',
        },
      }),
    ).toEqual({
      connected: true,
      displayName: 'SERIAL123',
      setupState: 'ready',
      setupBlockingReason: undefined,
    });
  });

  test('builds initial values from lightweight session setup schema', () => {
    expect(
      buildSessionInitialValues({
        fields: [
          {
            key: 'host',
            label: 'Host',
            type: 'text',
            defaultValue: 'localhost',
          },
          { key: 'port', label: 'Port', type: 'number', defaultValue: 8100 },
        ],
      }),
    ).toEqual({
      host: 'localhost',
      port: 8100,
    });
  });

  test('resolves auto-create input from setup defaults', () => {
    expect(
      resolveAutoCreateSessionInput({
        autoSubmitWhenReady: true,
        fields: [
          {
            key: 'deviceId',
            label: 'ADB device',
            type: 'select',
            required: true,
            defaultValue: 'SERIAL123',
          },
        ],
      }),
    ).toEqual({
      deviceId: 'SERIAL123',
    });
  });

  test('skips auto-create when required setup is incomplete', () => {
    expect(
      resolveAutoCreateSessionInput({
        autoSubmitWhenReady: true,
        fields: [
          {
            key: 'deviceId',
            label: 'ADB device',
            type: 'select',
            required: true,
          },
        ],
      }),
    ).toBeNull();
  });
});
