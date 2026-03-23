import { describe, expect, test } from 'vitest';
import {
  normalizeExecutionUxHints,
  normalizeRuntimeDeviceType,
  resolvePreviewConnectionInfo,
} from '../src/runtime-info';

describe('playground app runtime info helpers', () => {
  test('normalizes device type from runtime platform metadata', () => {
    expect(
      normalizeRuntimeDeviceType(
        {
          platformId: 'computer',
          interface: { type: 'computer' },
          preview: { kind: 'screenshot', capabilities: [] },
          executionUxHints: [],
          metadata: {},
        },
        'web',
      ),
    ).toBe('computer');
  });

  test('filters unsupported execution ux hints', () => {
    expect(
      normalizeExecutionUxHints({
        interface: { type: 'computer' },
        preview: { kind: 'screenshot', capabilities: [] },
        executionUxHints: ['countdown-before-run', 'unknown-hint'],
        metadata: {},
      }),
    ).toEqual(['countdown-before-run']);
  });

  test('resolves preview connection information from runtime metadata', () => {
    expect(
      resolvePreviewConnectionInfo(
        {
          interface: { type: 'ios' },
          preview: {
            kind: 'mjpeg',
            mjpegPath: '/custom-stream',
            capabilities: [],
          },
          executionUxHints: [],
          metadata: {},
        },
        'http://localhost:5800',
      ),
    ).toMatchObject({
      type: 'mjpeg',
      mjpegUrl: 'http://localhost:5800/custom-stream',
    });

    expect(
      resolvePreviewConnectionInfo(
        {
          interface: { type: 'android' },
          preview: {
            kind: 'scrcpy',
            capabilities: [],
            custom: { scrcpyPort: 6501 },
          },
          executionUxHints: [],
          metadata: {},
        },
        'http://localhost:5800',
      ),
    ).toMatchObject({
      type: 'scrcpy',
      scrcpyPort: 6501,
    });
  });
});
