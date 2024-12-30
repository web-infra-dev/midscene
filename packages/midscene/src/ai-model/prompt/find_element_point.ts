import {
  call,
  callToGetJSONObject,
  extractJSONFromCodeBlock,
} from '@/ai-model/openai/index';
import type { AIUsageInfo, PlanningAIResponse, UIContext } from '@/types';
import { AIActionType } from '../common';

export const findElementPointPrompt = `
Based on the screenshot of the page, I give a text description and you give its corresponding center point location. The coordinate represents the center point [x, y] of the target element, which is a relative coordinate on the screenshot, scaled from 0 to 1. Please ensure the coordinate is at the exact center of the element.
`;
export async function findElementPoin(
  userPrompt: string,
  opts: {
    screenshotBase64: string;
  },
) {
  const { screenshotBase64 } = opts;
  const data = await call(
    [
      {
        role: 'user',
        content: [
          { type: 'text', text: findElementPointPrompt },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${screenshotBase64.replace(
                'data:image/png;base64,',
                '',
              )}`,
            },
          },
          {
            type: 'text',
            text: `用户希望找到的目标元素：${userPrompt}`,
          },
        ],
      },
    ],
    AIActionType.INSPECT_ELEMENT,
  );
  const prediction = (data as any).content[0].prediction.toString();
  // console.log('data', data, prediction);
  const point = prediction
    .match(/\((\d+),(\d+)\)/)
    .slice(1)
    .map(Number)
    .map((item: number) => Number((item / 1000).toFixed(3)));
  return point as [number, number];
}
