import { describe, expect, it, vi } from 'vitest';

vi.mock('undici', () => ({
  ProxyAgent: vi.fn(),
}));

import { ProxyAgent } from 'undici';
import {
  createLoggedProxyDispatcher,
  createProxyDispatcher,
  getProxyUrl,
  sanitizeProxyUrl,
} from '../../scripts/proxy-dispatcher.mjs';

describe('proxy dispatcher helper', () => {
  it('prefers HTTPS proxy environment variables for release downloads', () => {
    expect(
      getProxyUrl({
        HTTPS_PROXY: 'http://secure-proxy.example.com:8443',
        HTTP_PROXY: 'http://proxy.example.com:8080',
      }),
    ).toBe('http://secure-proxy.example.com:8443');
  });

  it('falls back to lowercase proxy environment variables', () => {
    expect(
      getProxyUrl({
        https_proxy: 'http://lowercase-proxy.example.com:8443',
      }),
    ).toBe('http://lowercase-proxy.example.com:8443');
  });

  it('sanitizes proxy credentials in logs', () => {
    expect(sanitizeProxyUrl('http://user:secret@proxy.example.com:8080')).toBe(
      'http://user:****@proxy.example.com:8080/',
    );
  });

  it('creates a ProxyAgent-compatible dispatcher when proxy is configured', () => {
    const dispatcher = createProxyDispatcher({
      proxyUrl: 'http://proxy.example.com:8080',
    });

    expect(ProxyAgent).toHaveBeenCalledWith({
      uri: 'http://proxy.example.com:8080',
    });
    expect(dispatcher).toBeInstanceOf(ProxyAgent as any);
  });

  it('returns undefined when no proxy is configured', () => {
    expect(createProxyDispatcher()).toBeUndefined();
  });

  it('logs sanitized proxy url and creates dispatcher from env', () => {
    const log = vi.fn();

    createLoggedProxyDispatcher({
      env: {
        HTTPS_PROXY: 'http://user:secret@proxy.example.com:8080',
      },
      log,
      logPrefix: 'scrcpy',
    });

    expect(log).toHaveBeenCalledWith(
      '[scrcpy] Using proxy: http://user:****@proxy.example.com:8080/',
    );
    expect(ProxyAgent).toHaveBeenLastCalledWith({
      uri: 'http://user:secret@proxy.example.com:8080',
    });
  });
});
