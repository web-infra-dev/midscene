import { afterEach } from 'node:test';
import {
  ANTHROPIC_API_KEY,
  AZURE_OPENAI_API_VERSION,
  AZURE_OPENAI_DEPLOYMENT,
  AZURE_OPENAI_ENDPOINT,
  AZURE_OPENAI_KEY,
  MIDSCENE_AZURE_OPENAI_SCOPE,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_OPENAI_INIT_CONFIG_JSON,
  MIDSCENE_USE_ANTHROPIC_SDK,
  MIDSCENE_USE_AZURE_OPENAI,
  MIDSCENE_VQA_ANTHROPIC_API_KEY,
  MIDSCENE_VQA_AZURE_OPENAI_API_VERSION,
  MIDSCENE_VQA_AZURE_OPENAI_DEPLOYMENT,
  MIDSCENE_VQA_AZURE_OPENAI_ENDPOINT,
  MIDSCENE_VQA_AZURE_OPENAI_KEY,
  MIDSCENE_VQA_AZURE_OPENAI_SCOPE,
  MIDSCENE_VQA_MODEL_NAME,
  MIDSCENE_VQA_OPENAI_API_KEY,
  MIDSCENE_VQA_OPENAI_BASE_URL,
  MIDSCENE_VQA_OPENAI_USE_AZURE,
  MIDSCENE_VQA_USE_ANTHROPIC_SDK,
  MIDSCENE_VQA_USE_AZURE_OPENAI,
  OPENAI_API_KEY,
  OPENAI_BASE_URL,
  OPENAI_USE_AZURE,
} from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { decideModelConfig } from '../../../../src/ai-model/service-caller/utils';

