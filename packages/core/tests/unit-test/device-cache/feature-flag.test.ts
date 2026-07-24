import { isNativeXpathCacheEnabled } from '@/device-cache';
import { MIDSCENE_EXPERIMENTAL_NATIVE_XPATH_CACHE } from '@midscene/shared/env';
import { afterEach, describe, expect, it, vi } from 'vitest';

describe('native xpath cache feature flag', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('is disabled by default', () => {
    vi.stubEnv(MIDSCENE_EXPERIMENTAL_NATIVE_XPATH_CACHE, undefined);
    expect(isNativeXpathCacheEnabled()).toBe(false);
  });

  it('is enabled only when explicitly configured', () => {
    vi.stubEnv(MIDSCENE_EXPERIMENTAL_NATIVE_XPATH_CACHE, '1');
    expect(isNativeXpathCacheEnabled()).toBe(true);
  });
});
