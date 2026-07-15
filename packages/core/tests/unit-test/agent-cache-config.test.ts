import { validateAgentCacheInput } from '@/agent/cache-config';
import { describe, expect, it } from 'vitest';

describe('validateAgentCacheInput', () => {
  it('accepts disabled or valid cache config', () => {
    expect(() => validateAgentCacheInput(undefined)).not.toThrow();
    expect(() => validateAgentCacheInput(false)).not.toThrow();
    expect(() =>
      validateAgentCacheInput({
        id: 'custom-cache-id',
        strategy: 'read-write',
        verify: 'action',
        cacheDir: './cache',
      }),
    ).not.toThrow();
    expect(() =>
      validateAgentCacheInput({
        id: 'custom-cache-id',
        verify: false,
      }),
    ).not.toThrow();
  });

  it('rejects cache: true because Agent requires explicit cache id', () => {
    expect(() => validateAgentCacheInput(true)).toThrow(
      'cache: true requires an explicit cache ID',
    );
  });

  it('rejects cache object without explicit id', () => {
    expect(() =>
      validateAgentCacheInput({
        strategy: 'read-only',
      } as any),
    ).toThrow('cache configuration requires an explicit id');
  });

  it('rejects empty cacheDir', () => {
    expect(() =>
      validateAgentCacheInput({
        id: 'custom-cache-id',
        cacheDir: '  ',
      }),
    ).toThrow('cache.cacheDir must be a non-empty string when provided');
  });

  it('rejects non-string strategy', () => {
    expect(() =>
      validateAgentCacheInput({
        id: 'custom-cache-id',
        strategy: 1,
      } as any),
    ).toThrow('cache.strategy must be a string when provided');
  });

  it('rejects unsupported strategy', () => {
    expect(() =>
      validateAgentCacheInput({
        id: 'custom-cache-id',
        strategy: 'invalid',
      } as any),
    ).toThrow(
      'cache.strategy must be one of "read-only", "read-write", "write-only"',
    );
  });

  it('rejects unsupported cache verification mode', () => {
    expect(() =>
      validateAgentCacheInput({
        id: 'custom-cache-id',
        verify: 'workflow',
      } as any),
    ).toThrow('cache.verify must be false or one of "action"');
  });

  it('rejects non-string cache verification mode', () => {
    expect(() =>
      validateAgentCacheInput({
        id: 'custom-cache-id',
        verify: true,
      } as any),
    ).toThrow('cache.verify must be false or a string when provided');
  });
});