describe('decideModelConfig - VQA', () => {
  beforeEach(() => {
    // env will cached by midsceneGlobalConfig
    globalThis.midsceneGlobalConfig = null;
    vi.unstubAllEnvs();
    vi.stubEnv(MIDSCENE_MODEL_NAME, '<common-model>');
    vi.stubEnv(OPENAI_API_KEY, '<openai-api-key>');
    vi.stubEnv(OPENAI_BASE_URL, '<openai-base-url>');
    vi.stubEnv(MIDSCENE_OPENAI_INIT_CONFIG_JSON, '{}');
  });

  afterEach(() => {
    // env will cached by midsceneGlobalConfig
    globalThis.midsceneGlobalConfig = null;
    vi.unstubAllEnvs();
  });

  it('declare MIDSCENE_VQA_MODEL_NAME but no intent will not enter VQA branch', () => {
    vi.stubEnv(MIDSCENE_VQA_MODEL_NAME, '<vql-model>');
    const result = decideModelConfig();
    expect(result).toStrictEqual({
      httpProxy: undefined,
      socksProxy: undefined,
      modelName: '<common-model>',
      openaiApiKey: '<openai-api-key>',
      openaiBaseURL: '<openai-base-url>',
      openaiExtraConfig: {},
    });
  });

  it('intent is VQA but not declare MIDSCENE_VQA_MODEL_NAME will not enter VQA branch', () => {
    const result = decideModelConfig({ intent: 'VQA' });
    expect(result).toStrictEqual({
      httpProxy: undefined,
      socksProxy: undefined,
      modelName: '<common-model>',
      openaiApiKey: '<openai-api-key>',
      openaiBaseURL: '<openai-base-url>',
      openaiExtraConfig: {},
    });
  });

  it('intent is VQA and only declare MIDSCENE_VQA_MODEL_NAME will throw error', () => {
    vi.stubEnv(MIDSCENE_VQA_MODEL_NAME, '<vql-model>');
    expect(() => {
      const result = decideModelConfig({ intent: 'VQA' });
    }).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: The MIDSCENE_VQA_OPENAI_BASE_URL must be a non-empty string because of the MIDSCENE_VQA_MODEL_NAME is declared as <vql-model>, but got: undefined
      Please check your config.]
    `,
    );
  });

  it('intent is VQA and use common openai', () => {
    vi.stubEnv(MIDSCENE_VQA_MODEL_NAME, '<vql-model>');
    vi.stubEnv(MIDSCENE_VQA_OPENAI_BASE_URL, '<vql-baseUrl>');
    vi.stubEnv(MIDSCENE_VQA_OPENAI_API_KEY, '<vql-apiKey>');

    const result = decideModelConfig({ intent: 'VQA' });

    expect(result).toStrictEqual({
      httpProxy: undefined,
      socksProxy: undefined,
      modelName: '<vql-model>',
      openaiApiKey: '<vql-apiKey>',
      openaiBaseURL: '<vql-baseUrl>',
      openaiExtraConfig: undefined,
    });
  });

  it('intent is VQA and only declare MIDSCENE_VQA_USE_AZURE_OPENAI', () => {
    vi.stubEnv(MIDSCENE_VQA_MODEL_NAME, '<vql-model>');
    vi.stubEnv(MIDSCENE_VQA_USE_AZURE_OPENAI, '1');

    expect(() => {
      const result = decideModelConfig({ intent: 'VQA' });
    }).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: The MIDSCENE_VQA_AZURE_OPENAI_KEY must be a non-empty string because of the MIDSCENE_VQA_MODEL_NAME is declared as <vql-model> and MIDSCENE_VQA_USE_AZURE_OPENAI has also been specified, but got: undefined
      Please check your config.]
    `,
    );
  });

  it('intent is VQA and declare MIDSCENE_VQA_USE_AZURE_OPENAI and openaiUseAzureDeprecated', () => {
    vi.stubEnv(MIDSCENE_VQA_MODEL_NAME, '<vql-model>');
    vi.stubEnv(MIDSCENE_VQA_OPENAI_USE_AZURE, '1');
    vi.stubEnv(
      MIDSCENE_VQA_OPENAI_BASE_URL,
      '<vql-openaiUseAzureDeprecated-baseUrl>',
    );
    vi.stubEnv(
      MIDSCENE_VQA_OPENAI_API_KEY,
      '<vql-openaiUseAzureDeprecated-apiKey>',
    );

    const result = decideModelConfig({ intent: 'VQA' });

    expect(result).toStrictEqual({
      openaiUseAzureDeprecated: true,
      httpProxy: undefined,
      socksProxy: undefined,
      modelName: '<vql-model>',
      openaiApiKey: '<vql-openaiUseAzureDeprecated-apiKey>',
      openaiBaseURL: '<vql-openaiUseAzureDeprecated-baseUrl>',
      openaiExtraConfig: undefined,
    });
  });

  it('intent is VQA and only declare MIDSCENE_VQA_USE_AZURE_OPENAI', () => {
    vi.stubEnv(MIDSCENE_VQA_MODEL_NAME, '<vql-model>');
    vi.stubEnv(MIDSCENE_VQA_USE_AZURE_OPENAI, '1');

    expect(() => {
      const result = decideModelConfig({ intent: 'VQA' });
    }).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: The MIDSCENE_VQA_AZURE_OPENAI_KEY must be a non-empty string because of the MIDSCENE_VQA_MODEL_NAME is declared as <vql-model> and MIDSCENE_VQA_USE_AZURE_OPENAI has also been specified, but got: undefined
      Please check your config.]
    `,
    );
  });

  it('intent is VQA and declare MIDSCENE_VQA_USE_AZURE_OPENAI and useAzureOpenai', () => {
    vi.stubEnv(MIDSCENE_VQA_MODEL_NAME, '<vql-model>');
    vi.stubEnv(MIDSCENE_VQA_USE_AZURE_OPENAI, '1');
    vi.stubEnv(
      MIDSCENE_VQA_AZURE_OPENAI_ENDPOINT,
      '<vql-useAzureOpenai-endpoint>',
    );
    vi.stubEnv(MIDSCENE_VQA_AZURE_OPENAI_KEY, '<vql-useAzureOpenai-key>');
    vi.stubEnv(
      MIDSCENE_VQA_AZURE_OPENAI_API_VERSION,
      '<vql-useAzureOpenai-api-version>',
    );
    vi.stubEnv(
      MIDSCENE_VQA_AZURE_OPENAI_DEPLOYMENT,
      '<vql-useAzureOpenai-deployment>',
    );
    vi.stubEnv(MIDSCENE_VQA_AZURE_OPENAI_SCOPE, '<azure-scope>');

    const result = decideModelConfig({ intent: 'VQA' });

    expect(result).toStrictEqual({
      socksProxy: undefined,
      httpProxy: undefined,
      useAzureOpenai: true,
      modelName: '<vql-model>',
      azureOpenaiScope: '<azure-scope>',
      azureOpenaiApiKey: '<vql-useAzureOpenai-key>',
      azureOpenaiApiVersion: '<vql-useAzureOpenai-api-version>',
      azureOpenaiDeployment: '<vql-useAzureOpenai-deployment>',
      azureOpenaiEndpoint: '<vql-useAzureOpenai-endpoint>',
      openaiExtraConfig: undefined,
      azureExtraConfig: undefined,
    });
  });

  it('intent is VQA and only declare MIDSCENE_VQA_USE_ANTHROPIC_SDK', () => {
    vi.stubEnv(MIDSCENE_VQA_MODEL_NAME, '<vql-model>');
    vi.stubEnv(MIDSCENE_VQA_USE_ANTHROPIC_SDK, '1');

    expect(() => {
      const result = decideModelConfig({ intent: 'VQA' });
    }).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: The MIDSCENE_VQA_ANTHROPIC_API_KEY must be a non-empty string because of the MIDSCENE_VQA_MODEL_NAME is declared as <vql-model> and MIDSCENE_VQA_USE_ANTHROPIC_SDK has also been specified, but got: undefined
      Please check your config.]
    `,
    );
  });

  it('intent is VQA and declare MIDSCENE_VQA_USE_ANTHROPIC_SDK and useAnthropicSdk', () => {
    vi.stubEnv(MIDSCENE_VQA_MODEL_NAME, '<vql-model>');
    vi.stubEnv(MIDSCENE_VQA_USE_ANTHROPIC_SDK, '1');
    vi.stubEnv(MIDSCENE_VQA_ANTHROPIC_API_KEY, '<anthropic-apiKey>');

    const result = decideModelConfig({ intent: 'VQA' });

    expect(result).toStrictEqual({
      socksProxy: undefined,
      httpProxy: undefined,
      useAnthropicSdk: true,
      modelName: '<vql-model>',
      anthropicApiKey: '<anthropic-apiKey>',
    });
  });
});

