import { describe, expect, test } from 'vitest';
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
});
