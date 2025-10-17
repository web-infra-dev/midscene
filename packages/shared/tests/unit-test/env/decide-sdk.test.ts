import { describe, expect, it } from 'vitest';
import {
  MIDSCENE_OPENAI_API_KEY,
  MIDSCENE_OPENAI_BASE_URL,
} from '../../../src/env';
import { DEFAULT_MODEL_CONFIG_KEYS } from '../../../src/env/constants';
import { decideOpenaiSdkConfig } from '../../../src/env/decide-model-config';
import { createAssert } from '../../../src/env/helper';

describe('decideOpenaiSdkConfig', () => {
  it('default - fail', () => {
    expect(() =>
      decideOpenaiSdkConfig({
        keys: DEFAULT_MODEL_CONFIG_KEYS,
        provider: {},
        valueAssert: createAssert('', 'modelConfig'),
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The MIDSCENE_OPENAI_API_KEY must be a non-empty string, but got: undefined. Please check your config.]',
    );
  });

  it('default', () => {
    const result = decideOpenaiSdkConfig({
      keys: DEFAULT_MODEL_CONFIG_KEYS,
      provider: {
        [MIDSCENE_OPENAI_API_KEY]: 'mock-key',
        [MIDSCENE_OPENAI_BASE_URL]: 'mock-url',
      },
      valueAssert: createAssert('', 'modelConfig'),
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "httpProxy": undefined,
        "openaiApiKey": "mock-key",
        "openaiBaseURL": "mock-url",
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "vlModeRaw": undefined,
      }
    `);
  });
});
