import { AiJudgeOrderSensitive } from '@/ai-model/inspect';
import type { IModelConfig } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';

describe('AiJudgeOrderSensitive', () => {
  it('forces deepThink to false when judging order sensitivity', async () => {
    const callAIFn = vi.fn().mockResolvedValue({
      content: { isOrderSensitive: true },
      usage: { total_tokens: 12 },
    });

    const modelConfig: IModelConfig = {
      modelName: 'test-model',
      modelDescription: 'test model',
      intent: 'default',
    };

    const result = await AiJudgeOrderSensitive(
      'the button to the right of login',
      callAIFn as any,
      modelConfig,
    );

    expect(callAIFn).toHaveBeenCalledWith(
      [
        expect.objectContaining({ role: 'system' }),
        expect.objectContaining({
          role: 'user',
          content:
            'Analyze this element description: "the button to the right of login"',
        }),
      ],
      modelConfig,
      { deepThink: false },
    );

    expect(result).toEqual({
      isOrderSensitive: true,
      usage: { total_tokens: 12 },
    });
  });
});
