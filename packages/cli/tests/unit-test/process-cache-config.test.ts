import type { Cache } from '@midscene/core';
import { processCacheConfig } from '@midscene/core/utils';
import { beforeEach, describe, expect, test, vi } from 'vitest';

// Mock the global config manager to control environment variables
vi.mock('@midscene/shared/env', () => ({
  MIDSCENE_CACHE: 'MIDSCENE_CACHE',
  globalConfigManager: {
    getEnvConfigInBoolean: vi.fn(),
  },
}));

import { globalConfigManager } from '@midscene/shared/env';

describe('processCacheConfig in CLI', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic cache configuration', () => {
    test('should return cache object with ID when cache config is provided with ID', () => {
      const cacheConfig: Cache = {
        id: 'test-cache-id',
        strategy: 'read-write',
      };
      const result = processCacheConfig(cacheConfig, 'fallback-id');

      expect(result).toEqual({
        id: 'test-cache-id',
        strategy: 'read-write',
      });
    });

    test('should auto-generate ID when cache config is true', () => {
      const result = processCacheConfig(true, 'fallback-id');

      expect(result).toEqual({
        id: 'fallback-id',
      });
    });

    test('should auto-generate ID when cache config object has no ID', () => {
      const cacheConfig: Cache = { strategy: 'read-only' };
      const result = processCacheConfig(cacheConfig, 'fallback-id');

      expect(result).toEqual({
        id: 'fallback-id',
        strategy: 'read-only',
      });
    });

    test('should return undefined when cache config is false', () => {
      const result = processCacheConfig(false, 'fallback-id');

      expect(result).toBeUndefined();
    });

    test('should return undefined when cache config is undefined', () => {
      const result = processCacheConfig(undefined, 'fallback-id');

      expect(result).toBeUndefined();
    });
  });

  describe('Environment variable support (MIDSCENE_CACHE)', () => {
    test('should enable legacy cacheId when MIDSCENE_CACHE is true', () => {
      vi.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
        true,
      );

      const result = processCacheConfig(undefined, 'legacy-cache-id');

      expect(globalConfigManager.getEnvConfigInBoolean).toHaveBeenCalledWith(
        'MIDSCENE_CACHE',
      );
      expect(result).toEqual({
        id: 'legacy-cache-id',
      });
    });

    test('should disable legacy cacheId when MIDSCENE_CACHE is false', () => {
      vi.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
        false,
      );

      const result = processCacheConfig(undefined, 'legacy-cache-id');

      expect(globalConfigManager.getEnvConfigInBoolean).toHaveBeenCalledWith(
        'MIDSCENE_CACHE',
      );
      expect(result).toBeUndefined();
    });

    test('should prefer new cache config over legacy cacheId', () => {
      vi.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
        true,
      );

      const cacheConfig: Cache = { id: 'new-cache-id', strategy: 'read-write' };
      const result = processCacheConfig(cacheConfig, 'legacy-cache-id');

      expect(globalConfigManager.getEnvConfigInBoolean).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 'new-cache-id',
        strategy: 'read-write',
      });
    });

    test('should prefer new cache config over legacy cacheId even when env is false', () => {
      vi.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
        false,
      );

      const cacheConfig: Cache = { id: 'new-cache-id', strategy: 'read-write' };
      const result = processCacheConfig(cacheConfig, 'legacy-cache-id');

      expect(globalConfigManager.getEnvConfigInBoolean).not.toHaveBeenCalled();
      expect(result).toEqual({
        id: 'new-cache-id',
        strategy: 'read-write',
      });
    });
  });

  describe('Strategy handling', () => {
    test('should preserve strategy in cache config', () => {
      const strategies = ['read-only', 'read-write', 'write-only'] as const;

      strategies.forEach((strategy) => {
        const cacheConfig = { id: 'test-cache', strategy };
        const result = processCacheConfig(cacheConfig, 'fallback-id');

        expect(result).toEqual({
          id: 'test-cache',
          strategy,
        });
      });
    });

    test('should add default strategy when not provided', () => {
      const cacheConfig = { id: 'test-cache' };
      const result = processCacheConfig(cacheConfig, 'fallback-id');

      expect(result).toEqual({
        id: 'test-cache',
      });
    });
  });

  describe('Fallback ID generation', () => {
    test('should use provided fallback ID', () => {
      const result = processCacheConfig(true, 'my-custom-fallback-id');

      expect(result).toEqual({
        id: 'my-custom-fallback-id',
      });
    });

    test('should use fallback ID when cache object missing ID', () => {
      const cacheConfig: Cache = { strategy: 'read-only' };
      const result = processCacheConfig(cacheConfig, 'my-custom-fallback-id');

      expect(result).toEqual({
        id: 'my-custom-fallback-id',
        strategy: 'read-only',
      });
    });
  });

  describe('CLI-specific scenarios', () => {
    test('should handle YAML script cache configuration from file name', () => {
      // Simulate a scenario where cache config comes from YAML script
      const fileName = 'test-script';
      const yamlCacheConfig = { id: 'yaml-defined-cache' };

      const result = processCacheConfig(yamlCacheConfig, fileName);

      expect(result).toEqual({
        id: 'yaml-defined-cache',
      });
    });

    test('should generate cache ID from file name when YAML cache is true', () => {
      const fileName = 'test-script';
      const yamlCacheConfig = true;

      const result = processCacheConfig(yamlCacheConfig, fileName);

      expect(result).toEqual({
        id: 'test-script',
      });
    });

    test('should handle complex YAML cache configuration', () => {
      const fileName = 'complex-test';
      const yamlCacheConfig: Cache = {
        id: 'complex-cache',
        strategy: 'read-only',
        // Additional properties that might be in YAML
        customProp: 'should-be-preserved',
      } as Cache;

      const result = processCacheConfig(yamlCacheConfig, fileName);

      expect(result).toEqual({
        id: 'complex-cache',
        strategy: 'read-only',
        customProp: 'should-be-preserved',
      });
    });
  });

  describe('Backward compatibility', () => {
    test('should handle legacy cacheId with environment variable correctly', () => {
      vi.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
        true,
      );

      // Simulate old-style cache configuration
      const result = processCacheConfig(undefined, 'my-legacy-cache');

      expect(result).toEqual({
        id: 'my-legacy-cache',
      });
    });

    test('should ignore legacy cacheId when environment variable is not set', () => {
      vi.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
        false,
      );

      const result = processCacheConfig(undefined, 'my-legacy-cache');

      expect(result).toBeUndefined();
    });
  });
});
