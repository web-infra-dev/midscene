import { getModelAdapter } from '@/ai-model/models';
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
  'deepseek',
  'gpt-5',
  'gpt-6',
  'kimi',
  'kimi3',
] as const;

describe.each(families)('%s OpenRouter budget', (family) => {
  const adapter = getModelAdapter(family);
  const protocols =
    family === 'gpt-5' || family === 'gpt-6'
      ? (['chat', 'responses'] as const)
      : (['chat'] as const);

  describe.each(protocols)('%s', (protocol) => {
    it.each([undefined, false, true, 'default'] as const)(
      'forwards effort without validation only with enabled=%s',
      (reasoningEnabled) => {
        for (const reasoningEffort of ['high', '', 'provider-specific']) {
          const input = {
            baseURL: 'https://openrouter.ai/api/v1',
            userConfig: {
              reasoningEnabled,
              reasoningEffort,
              reasoningBudget: 1024,
            },
          };
          const { config } =
            protocol === 'chat'
              ? adapter.chatCompletion.buildChatCompletionParams(input)
              : adapter.responses.buildResponsesParams(input);
          if (reasoningEnabled === true) {
            expect(config.reasoning).toHaveProperty('effort', reasoningEffort);
            expect(config.reasoning).toHaveProperty('max_tokens', 1024);
          } else if (reasoningEnabled === 'default') {
            expect(config).not.toHaveProperty('reasoning');
          } else if (family === 'gpt-5' || family === 'gpt-6') {
            expect(config.reasoning).toEqual({
              effort: family === 'gpt-5' ? 'none' : 'low',
            });
          } else {
            expect(config.reasoning).toEqual({ enabled: false });
          }
        }
      },
    );
    it.each([undefined, false, true, 'default'] as const)(
      'forwards configured budgets only with enabled=%s',
      (reasoningEnabled) => {
        for (const reasoningBudget of [undefined, 0, -1, 1.5, 1024]) {
          const input = {
            baseURL: 'https://openrouter.ai/api/v1',
            userConfig: {
              reasoningEnabled,
              reasoningBudget,
              reasoningEffort: 'high',
            },
          };
          const { config } =
            protocol === 'chat'
              ? adapter.chatCompletion.buildChatCompletionParams(input)
              : adapter.responses.buildResponsesParams(input);
          if (reasoningEnabled === true && reasoningBudget !== undefined) {
            expect(config.reasoning).toHaveProperty(
              'max_tokens',
              reasoningBudget,
            );
          } else {
            expect(config.reasoning ?? {}).not.toHaveProperty('max_tokens');
          }
          expect(config).not.toHaveProperty('max_tokens');
        }
      },
    );
  });
});
