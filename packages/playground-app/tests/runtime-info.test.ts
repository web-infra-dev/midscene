import { describe, expect, test } from 'vitest';
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
          metadata: {},
        },
        'http://localhost:5800',
      ),
    ).toMatchObject({
      type: 'scrcpy',
      scrcpyPort: 6501,
      scrcpyUrl: 'http://localhost:6501/',
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
