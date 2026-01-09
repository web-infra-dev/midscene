import { describe, expect, test } from 'vitest';

describe('ts-runner types', () => {
  test('CdpConfig type accepts string', () => {
    const stringConfig: import('@/ts-runner/types').CdpConfig =
      'ws://localhost:9222/devtools/browser/abc123';
    expect(typeof stringConfig).toBe('string');
  });

  test('CdpConfig type accepts object with all fields', () => {
    const objectConfig: import('@/ts-runner/types').CdpConfig = {
      endpoint: 'ws://localhost:9222/devtools/browser/abc123',
      apiKey: 'test-key',
      tabUrl: 'https://example.com',
      tabIndex: 0,
    };
    expect(objectConfig.endpoint).toBe(
      'ws://localhost:9222/devtools/browser/abc123',
    );
    expect(objectConfig.apiKey).toBe('test-key');
  });

  test('CdpConfig type accepts object with only endpoint', () => {
    const minimalConfig: import('@/ts-runner/types').CdpConfig = {
      endpoint: 'ws://localhost:9222/devtools/browser/abc123',
    };
    expect(minimalConfig.endpoint).toBeDefined();
  });

  test('LaunchConfig type accepts all fields', () => {
    const config: import('@/ts-runner/types').LaunchConfig = {
      headed: true,
      url: 'https://example.com',
      viewport: { width: 1024, height: 768 },
    };

    expect(config.headed).toBe(true);
    expect(config.url).toBe('https://example.com');
    expect(config.viewport).toEqual({ width: 1024, height: 768 });
  });

  test('LaunchConfig type accepts empty object', () => {
    const config: import('@/ts-runner/types').LaunchConfig = {};
    expect(config).toEqual({});
  });
});
