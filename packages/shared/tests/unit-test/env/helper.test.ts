import { describe, expect, it } from 'vitest';
import { maskConfig } from '../../../src/env/helper';
import type { IModelConfig } from '../../../src/env/model-config';

describe('maskConfig', () => {
  it('key will be masked', () => {
    const config: IModelConfig = {
      modelName: 'test-model',
      from: 'env',
      openaiApiKey: 'sk-thisisafakekeythatislongenough',
      anthropicApiKey: 'ant-thisisafakekeythatislongenough',
      socksProxy: 'socks://proxy.example.com:1080',
      httpProxy: 'http://proxy.example.com:8080',
      openaiBaseURL: 'https://api.openai.com/v1',
      openaiExtraConfig: { top_p: 0.9 },
      openaiUseAzureDeprecated: false,
      useAzureOpenai: true,
      azureOpenaiScope: 'scope',
      azureOpenaiKey: 'azure-fake-key-long-enough',
      azureOpenaiEndpoint: 'https://example.openai.azure.com/',
      azureOpenaiApiVersion: '2023-07-01-preview',
      azureOpenaiDeployment: 'deployment-name',
      azureExtraConfig: { temperature: 0.7 },
      useAnthropicSdk: true,
      vlMode: 'auto',
      modelDescription: '',
    };
    expect(maskConfig(config)).toMatchInlineSnapshot(`
      {
        "anthropicApiKey": "ant****************************ugh",
        "azureExtraConfig": "{"t*************.7}",
        "azureOpenaiApiVersion": "2023-07-01-preview",
        "azureOpenaiDeployment": "deployment-name",
        "azureOpenaiEndpoint": "https://example.openai.azure.com/",
        "azureOpenaiKey": "azu********************ugh",
        "azureOpenaiScope": "scope",
        "from": "env",
        "httpProxy": "http://proxy.example.com:8080",
        "modelDescription": "",
        "modelName": "test-model",
        "openaiApiKey": "sk-***************************ugh",
        "openaiBaseURL": "https://api.openai.com/v1",
        "openaiExtraConfig": "{"t*******.9}",
        "openaiUseAzureDeprecated": false,
        "socksProxy": "socks://proxy.example.com:1080",
        "useAnthropicSdk": true,
        "useAzureOpenai": true,
        "vlMode": "auto",
      }
    `);
  });
});
