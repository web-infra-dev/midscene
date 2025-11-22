import { describe, expect, it } from 'vitest';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
} from '../../../src/env';
import { DEFAULT_MODEL_CONFIG_KEYS } from '../../../src/env/constants';
import { parseOpenaiSdkConfig } from '../../../src/env/parse-model-config';

describe('decideOpenaiSdkConfig', () => {
  it('default - missing values returns empty config', () => {
    const result = parseOpenaiSdkConfig({
      keys: DEFAULT_MODEL_CONFIG_KEYS,
      provider: {},
    });

    expect(result.openaiApiKey).toBeUndefined();
    expect(result.openaiBaseURL).toBeUndefined();
  });

  it('default', () => {
    const result = parseOpenaiSdkConfig({
      keys: DEFAULT_MODEL_CONFIG_KEYS,
      provider: {
        [MIDSCENE_MODEL_API_KEY]: 'mock-key',
        [MIDSCENE_MODEL_BASE_URL]: 'mock-url',
      },
    });
    expect(result).toEqual(
      expect.objectContaining({
        openaiApiKey: 'mock-key',
        openaiBaseURL: 'mock-url',
      }),
    );
  });
});
