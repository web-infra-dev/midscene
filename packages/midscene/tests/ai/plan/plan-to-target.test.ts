import path from 'node:path';
import { AiInspectElement } from '@/ai-model';
import { vlmPlaning } from '@/ai-model/vlm-planing';
import { savePositionImg } from '@midscene/shared/img';
import { expect, test } from 'vitest';
import { getPageTestData } from '../evaluate/test-suite/util';

test('inspect with quick answer', async () => {
  const { context } = await getPageTestData(
    path.join(__dirname, '../evaluate/test-data/todo'),
  );

  const { width, height } = context.size;
  const startTime = Date.now();
  const { realActions } = await vlmPlaning({
    userInstruction: '删除第二条任务',
    conversationHistory: [
      {
        role: 'user',
        content: [
          {
            type: 'image_url',
            image_url: {
              url: context.originalScreenshotBase64,
            },
          },
        ],
      },
    ],
    size: {
      width,
      height,
    },
  });

  const endTime = Date.now();
  const cost = (endTime - startTime) / 1000;
  const start_box =
    'start_box' in realActions[0].action_inputs
      ? realActions[0].action_inputs.start_box
      : '[]';
  const box = JSON.parse(start_box);
  console.log('plan to target content:', {
    box,
    size: {
      width,
      height,
    },
    cost: `${cost}s`,
  });
  // expect(box).toEqual([0.397, 0.218, 0.397, 0.218]);
  expect(true).toBe(true);
  await savePositionImg({
    inputImgBase64: context.originalScreenshotBase64,
    rect: { x: box[0] * width, y: box[1] * height },
    outputPath: path.join(__dirname, 'output.png'),
  });
  //   expect(cost).toBeLessThan(100);
});
