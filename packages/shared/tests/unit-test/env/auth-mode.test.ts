import { afterEach, describe, expect, it, rs } from '@rstest/core';
import { GlobalConfigManager } from '../../../src/env/global-config-manager';
import { ModelConfigManager } from '../../../src/env/model-config-manager';

afterEach(() => rs.unstubAllEnvs());

describe('model auth mode', () => {
  for (const role of ['default', 'planning', 'locate', 'insight'] as const) {
    const prefix =
      role === 'default'
        ? 'MIDSCENE_MODEL'
        : `MIDSCENE_${role.toUpperCase()}_MODEL`;

    it(`${role}: preserves explicit settings with SIWC`, () => {
      const manager = new ModelConfigManager({
        MIDSCENE_MODEL_NAME: 'default',
        MIDSCENE_MODEL_BASE_URL: 'https://example.test/v1',
        [`${prefix}_NAME`]: 'gpt-test',
        [`${prefix}_AUTH_MODE`]: 'siwc',
        [`${prefix}_BASE_URL`]: 'https://example.test/v1',
        [`${prefix}_PROTOCOL`]: 'openai-chat',
        [`${prefix}_STREAM_MODE`]: 'non-stream',
        [`${prefix}_API_KEY`]: 'unused-key',
      });
      expect(manager.getModelConfig(role)).toMatchObject({
        authMode: 'siwc',
        openaiBaseURL: 'https://example.test/v1',
        openaiApiKey: 'unused-key',
        protocol: 'openai-chat',
        streamMode: 'non-stream',
      });
    });

    it(`${role}: rejects unknown auth modes`, () => {
      expect(() =>
        new ModelConfigManager({
          MIDSCENE_MODEL_NAME: 'default',
          MIDSCENE_MODEL_BASE_URL: 'https://example.test/v1',
          [`${prefix}_NAME`]: 'test',
          [`${prefix}_AUTH_MODE`]: 'unknown',
        }).getModelConfig(role),
      ).toThrow(`Invalid ${prefix}_AUTH_MODE`);
    });
  }

  it('allows SIWC without endpoint or credentials and retains ordinary defaults', () => {
    const config = new ModelConfigManager({
      MIDSCENE_MODEL_NAME: 'test',
      MIDSCENE_MODEL_AUTH_MODE: 'siwc',
    }).getModelConfig('default');
    expect(config).toMatchObject({
      authMode: 'siwc',
      openaiBaseURL: undefined,
      openaiApiKey: undefined,
      protocol: undefined,
      streamMode: 'non-stream',
    });
  });

  it('still validates explicitly configured stream mode with SIWC', () => {
    expect(() =>
      new ModelConfigManager({
        MIDSCENE_MODEL_NAME: 'test',
        MIDSCENE_MODEL_AUTH_MODE: 'siwc',
        MIDSCENE_MODEL_STREAM_MODE: 'invalid',
      }).getModelConfig('default'),
    ).toThrow('Invalid MIDSCENE_MODEL_STREAM_MODE');
  });

  it('inherits SIWC only when falling back to the default model', () => {
    const manager = new ModelConfigManager({
      MIDSCENE_MODEL_NAME: 'default',
      MIDSCENE_MODEL_AUTH_MODE: 'siwc',
      MIDSCENE_LOCATE_MODEL_NAME: 'other',
      MIDSCENE_LOCATE_MODEL_BASE_URL: 'https://example.test/v1',
      MIDSCENE_LOCATE_MODEL_API_KEY: 'other-key',
    });
    expect(manager.getModelConfig('planning').authMode).toBe('siwc');
    expect(manager.getModelConfig('insight').authMode).toBe('siwc');
    expect(manager.getModelConfig('locate')).toMatchObject({
      authMode: 'api-key',
      openaiApiKey: 'other-key',
      openaiBaseURL: 'https://example.test/v1',
    });
  });

  it('loads auth mode from environment variables', () => {
    rs.stubEnv('MIDSCENE_MODEL_NAME', 'test');
    rs.stubEnv('MIDSCENE_MODEL_AUTH_MODE', 'siwc');
    const manager = new ModelConfigManager();
    manager.registerGlobalConfigManager(new GlobalConfigManager());
    expect(manager.getModelConfig('default').authMode).toBe('siwc');
  });
});
