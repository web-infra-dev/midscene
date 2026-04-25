import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockCreate = vi.fn();

vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

describe('service-caller empty content handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should preserve usage when model returns empty content', async () => {
    const { callAI, AIResponseParseError } = await import(
      '@/ai-model/service-caller'
    );

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '' } }],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 0,
        total_tokens: 12,
      },
      _request_id: 'req_test_123',
    });

    const modelConfig: IModelConfig = {
      modelName: 'gpt-4o',
      openaiApiKey: 'test-key',
      openaiBaseURL: 'https://api.openai.com/v1',
      modelDescription: 'test model',
      intent: 'default',
      from: 'modelConfig',
    };

    const promise = callAI([{ role: 'user', content: 'hello' }], modelConfig);

    await expect(promise).rejects.toBeInstanceOf(AIResponseParseError);

    try {
      await promise;
    } catch (error) {
      const typedError = error as InstanceType<typeof AIResponseParseError>;
      expect(typedError.usage).toMatchObject({
        prompt_tokens: 12,
        completion_tokens: 0,
        total_tokens: 12,
        model_name: 'gpt-4o',
        model_description: 'test model',
        resolved_intent: 'default',
        request_id: 'req_test_123',
      });
      expect(typedError.usage?.semantic_intent).toBeUndefined();
      expect(typedError.rawResponse).toContain('"choices"');
    }
  });
});
