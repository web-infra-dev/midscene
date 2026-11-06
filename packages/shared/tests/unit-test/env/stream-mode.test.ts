import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { GlobalConfigManager } from '../../../src/env/global-config-manager';
import { ModelConfigManager } from '../../../src/env/model-config-manager';

const defaults = {
  MIDSCENE_MODEL_NAME: 'default',
  MIDSCENE_MODEL_BASE_URL: 'https://example.test/v1',
  MIDSCENE_MODEL_STREAM_MODE: 'stream',
};

afterEach(() => {
  rs.unstubAllEnvs();
});

describe('per-model stream mode', () => {
  it('reads role settings from the environment while keeping isolated configs independent', () => {
    for (const [key, value] of Object.entries({
      ...defaults,
      MIDSCENE_LOCATE_MODEL_NAME: 'locator',
      MIDSCENE_LOCATE_MODEL_BASE_URL: 'https://example.test/v1',
      MIDSCENE_LOCATE_MODEL_STREAM_MODE: 'non-stream',
    })) {
      rs.stubEnv(key, value);
    }
    const manager = new ModelConfigManager();
    manager.registerGlobalConfigManager(new GlobalConfigManager());
    expect(manager.getModelConfig('default').streamMode).toBe('stream');
    expect(manager.getModelConfig('locate').streamMode).toBe('non-stream');
    expect(
      new ModelConfigManager({
        MIDSCENE_MODEL_NAME: defaults.MIDSCENE_MODEL_NAME,
        MIDSCENE_MODEL_BASE_URL: defaults.MIDSCENE_MODEL_BASE_URL,
      }).getModelConfig('default').streamMode,
    ).toBe('non-stream');
  });
  for (const role of ['default', 'locate', 'planning', 'insight'] as const) {
    const prefix =
      role === 'default'
        ? 'MIDSCENE_MODEL_'
        : `MIDSCENE_${role.toUpperCase()}_MODEL_`;
    const config = {
      ...defaults,
      [`${prefix}NAME`]: role,
      [`${prefix}BASE_URL`]: 'https://example.test/v1',
    };
    it(`${role}: parses its own mode and defaults independently`, () => {
      for (const mode of [undefined, 'non-stream', ' stream '] as const) {
        const manager = new ModelConfigManager({
          ...config,
          [`${prefix}STREAM_MODE`]: mode,
        });
        expect(manager.getModelConfig(role).streamMode).toBe(
          mode?.trim() ?? 'non-stream',
        );
      }
    });
    it(`${role}: rejects invalid configuration`, () => {
      for (const mode of ['', 'true', 'auto', 'invalid']) {
        expect(() =>
          new ModelConfigManager({
            ...config,
            [`${prefix}STREAM_MODE`]: mode,
          }).getModelConfig(role),
        ).toThrow(`Invalid ${prefix}STREAM_MODE`);
      }
    });
    it(`${role}: uses the default model's mode when the role is not configured`, () => {
      expect(
        new ModelConfigManager(defaults).getModelConfig(role).streamMode,
      ).toBe('stream');
    });
  }
});
