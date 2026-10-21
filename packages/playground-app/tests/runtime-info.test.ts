import { describe, expect, test } from '@rstest/core';
import {
  buildFallbackRuntimeInfo,
  filterValidExecutionUxHints,
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
      filterValidExecutionUxHints({
        interface: { type: 'computer' },
        preview: { kind: 'screenshot', capabilities: [] },
        executionUxHints: ['countdown-before-run', 'unknown-hint'],
        metadata: {},
      }),
    ).toEqual(['countdown-before-run']);
  });

  test('builds fallback runtime info from the latest known runtime snapshot', () => {
    expect(
      buildFallbackRuntimeInfo(
        {
          interface: { type: 'web' },
          preview: { kind: 'mjpeg', capabilities: [] },
          executionUxHints: ['countdown-before-run'],
          metadata: { source: 'previous' },
        },
        { type: 'computer', description: 'Fallback interface' },
      ),
    ).toMatchObject({
      interface: { type: 'computer', description: 'Fallback interface' },
      preview: { kind: 'mjpeg' },
      executionUxHints: ['countdown-before-run'],
      metadata: { source: 'previous' },
    });
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
          metadata: { deviceId: 'SERIAL123' },
        },
        'http://localhost:5800',
      ),
    ).toMatchObject({
      deviceId: 'SERIAL123',
      type: 'scrcpy',
      scrcpyPort: 6501,
      scrcpyUrl: 'http://127.0.0.1:6501/',
    });
  });

  test('rewrites scrcpy preview URL onto the runtime host', () => {
    expect(
      resolvePreviewConnectionInfo(
        {
          interface: { type: 'android' },
          preview: {
            kind: 'scrcpy',
            capabilities: [],
            custom: { scrcpyPort: 7700 },
          },
          executionUxHints: [],
          metadata: {},
        },
        'https://midscene.example.com:5800/playground?mode=debug#preview',
      ),
    ).toMatchObject({
      type: 'scrcpy',
      scrcpyPort: 7700,
      scrcpyUrl: 'https://midscene.example.com:7700/',
    });
  });

  test.each([
    ['192.168.1.100', 'http://localhost:5800', 'http://192.168.1.100:7700/'],
    ['192.168.1.100', 'http://127.0.0.1:5800', 'http://192.168.1.100:7700/'],
    ['127.0.0.1', 'http://localhost:5800', 'http://127.0.0.1:7700/'],
    ['0.0.0.0', 'http://localhost:5800', 'http://127.0.0.1:7700/'],
    ['0.0.0.0', 'http://192.168.1.100:5800', 'http://192.168.1.100:7700/'],
    ['::1', 'http://localhost:5800', 'http://[::1]:7700/'],
    ['::', 'http://localhost:5800', 'http://[::1]:7700/'],
    ['2001:db8::1', 'http://localhost:5800', 'http://[2001:db8::1]:7700/'],
    [
      '192.168.1.100',
      'https://midscene.example.com:5800',
      'https://midscene.example.com:7700/',
    ],
  ])(
    'resolves Scrcpy host %s from runtime URL %s',
    (scrcpyHost, serverUrl, expected) => {
      expect(
        resolvePreviewConnectionInfo(
          {
            interface: { type: 'android' },
            preview: {
              kind: 'scrcpy',
              capabilities: [],
              custom: { scrcpyPort: 7700, scrcpyHost },
            },
            executionUxHints: [],
            metadata: {},
          },
          serverUrl,
        ).scrcpyUrl,
      ).toBe(expected);
    },
  );

  test('falls back to screenshot polling for remote android devices', () => {
    expect(
      resolvePreviewConnectionInfo(
        {
          interface: { type: 'android' },
          preview: {
            kind: 'scrcpy',
            capabilities: [],
            custom: { scrcpyPort: 7700 },
          },
          executionUxHints: [],
          metadata: { deviceId: '192.168.1.10:5555' },
        },
        'http://localhost:5800',
      ),
    ).toMatchObject({
      type: 'screenshot',
    });
  });
});
