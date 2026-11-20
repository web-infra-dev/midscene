import { getModelRuntime } from '@/ai-model/models';
import { prepareChatCompletion } from '@/ai-model/service-caller/openai/chat-completion/chat-completion';
import { prepareResponses } from '@/ai-model/service-caller/openai/responses/responses';
import { describe, expect, it } from '@rstest/core';

const families = [
  'tencent-hy',
  'xiaomi-mimo',
  'glm-v',
  'doubao-seed',
  'doubao-vision',
  'ant-ling',
  'qwen3',
  'qwen3.5',
  'qwen3.6',
  'qwen4',
  'deepseek',
  'gpt-5',
  'gpt-6',
  'kimi',
  'kimi3',
  'step',
] as const;

describe.each(families)('%s provider override', (modelFamily) => {
  const protocols =
    modelFamily === 'gpt-5' || modelFamily === 'gpt-6'
      ? (['openai-chat', 'openai-responses'] as const)
      : (['openai-chat'] as const);
  it.each(protocols)(
    'uses the explicit provider for %s request preparation',
    async (protocol) => {
      const prepare =
        protocol === 'openai-chat' ? prepareChatCompletion : prepareResponses;
      const build = async (
        openaiBaseURL: string,
        provider?: 'openrouter' | 'official',
      ) => {
        const { requestParams } = await prepare({
          modelRuntime: getModelRuntime({
            modelName: 'test-model',
            modelFamily,
            modelDescription: 'test',
            intent: 'default',
            slot: 'default',
            protocol,
            openaiBaseURL,
            provider,
            reasoningEnabled: true,
            reasoningEffort: 'high',
            reasoningBudget: 1024,
          }),
          messages: [{ role: 'user', content: 'Locate the button.' }],
        });
        expect(requestParams).not.toHaveProperty('provider');
        expect(requestParams).not.toHaveProperty('baseURL');
        return requestParams;
      };
      const openRouterURL = 'https://openrouter.ai/api/v1';
      const proxyURL = 'https://proxy.example.com/v1';
      await expect(build(openRouterURL, 'official')).rejects.toThrow(
        'Provider "official" cannot be used with Base URL',
      );
      expect(await build(proxyURL, 'openrouter')).toEqual(
        await build(openRouterURL),
      );
      expect(await build(proxyURL, 'official')).toEqual(await build(proxyURL));
    },
  );
});
