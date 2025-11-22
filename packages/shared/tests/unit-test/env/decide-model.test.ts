import { describe, expect, it } from 'vitest';
import { decideModelConfigFromIntentConfig } from '../../../src/env/parse-model-config';

const baseConfig = {
  MIDSCENE_MODEL_NAME: 'default-model',
  MIDSCENE_MODEL_BASE_URL: 'https://api.example.com',
  MIDSCENE_MODEL_API_KEY: 'base-key',
  MIDSCENE_INSIGHT_MODEL_NAME: 'insight-model',
  MIDSCENE_INSIGHT_MODEL_BASE_URL: 'https://insight.example.com',
  MIDSCENE_INSIGHT_MODEL_API_KEY: 'insight-key',
};

describe('decideModelConfigFromIntentConfig', () => {
  it('returns undefined when model name missing', () => {
    expect(decideModelConfigFromIntentConfig('insight', {})).toBeUndefined();
  });

  it('parses intent specific config', () => {
    const result = decideModelConfigFromIntentConfig('insight', baseConfig)!;
    expect(result.intent).toBe('insight');
    expect(result.modelName).toBe('insight-model');
    expect(result.openaiApiKey).toBe('insight-key');
    expect(result.openaiBaseURL).toBe('https://insight.example.com');
    expect(result.from).toBe('-');
  });

  it('falls back to default config when intent specific config missing', () => {
    const result = decideModelConfigFromIntentConfig('planning', baseConfig);
    expect(result).toBeUndefined();
  });
});
