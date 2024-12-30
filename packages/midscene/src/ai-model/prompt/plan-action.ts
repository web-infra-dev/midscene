import { call, callToGetJSONObject } from '@/ai-model/openai/index';
import { AIActionType } from '../common';
import { systemPrompt } from './plan-target';

export async function planTargetAction<T>(opts: {
  userTarget: string;
  todoList: string;
  whatToDoNext: string;
  screenshotBase64: string;
}) {
  const { screenshotBase64, userTarget, todoList, whatToDoNext } = opts;
  const data = await callToGetJSONObject<any>(
    [
      { role: 'assistant', content: systemPrompt },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `用户希望达成的目标：${userTarget}`,
          },
          {
            type: 'text',
            text: `
            根据用户目标，需要达成的待办事项：${todoList}
            `,
          },
          {
            type: 'image_url',
            image_url: {
              url: screenshotBase64,
            },
            // min_pixels: min_pixels,
            // max_pixels: max_pixels,
          },
        ],
      },
    ],
    AIActionType.PLAN,
  );
  // const prediction = safeParseJson(data.content[0].prediction);

  return data as T;
}
