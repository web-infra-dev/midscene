import { describe, expect, it } from 'vitest';
import { maskConfig } from '../../../src/env/helper';
import type { IModelConfig } from '../../../src/env/model-config';

describe('maskConfig', () => {
  it('key will be masked', () => {
    const config: IModelConfig = {
      modelName: 'test-model',
      from: 'env',
      openaiApiKey: 'sk-thisisafakekeythatislongenough',
      socksProxy: 'socks://proxy.example.com:1080',
      httpProxy: 'http://proxy.example.com:8080',
      openaiBaseURL: 'https://api.openai.com/v1',
      openaiExtraConfig: { top_p: 0.9 },
      vlMode: 'doubao-vision',
      modelDescription: '',
      intent: 'default',
    };
    expect(maskConfig(config)).toMatchInlineSnapshot(`
      {
        "from": "env",
        "httpProxy": "http://proxy.example.com:8080",
        "intent": "default",
        "modelDescription": "",
        "modelName": "test-model",
        "openaiApiKey": "sk-***************************ugh",
        "openaiBaseURL": "https://api.openai.com/v1",
        "openaiExtraConfig": "{"t*******.9}",
        "socksProxy": "socks://proxy.example.com:1080",
        "vlMode": "doubao-vision",
      }
    `);
  });
});
