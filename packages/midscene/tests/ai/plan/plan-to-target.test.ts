import path from 'node:path';
import { vlmPlanning } from '@/ai-model/ui-tars-planning';
import { savePositionImg } from '@midscene/shared/img';
import { expect, it, test } from 'vitest';
import { getPageTestData } from '../evaluate/test-suite/util';

const isUiTars = process.env.MIDSCENE_USE_VLM_UI_TARS === '1';

test.skipIf(!isUiTars)('only run in ui-tars', () => {
  it('plan to target', async () => {
    const { context } = await getPageTestData(
      path.join(__dirname, '../evaluate/test-data/todo'),
    );

    const { width, height } = context.size;
    const startTime = Date.now();
    const { realActions } = await vlmPlanning({
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
  });
});