describe('decideModelConfig - common', () => {
  beforeEach(() => {
    // env will cached by midsceneGlobalConfig
    globalThis.midsceneGlobalConfig = null;
    vi.unstubAllEnvs();
    vi.stubEnv(MIDSCENE_MODEL_NAME, '<common-model>');
    vi.stubEnv(OPENAI_API_KEY, '<openai-api-key>');
    vi.stubEnv(OPENAI_BASE_URL, '<openai-base-url>');
    vi.stubEnv(MIDSCENE_OPENAI_INIT_CONFIG_JSON, '{}');
  });

  afterEach(() => {
    // env will cached by midsceneGlobalConfig
    globalThis.midsceneGlobalConfig = null;
    vi.unstubAllEnvs();
  });

  it('only declare USE_AZURE_OPENAI', () => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, '<common-model>');
    vi.stubEnv(MIDSCENE_USE_AZURE_OPENAI, '1');

    expect(() => {
      const result = decideModelConfig();
    }).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: The AZURE_OPENAI_KEY must be a non-empty string because of the MIDSCENE_MODEL_NAME is declared as <common-model> and MIDSCENE_USE_AZURE_OPENAI has also been specified, but got: undefined
      Please check your config.]
    `,
    );
  });

  it('declare USE_AZURE_OPENAI and openaiUseAzureDeprecated', () => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, '<common-model>');
    vi.stubEnv(OPENAI_USE_AZURE, '1');
    vi.stubEnv(OPENAI_BASE_URL, '<common-openaiUseAzureDeprecated-baseUrl>');
    vi.stubEnv(OPENAI_API_KEY, '<common-openaiUseAzureDeprecated-apiKey>');

    const result = decideModelConfig();

    expect(result).toStrictEqual({
      openaiUseAzureDeprecated: true,
      httpProxy: undefined,
      socksProxy: undefined,
      modelName: '<common-model>',
      openaiApiKey: '<common-openaiUseAzureDeprecated-apiKey>',
      openaiBaseURL: '<common-openaiUseAzureDeprecated-baseUrl>',
      openaiExtraConfig: {},
    });
  });

  it('only declare MIDSCENE_USE_AZURE_OPENAI', () => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, '<common-model>');
    vi.stubEnv(MIDSCENE_USE_AZURE_OPENAI, '1');
    vi.stubEnv(OPENAI_API_KEY, undefined);

    expect(() => {
      const result = decideModelConfig();
    }).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: The AZURE_OPENAI_KEY must be a non-empty string because of the MIDSCENE_MODEL_NAME is declared as <common-model> and MIDSCENE_USE_AZURE_OPENAI has also been specified, but got: undefined
      Please check your config.]
    `,
    );
  });

  it('declare MIDSCENE_USE_AZURE_OPENAI and useAzureOpenai', () => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, '<common-model>');
    vi.stubEnv(MIDSCENE_USE_AZURE_OPENAI, '1');
    vi.stubEnv(AZURE_OPENAI_ENDPOINT, '<common-useAzureOpenai-endpoint>');
    vi.stubEnv(AZURE_OPENAI_KEY, '<common-useAzureOpenai-key>');
    vi.stubEnv(AZURE_OPENAI_API_VERSION, '<common-useAzureOpenai-api-version>');
    vi.stubEnv(AZURE_OPENAI_DEPLOYMENT, '<common-useAzureOpenai-deployment>');
    vi.stubEnv(MIDSCENE_AZURE_OPENAI_SCOPE, '<azure-scope>');

    const result = decideModelConfig();

    expect(result).toStrictEqual({
      socksProxy: undefined,
      httpProxy: undefined,
      useAzureOpenai: true,
      modelName: '<common-model>',
      azureOpenaiScope: '<azure-scope>',
      azureOpenaiApiKey: '<common-useAzureOpenai-key>',
      azureOpenaiApiVersion: '<common-useAzureOpenai-api-version>',
      azureOpenaiDeployment: '<common-useAzureOpenai-deployment>',
      azureOpenaiEndpoint: '<common-useAzureOpenai-endpoint>',
      openaiExtraConfig: {},
      azureExtraConfig: undefined,
    });
  });

  it('only declare MIDSCENE_VQA_USE_ANTHROPIC_SDK', () => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, '<common-model>');
    vi.stubEnv(MIDSCENE_USE_ANTHROPIC_SDK, '1');

    expect(() => {
      const result = decideModelConfig();
    }).toThrowErrorMatchingInlineSnapshot(
      `
      [Error: The ANTHROPIC_API_KEY must be a non-empty string because of the MIDSCENE_MODEL_NAME is declared as <common-model> and MIDSCENE_USE_ANTHROPIC_SDK has also been specified, but got: undefined
      Please check your config.]
    `,
    );
  });

  it('declare MIDSCENE_VQA_USE_ANTHROPIC_SDK and useAnthropicSdk', () => {
    vi.stubEnv(MIDSCENE_MODEL_NAME, '<common-model>');
    vi.stubEnv(MIDSCENE_USE_ANTHROPIC_SDK, '1');
    vi.stubEnv(ANTHROPIC_API_KEY, '<anthropic-apiKey>');

    const result = decideModelConfig();

    expect(result).toStrictEqual({
      socksProxy: undefined,
      httpProxy: undefined,
      useAnthropicSdk: true,
      modelName: '<common-model>',
      anthropicApiKey: '<anthropic-apiKey>',
    });
  });
});
