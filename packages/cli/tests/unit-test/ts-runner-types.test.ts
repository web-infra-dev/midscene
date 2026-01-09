import type { CdpConfig, LaunchConfig } from '@/ts-runner/types';
import { describe, expect, test } from 'vitest';

describe('ts-runner types', () => {
  test('CdpConfig type accepts string', () => {
    const config: CdpConfig = 'ws://localhost:9222/devtools/browser/abc123';
    expect(typeof config).toBe('string');
  });

  test('CdpConfig type accepts object with all fields', () => {
    const config: CdpConfig = {
      endpoint: 'ws://localhost:9222/devtools/browser/abc123',
      apiKey: 'test-key',
      tabUrl: 'https://example.com',
      tabIndex: 0,
    };
    expect(config.endpoint).toBe('ws://localhost:9222/devtools/browser/abc123');
    expect(config.apiKey).toBe('test-key');
  });

  test('CdpConfig type accepts object with only endpoint', () => {
    const config: CdpConfig = {
      endpoint: 'ws://localhost:9222/devtools/browser/abc123',
    };
    expect(config.endpoint).toBeDefined();
  });

  test('LaunchConfig type accepts all fields', () => {
    const config: LaunchConfig = {
      headed: true,
      url: 'https://example.com',
      viewport: { width: 1024, height: 768 },
    };
    expect(config.headed).toBe(true);
    expect(config.url).toBe('https://example.com');
    expect(config.viewport).toEqual({ width: 1024, height: 768 });
  });

  test('LaunchConfig type accepts empty object', () => {
    const config: LaunchConfig = {};
    expect(config).toEqual({});
  });
});
