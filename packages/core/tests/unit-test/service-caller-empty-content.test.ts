import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

const mockCreate = rs.fn();

rs.mock('openai', () => ({
  default: rs.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockCreate,
      },
    },
  })),
}));

describe('service-caller empty content handling', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });

  it('does not report or attach usage when all attempts return empty content', async () => {
    const { callAI, AIResponseParseError } = await import(
      '@/ai-model/service-caller'
    );
    const { getModelRuntime } = await import('@/ai-model/models');

    mockCreate.mockResolvedValue({
      choices: [{ message: { content: '' } }],
      usage: {
        prompt_tokens: 12,
        completion_tokens: 0,
        total_tokens: 12,
        prompt_tokens_details: {
          cached_tokens: 7,
        },
      },
      model: 'gpt-4o-2024-08-06',
      _request_id: 'req_test_123',
    });

    const modelConfig: IModelConfig = {
      modelName: 'gpt-4o',
      openaiApiKey: 'test-key',
      openaiBaseURL: 'https://api.openai.com/v1',
      modelDescription: 'test model',
      intent: 'default',
      slot: 'default',
      retryCount: 1,
      retryInterval: 0,
    };

    const runtime = getModelRuntime(modelConfig);
    const onUsage = rs.fn();
    runtime.onUsage = onUsage;
    const promise = callAI([{ role: 'user', content: 'hello' }], runtime);

    await expect(promise).rejects.toBeInstanceOf(AIResponseParseError);

    try {
      await promise;
    } catch (error) {
      const typedError = error as InstanceType<typeof AIResponseParseError>;
      expect(typedError.usage).toBeUndefined();
      expect(onUsage).not.toHaveBeenCalled();
      expect(mockCreate).toHaveBeenCalledTimes(2);
      expect(typedError.rawResponse).toBe('');
      expect(typedError.rawChoiceMessage).toEqual({ content: '' });
    }
  });
  it('reports only the successful attempt usage after an empty response', async () => {
    const { callAI } = await import('@/ai-model/service-caller');
    const { getModelRuntime } = await import('@/ai-model/models');
    mockCreate
      .mockResolvedValueOnce({
        choices: [{ message: { content: '' } }],
        usage: { prompt_tokens: 100, completion_tokens: 0, total_tokens: 100 },
      })
      .mockResolvedValueOnce({
        choices: [{ message: { content: 'hello' } }],
        usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
        _request_id: 'successful-request',
        model: 'response-model',
      });
    const runtime = getModelRuntime({
      modelName: 'gpt-4o',
      modelDescription: 'test model',
      openaiApiKey: 'test-key',
      intent: 'default',
      slot: 'default',
      retryCount: 1,
      retryInterval: 0,
    });
    const onUsage = rs.fn();
    runtime.onUsage = onUsage;
    const result = await callAI([{ role: 'user', content: 'hello' }], runtime);
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(onUsage).toHaveBeenCalledTimes(1);
    expect(onUsage).toHaveBeenCalledWith(result.usage);
    expect(result.usage).toMatchObject({
      total_tokens: 12,
      request_id: 'successful-request',
      response_model_name: 'response-model',
      model_description: 'test model',
      slot: 'default',
      time_cost: expect.any(Number),
    });
  });
});
