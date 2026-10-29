import { describe, expect, it } from '@rstest/core';
import { ModelConfigManager } from '../../../src/env/model-config-manager';

const defaults = {
  MIDSCENE_MODEL_NAME: 'default-model',
  MIDSCENE_MODEL_BASE_URL: 'https://default.example/v1',
  MIDSCENE_MODEL_FAMILY: 'qwen3-vl',
};

describe('System One endpoint configuration', () => {
  it.each(['planning', 'locate', 'insight'] as const)(
    'accepts an endpoint without a base URL for %s',
    (role) => {
      const prefix = `MIDSCENE_${role.toUpperCase()}_MODEL`;
      const manager = new ModelConfigManager({
        ...defaults,
        [`${prefix}_NAME`]: 'jev',
        [`${prefix}_FAMILY`]: 'jev',
        [`${prefix}_ENDPOINT`]: 'https://example.com/decision',
      });
      expect(manager.getModelConfig(role)).toMatchObject({
        endpoint: 'https://example.com/decision',
        openaiBaseURL: undefined,
      });
      expect(manager.getModelConfig('default').endpoint).toBeUndefined();
    },
  );

  it('does not borrow an endpoint from another role', () => {
    const manager = new ModelConfigManager({
      ...defaults,
      MIDSCENE_PLANNING_MODEL_NAME: 'jev',
      MIDSCENE_PLANNING_MODEL_FAMILY: 'jev',
      MIDSCENE_PLANNING_MODEL_ENDPOINT: 'https://example.com/decision',
      MIDSCENE_LOCATE_MODEL_NAME: 'jev',
      MIDSCENE_LOCATE_MODEL_FAMILY: 'jev',
    });
    expect(() => manager.getModelConfig('locate')).toThrow('intent=locate');
  });

  it('rejects endpoints on generative models', () => {
    const manager = new ModelConfigManager({
      ...defaults,
      MIDSCENE_MODEL_ENDPOINT: 'https://example.com/decision',
    });
    expect(() => manager.getModelConfig('default')).toThrow(
      'only supported for System One',
    );
  });

  it.each(['not-a-url', 'ftp://example.com/decision'])(
    'leaves endpoint URL validation to the request layer: %s',
    (endpoint) => {
      const manager = new ModelConfigManager({
        ...defaults,
        MIDSCENE_LOCATE_MODEL_NAME: 'jev',
        MIDSCENE_LOCATE_MODEL_FAMILY: 'jev',
        MIDSCENE_LOCATE_MODEL_ENDPOINT: endpoint,
      });
      expect(manager.getModelConfig('locate').endpoint).toBe(endpoint);
    },
  );
});
