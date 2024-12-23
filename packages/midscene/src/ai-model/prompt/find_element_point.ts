import { call, callToGetJSONObject } from '@/ai-model/openai/index';
import type { AIUsageInfo, PlanningAIResponse, UIContext } from '@/types';
import { AIActionType } from '../common';

export const findElementPointPrompt = `
Based on the screenshot of the page, I give a text description and you give its corresponding center point location. The coordinate represents the center point [x, y] of the target element, which is a relative coordinate on the screenshot, scaled from 0 to 1. Please ensure the coordinate is at the exact center of the element.
`;
export async function findElementPoint<T>(
  userPrompt: string,
  opts: {
    screenshotBase64: string;
  },
) {
  const { screenshotBase64 } = opts;
  const data = await callToGetJSONObject(
    [
      { role: 'system', content: findElementPointPrompt },
      {
        role: 'user',
        content: [
          {
            //@ts-ignore
            type: 'image_url',
            image_url: {
              url: screenshotBase64,
            },
          },
          {
            type: 'text',
            text: `用户希望达成的目标：${userPrompt}`,
          },
        ],
      },
    ],
    AIActionType.INSPECT_ELEMENT,
  );
  return data as T;
}
