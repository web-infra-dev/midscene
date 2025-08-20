import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  MIDSCENE_DEBUG_MODE,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_USE_DOUBAO_VISION,
  getAIConfig,
  globalConfigManger,
  overrideAIConfig,
  vlLocateMode,
} from '../../../src/env';

describe('env', () => {
  beforeEach(() => {
    // Clean up global config before each test
    globalConfigManger.reset();
  });

  it('getAIConfigInBoolean', () => {
    overrideAIConfig({
      [MIDSCENE_USE_DOUBAO_VISION]: 'true',
    });

    const vlMode = vlLocateMode({
      intent: 'default',
    });
    expect(vlMode).toBe('doubao-vision');
  });

  it('getAIConfigInBoolean 2', () => {
    overrideAIConfig({
      [MIDSCENE_USE_DOUBAO_VISION]: '1',
    });

    const vlMode = vlLocateMode({
      intent: 'default',
    });
    expect(vlMode).toBe('doubao-vision');
  });

  describe('getGlobalConfig with override', () => {
    beforeEach(() => {
      // Clean up global state
      globalConfigManger.reset();

      // Mock process.env
      vi.stubEnv(MIDSCENE_MODEL_NAME, 'original-model');
      vi.stubEnv(MIDSCENE_DEBUG_MODE, 'true');
    });

    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it('should return env config when no override is set', () => {
      const config1 = getAIConfig(MIDSCENE_MODEL_NAME);
      expect(config1).toBe('original-model');

      const config2 = getAIConfig(MIDSCENE_DEBUG_MODE);
      expect(config2).toBe('true');
    });

    it('should override config with new values in replace mode', () => {
      overrideAIConfig(
        {
          [MIDSCENE_MODEL_NAME]: 'overridden-model',
        },
        false,
      );

      const config1 = getAIConfig(MIDSCENE_MODEL_NAME);
      expect(config1).toBe('overridden-model');

      // In replace mode, non-overridden values should be undefined
      const config2 = getAIConfig(MIDSCENE_DEBUG_MODE);
      expect(config2).toBeUndefined();
    });

    it('should extend config with new values in extend mode', () => {
      overrideAIConfig(
        {
          [MIDSCENE_MODEL_NAME]: 'overridden-model',
        },
        true,
      );

      const config1 = getAIConfig(MIDSCENE_MODEL_NAME);
      expect(config1).toBe('overridden-model');

      // In extend mode, non-overridden values should keep their env values
      const config2 = getAIConfig(MIDSCENE_DEBUG_MODE);
      expect(config2).toBe('true');
    });

    it('should handle multiple overrides correctly', () => {
      // First override
      overrideAIConfig(
        {
          [MIDSCENE_MODEL_NAME]: 'first-override',
        },
        false,
      );

      let config = getAIConfig(MIDSCENE_MODEL_NAME);
      expect(config).toBe('first-override');

      // Second override should replace the first
      overrideAIConfig(
        {
          [MIDSCENE_MODEL_NAME]: 'second-override',
          [MIDSCENE_DEBUG_MODE]: 'false',
        },
        true,
      );

      config = getAIConfig(MIDSCENE_MODEL_NAME);
      expect(config).toBe('second-override');

      const debugConfig = getAIConfig(MIDSCENE_DEBUG_MODE);
      expect(debugConfig).toBe('false');
    });

    it('should always use fresh env values when override is set', () => {
      // Initial config access
      const initialConfig = getAIConfig(MIDSCENE_MODEL_NAME);
      expect(initialConfig).toBe('original-model');

      // Change env value
      vi.stubEnv(MIDSCENE_MODEL_NAME, 'updated-model');

      // Override with extend mode should use the new env value
      overrideAIConfig(
        {
          [MIDSCENE_DEBUG_MODE]: 'overridden',
        },
        true,
      );

      const config = getAIConfig(MIDSCENE_MODEL_NAME);
      expect(config).toBe('updated-model');
    });

    it('should handle clearing the override', () => {
      overrideAIConfig(
        {
          [MIDSCENE_MODEL_NAME]: 'overridden',
        },
        false,
      );

      let config = getAIConfig(MIDSCENE_MODEL_NAME);
      expect(config).toBe('overridden');

      // Clear the override
      globalConfigManger.reset();

      // Should return to env values
      config = getAIConfig(MIDSCENE_MODEL_NAME);
      expect(config).toBe('original-model');
    });

    it('should allow overrideAIConfig to work regardless of when it is called (timing independence)', () => {
      // IMPORTANT: This test verifies the core fix - that overrideAIConfig no longer needs
      // to be called before getAIConfig to take effect

      // Step 1: Call getAIConfig first (this would have caused issues in the old implementation)
      const configBeforeOverride = getAIConfig(MIDSCENE_MODEL_NAME);
      expect(configBeforeOverride).toBe('original-model');

      // Step 2: Now call overrideAIConfig AFTER getAIConfig has been called
      overrideAIConfig(
        {
          [MIDSCENE_MODEL_NAME]: 'late-override',
        },
        false,
      );

      // Step 3: The override should still take effect immediately
      const configAfterOverride = getAIConfig(MIDSCENE_MODEL_NAME);
      expect(configAfterOverride).toBe('late-override');

      // Step 4: Test extend mode also works with late override
      overrideAIConfig(
        {
          [MIDSCENE_MODEL_NAME]: 'late-extend-override',
        },
        true,
      );

      const configAfterExtend = getAIConfig(MIDSCENE_MODEL_NAME);
      expect(configAfterExtend).toBe('late-extend-override');
      const debugConfig = getAIConfig(MIDSCENE_DEBUG_MODE);
      expect(debugConfig).toBe('true'); // Should preserve env value in extend mode
    });

    it('should recalculate config on every getAIConfig call when override is present', () => {
      // This test ensures that config is calculated fresh each time, not cached

      // Set initial override
      overrideAIConfig(
        {
          [MIDSCENE_MODEL_NAME]: 'override-1',
        },
        true,
      );

      expect(getAIConfig(MIDSCENE_MODEL_NAME)).toBe('override-1');

      // Change env value (simulating runtime env change)
      vi.stubEnv(MIDSCENE_DEBUG_MODE, 'changed-env');

      // Even though we didn't touch the override, the env change should be reflected
      expect(getAIConfig(MIDSCENE_DEBUG_MODE)).toBe('changed-env');

      // Change override
      overrideAIConfig(
        {
          [MIDSCENE_MODEL_NAME]: 'override-2',
          [MIDSCENE_DEBUG_MODE]: 'override-debug',
        },
        true,
      );

      expect(getAIConfig(MIDSCENE_MODEL_NAME)).toBe('override-2');
      expect(getAIConfig(MIDSCENE_DEBUG_MODE)).toBe('override-debug');
    });
  });
});
