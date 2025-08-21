import { describe, expect, it } from 'vitest';
import {
  MIDSCENE_ANTHROPIC_API_KEY,
  MIDSCENE_AZURE_OPENAI_ENDPOINT,
  MIDSCENE_AZURE_OPENAI_KEY,
  MIDSCENE_OPENAI_API_KEY,
  MIDSCENE_OPENAI_BASE_URL,
  MIDSCENE_OPENAI_USE_AZURE,
  MIDSCENE_USE_ANTHROPIC_SDK,
  MIDSCENE_USE_AZURE_OPENAI,
} from '../../../src/env';
import { DEFAULT_MODEL_CONFIG_KEYS } from '../../../src/env/constants';
import { createAssert } from '../../../src/env/helper';
import { decideOpenaiSdkConfig } from '../../../src/env/model-config';

describe('decideOpenaiSdkConfig', () => {
  it('openaiUseAzureDeprecated - fail', () => {
    expect(() =>
      decideOpenaiSdkConfig({
        keys: DEFAULT_MODEL_CONFIG_KEYS,
        provider: {
          [MIDSCENE_OPENAI_USE_AZURE]: '1',
        },
        valueAssert: createAssert('', 'modelConfig'),
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The MIDSCENE_OPENAI_BASE_URL must be a non-empty string, but got: undefined. Please check your config.]',
    );
  });

  it('openaiUseAzureDeprecated', () => {
    const result = decideOpenaiSdkConfig({
      keys: DEFAULT_MODEL_CONFIG_KEYS,
      provider: {
        [MIDSCENE_OPENAI_USE_AZURE]: '1',
        [MIDSCENE_OPENAI_BASE_URL]: 'mock-url',
        [MIDSCENE_OPENAI_API_KEY]: 'mock-key',
      },
      valueAssert: createAssert('', 'modelConfig'),
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "httpProxy": undefined,
        "openaiApiKey": "mock-key",
        "openaiBaseURL": "mock-url",
        "openaiExtraConfig": undefined,
        "openaiUseAzureDeprecated": true,
        "socksProxy": undefined,
        "vlModeRaw": undefined,
      }
    `);
  });

  it('useAzureOpenai - fail', () => {
    expect(() =>
      decideOpenaiSdkConfig({
        keys: DEFAULT_MODEL_CONFIG_KEYS,
        provider: {
          [MIDSCENE_USE_AZURE_OPENAI]: '1',
        },
        valueAssert: createAssert('', 'modelConfig'),
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The MIDSCENE_AZURE_OPENAI_KEY must be a non-empty string, but got: undefined. Please check your config.]',
    );
  });
  it('useAzureOpenai', () => {
    const result = decideOpenaiSdkConfig({
      keys: DEFAULT_MODEL_CONFIG_KEYS,
      provider: {
        [MIDSCENE_USE_AZURE_OPENAI]: '1',
        [MIDSCENE_AZURE_OPENAI_ENDPOINT]: 'mock-url',
        [MIDSCENE_AZURE_OPENAI_KEY]: 'mock-key',
      },
      valueAssert: createAssert('', 'modelConfig'),
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "azureExtraConfig": undefined,
        "azureOpenaiApiVersion": undefined,
        "azureOpenaiDeployment": undefined,
        "azureOpenaiEndpoint": "mock-url",
        "azureOpenaiKey": "mock-key",
        "azureOpenaiScope": undefined,
        "httpProxy": undefined,
        "openaiExtraConfig": undefined,
        "socksProxy": undefined,
        "useAzureOpenai": true,
        "vlModeRaw": undefined,
      }
    `);
  });

  it('useAnthropicSdk - fail', () => {
    expect(() =>
      decideOpenaiSdkConfig({
        keys: DEFAULT_MODEL_CONFIG_KEYS,
        provider: {
          [MIDSCENE_USE_ANTHROPIC_SDK]: '1',
        },
        valueAssert: createAssert('', 'modelConfig'),
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The MIDSCENE_ANTHROPIC_API_KEY must be a non-empty string, but got: undefined. Please check your config.]',
    );
  });
  it('useAnthropicSdk', () => {
    const result = decideOpenaiSdkConfig({
      keys: DEFAULT_MODEL_CONFIG_KEYS,
      provider: {
        [MIDSCENE_USE_ANTHROPIC_SDK]: '1',
        [MIDSCENE_ANTHROPIC_API_KEY]: 'mock-key',
      },
      valueAssert: createAssert('', 'modelConfig'),
    });
    expect(result).toMatchInlineSnapshot(`
      {
        "anthropicApiKey": "mock-key",
        "httpProxy": undefined,
        "socksProxy": undefined,
        "useAnthropicSdk": true,
      }
    `);
  });

  it('default - fail', () => {
    expect(() =>
      decideOpenaiSdkConfig({
        keys: DEFAULT_MODEL_CONFIG_KEYS,
        provider: {},
        valueAssert: createAssert('', 'modelConfig'),
      }),
    ).toThrowErrorMatchingInlineSnapshot(
      '[Error: The MIDSCENE_OPENAI_BASE_URL must be a non-empty string, but got: undefined. Please check your config.]',
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
