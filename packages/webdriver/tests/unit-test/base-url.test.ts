import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { WebDriverClient } from '../../src/clients/WebDriverClient';
import { WDAManager } from '../../src/managers/WDAManager';
import { normalizeWebDriverBaseUrl } from '../../src/utils/base-url';

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe('WebDriver base URL', () => {
  it.each(['/code/wda', '/wda/code'])(
    'preserves the gateway prefix %s for session and command requests',
    async (prefix) => {
      const urls: string[] = [];
      globalThis.fetch = rs.fn(async (input) => {
        urls.push(String(input));
        return new Response(
          JSON.stringify({ sessionId: 'test-session', value: 'screenshot' }),
          { headers: { 'content-type': 'application/json' } },
        );
      }) as typeof fetch;

      const client = new WebDriverClient({
        baseUrl: `https://gateway.example:8100${prefix}/`,
      });
      await client.getDeviceInfo();
      await client.createSession();
      await client.takeScreenshot();
      await client.deleteSession();

      expect(urls).toEqual([
        `https://gateway.example:8100${prefix}/status`,
        `https://gateway.example:8100${prefix}/session`,
        `https://gateway.example:8100${prefix}/session/test-session/screenshot`,
        `https://gateway.example:8100${prefix}/session/test-session`,
      ]);
    },
  );

  it('uses the same base URL for readiness and keeps different prefixes separate', async () => {
    const urls: string[] = [];
    globalThis.fetch = rs.fn(async (input) => {
      urls.push(String(input));
      return new Response(JSON.stringify({ sessionId: null }), {
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const first = WDAManager.getInstance(
      8100,
      'gateway.example',
      'https://gateway.example:8100/code/wda/',
    );
    const same = WDAManager.getInstance(
      8100,
      'gateway.example',
      'https://gateway.example:8100/code/wda',
    );
    const second = WDAManager.getInstance(
      8100,
      'gateway.example',
      'https://gateway.example:8100/wda/code',
    );

    expect(same).toBe(first);
    expect(second).not.toBe(first);
    expect(first.getHost()).toBe('gateway.example');
    expect(first.getPort()).toBe(8100);
    await first.start();
    await second.start();
    expect(urls).toEqual([
      'https://gateway.example:8100/code/wda/status',
      'https://gateway.example:8100/wda/code/status',
    ]);
  });

  it.each([
    '',
    'ftp://gateway.example/wda',
    'https://gateway.example/wda?token=abc',
    'https://gateway.example/wda?',
    'https://gateway.example/wda#',
    'https://user:pass@gateway.example/wda',
    'not a URL',
  ])('rejects an unsupported base URL: %s', (value) => {
    expect(() => normalizeWebDriverBaseUrl(value)).toThrow();
  });
});
