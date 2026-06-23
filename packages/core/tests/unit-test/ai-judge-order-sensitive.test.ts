import { getModelRuntime } from '@/ai-model/models';
import { callAIWithObjectResponse } from '@/ai-model/service-caller';
import { AiJudgeOrderSensitive } from '@/ai-model/workflows/inspect';
import type { AIUsageInfo } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/service-caller', () => ({
  callAIWithObjectResponse: vi.fn(),
}));

describe('AiJudgeOrderSensitive', () => {
  beforeEach(() => {
    vi.mocked(callAIWithObjectResponse).mockReset();
  });

  it('judges order sensitivity with generated messages', async () => {
    const usage: AIUsageInfo = {
      prompt_tokens: undefined,
      completion_tokens: undefined,
      total_tokens: 12,
      cached_input: undefined,
      time_cost: undefined,
      model_name: undefined,
      model_description: undefined,
      response_model_name: undefined,
      intent: undefined,
      slot: undefined,
      request_id: undefined,
    };

    vi.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: { isOrderSensitive: true },
      usage,
      contentString: '{"isOrderSensitive": true}',
    });

    const modelConfig: IModelConfig = {
      modelName: 'test-model',
      modelDescription: 'test model',
      intent: 'default',
      slot: 'default',
    };
    const modelRuntime = getModelRuntime(modelConfig);

    const result = await AiJudgeOrderSensitive(
      'the button to the right of login',
      modelRuntime,
    );

    expect(callAIWithObjectResponse).toHaveBeenCalledWith(
      [
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({
          role: 'user',
          content:
            'Analyze this element description: "the button to the right of login"',
        }),
      ],
      modelRuntime,
      { jsonParserSource: 'generic-object' },
    );

    expect(result).toEqual({
      isOrderSensitive: true,
      usage,
    });
  });
});
