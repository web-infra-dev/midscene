import { call, callToGetJSONObject } from '@/ai-model/openai/index';
import type { AIUsageInfo, PlanningAIResponse, UIContext } from '@/types';
import { AIActionType } from '../common';
import { systemPrompt } from '../prompt/plan-target';

export async function planTargetAction<T>(
  userPrompt: string,
  historyActions: string[],
  opts: {
    screenshotBase64: string;
  },
) {
  const { screenshotBase64 } = opts;
  const data = await callToGetJSONObject(
    [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            //@ts-ignore
            type: 'image_url',
            image_url: {
              url: screenshotBase64,
            },
            // min_pixels: min_pixels,
            // max_pixels: max_pixels,
          },
          {
            type: 'text',
            text: `已经执行过的操作：${historyActions.join('\n')}`,
          },
          {
            type: 'text',
            text: `用户希望达成的目标：${userPrompt}`,
          },
        ],
      },
    ],
    AIActionType.PLAN,
  );
  return data as T;
}
