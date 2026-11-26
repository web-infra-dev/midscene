import { getModelRuntime } from '@/ai-model/models';
import { callAIWithObjectResponse } from '@/ai-model/service-caller';
import { AiJudgeOrderSensitive } from '@/ai-model/workflows/insight';
import type { AIUsageInfo } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('@/ai-model/service-caller', () => ({
  callAIWithObjectResponse: rs.fn(),
}));

describe('AiJudgeOrderSensitive', () => {
  beforeEach(() => {
    rs.mocked(callAIWithObjectResponse).mockReset();
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

    rs.mocked(callAIWithObjectResponse).mockResolvedValue({
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
  it('includes ordering constraints from context in the model request', async () => {
    rs.mocked(callAIWithObjectResponse).mockResolvedValue({
      content: { isOrderSensitive: true },
      contentString: '{"isOrderSensitive":true}',
    });
    const runtime = getModelRuntime({
      modelName: 'test-model',
      modelDescription: 'test model',
      intent: 'default',
      slot: 'default',
    });
    await AiJudgeOrderSensitive('订单', runtime, '选择列表第二项');
    const messages = rs.mocked(callAIWithObjectResponse).mock.calls[0][0];
    expect(messages[1]).toEqual(
      expect.objectContaining({
        role: 'user',
        content:
          'Analyze this element description: "<CONTEXT>\n选择列表第二项\n</CONTEXT>\n\n<LOCATE_TARGET>\n订单\n</LOCATE_TARGET>"',
      }),
    );
  });
});
