import { describe, expect, it } from 'vitest';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_EXTRA_BODY_JSON,
  MIDSCENE_MODEL_INIT_CONFIG_JSON,
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

  it('parses extraBody from MIDSCENE_MODEL_EXTRA_BODY_JSON', () => {
    const extraBody = {
      chat_template_kwargs: { enable_thinking: true },
    };
    const result = parseOpenaiSdkConfig({
      keys: DEFAULT_MODEL_CONFIG_KEYS,
      provider: {
        [MIDSCENE_MODEL_API_KEY]: 'mock-key',
        [MIDSCENE_MODEL_BASE_URL]: 'mock-url',
        [MIDSCENE_MODEL_EXTRA_BODY_JSON]: JSON.stringify(extraBody),
      },
    });
    expect(result.extraBody).toEqual(extraBody);
  });

  it('extraBody is undefined when not set', () => {
    const result = parseOpenaiSdkConfig({
      keys: DEFAULT_MODEL_CONFIG_KEYS,
      provider: {
        [MIDSCENE_MODEL_API_KEY]: 'mock-key',
        [MIDSCENE_MODEL_BASE_URL]: 'mock-url',
      },
    });
    expect(result.extraBody).toBeUndefined();
  });

  it('throws on invalid extraBody JSON', () => {
    expect(() =>
      parseOpenaiSdkConfig({
        keys: DEFAULT_MODEL_CONFIG_KEYS,
        provider: {
          [MIDSCENE_MODEL_API_KEY]: 'mock-key',
          [MIDSCENE_MODEL_BASE_URL]: 'mock-url',
          [MIDSCENE_MODEL_EXTRA_BODY_JSON]: 'not-valid-json',
        },
      }),
    ).toThrow();
  });

  it('maps extra_headers to defaultHeaders for OpenAI init config', () => {
    const result = parseOpenaiSdkConfig({
      keys: DEFAULT_MODEL_CONFIG_KEYS,
      provider: {
        [MIDSCENE_MODEL_INIT_CONFIG_JSON]: JSON.stringify({
          extra_headers: { Authorization: 'Bearer alias-token' },
        }),
      },
    });

    expect(result.openaiExtraConfig).toEqual({
      defaultHeaders: { Authorization: 'Bearer alias-token' },
    });
  });

  it('maps extraHeaders to defaultHeaders for OpenAI init config', () => {
    const result = parseOpenaiSdkConfig({
      keys: DEFAULT_MODEL_CONFIG_KEYS,
      provider: {
        [MIDSCENE_MODEL_INIT_CONFIG_JSON]: JSON.stringify({
          extraHeaders: { Authorization: 'Bearer alias-token' },
        }),
      },
    });

    expect(result.openaiExtraConfig).toEqual({
      defaultHeaders: { Authorization: 'Bearer alias-token' },
    });
  });

  it('prefers defaultHeaders when aliases are also provided', () => {
    const result = parseOpenaiSdkConfig({
      keys: DEFAULT_MODEL_CONFIG_KEYS,
      provider: {
        [MIDSCENE_MODEL_INIT_CONFIG_JSON]: JSON.stringify({
          defaultHeaders: { Authorization: 'Bearer canonical-token' },
          extra_headers: { Authorization: 'Bearer alias-token' },
        }),
      },
    });

    expect(result.openaiExtraConfig).toEqual({
      defaultHeaders: { Authorization: 'Bearer canonical-token' },
    });
  });
});
