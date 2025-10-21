import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the global config manager to control environment variables
// IMPORTANT: This must be before any imports that might use @midscene/shared/env
vi.mock('@midscene/shared/env', () => ({
  MIDSCENE_CACHE: 'MIDSCENE_CACHE',
  globalConfigManager: {
    getEnvConfigInBoolean: vi.fn(),
  },
}));

import { PlaywrightAiFixture } from '@/playwright/ai-fixture';
import { processCacheConfig } from '@midscene/core/utils';
import { globalConfigManager } from '@midscene/shared/env';

describe('PlaywrightAiFixture Cache Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should create fixture with cache: false configuration', () => {
    const fixture = PlaywrightAiFixture({
      cache: false,
    });

    expect(fixture).toBeDefined();
    expect(fixture.agentForPage).toBeDefined();
  });

  it('should create fixture with cache: true configuration', () => {
    const fixture = PlaywrightAiFixture({
      cache: true,
    });

    expect(fixture).toBeDefined();
    expect(fixture.agentForPage).toBeDefined();
  });

  it('should create fixture with cache object configuration', () => {
    const fixture = PlaywrightAiFixture({
      cache: { id: 'custom-cache-id' },
    });

    expect(fixture).toBeDefined();
    expect(fixture.agentForPage).toBeDefined();
  });

  it('should create fixture with cache strategy configuration', () => {
    const fixture = PlaywrightAiFixture({
      cache: { strategy: 'read-only', id: 'readonly-cache' },
    });

    expect(fixture).toBeDefined();
    expect(fixture.agentForPage).toBeDefined();
  });

  it('should create fixture with no cache configuration', () => {
    const fixture = PlaywrightAiFixture();

    expect(fixture).toBeDefined();
    expect(fixture.agentForPage).toBeDefined();
  });

  describe('Legacy compatibility mode', () => {
    it('should enable cache when MIDSCENE_CACHE env var is true (legacy mode)', () => {
      // Mock environment variable to enable legacy cache mode
      vi.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
        true,
      );

      // Create fixture without cache option (undefined)
      const fixture = PlaywrightAiFixture();

      // Process cache config as the fixture would do internally
      const testId = 'Test File(Test Case)'.replace(/[/\\:*?"<>|]/g, '-');
      const result = processCacheConfig(undefined, testId);

      // Verify that environment variable was checked
      expect(globalConfigManager.getEnvConfigInBoolean).toHaveBeenCalledWith(
        'MIDSCENE_CACHE',
      );

      // Verify that cache is enabled with the generated ID
      expect(result).toEqual({
        id: testId,
      });

      expect(fixture).toBeDefined();
      expect(fixture.agentForPage).toBeDefined();
    });

    it('should not enable cache when MIDSCENE_CACHE env var is false (legacy mode)', () => {
      // Mock environment variable to disable legacy cache mode
      vi.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
        false,
      );

      // Create fixture without cache option (undefined)
      const fixture = PlaywrightAiFixture();

      // Process cache config as the fixture would do internally
      const testId = 'Test File(Test Case)'.replace(/[/\\:*?"<>|]/g, '-');
      const result = processCacheConfig(undefined, testId);

      // Verify that environment variable was checked
      expect(globalConfigManager.getEnvConfigInBoolean).toHaveBeenCalledWith(
        'MIDSCENE_CACHE',
      );

      // Verify that cache is disabled (undefined)
      expect(result).toBeUndefined();

      expect(fixture).toBeDefined();
      expect(fixture.agentForPage).toBeDefined();
    });

    it('should prefer new cache config over legacy mode', () => {
      // Mock environment variable to enable legacy cache mode
      vi.mocked(globalConfigManager.getEnvConfigInBoolean).mockReturnValue(
        true,
      );

      // Create fixture WITH cache option (new mode)
      const fixture = PlaywrightAiFixture({
        cache: { id: 'explicit-cache-id', strategy: 'read-write' },
      });

      // Process cache config with explicit cache option
      const testId = 'Test File(Test Case)'.replace(/[/\\:*?"<>|]/g, '-');
      const result = processCacheConfig(
        { id: 'explicit-cache-id', strategy: 'read-write' },
        testId,
      );

      // Verify that environment variable was NOT checked (new config takes precedence)
      expect(globalConfigManager.getEnvConfigInBoolean).not.toHaveBeenCalled();

      // Verify that explicit cache config is used
      expect(result).toEqual({
        id: 'explicit-cache-id',
        strategy: 'read-write',
      });

      expect(fixture).toBeDefined();
      expect(fixture.agentForPage).toBeDefined();
    });
  });
});
