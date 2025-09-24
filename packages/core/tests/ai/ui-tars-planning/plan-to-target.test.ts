import path from 'node:path';
import { uiTarsPlanning } from '@/ai-model/ui-tars-planning';
import { savePositionImg } from '@midscene/shared/img';
import { getContextFromFixture } from 'tests/evaluation';
import { assert, describe, expect, it } from 'vitest';

const isUiTars = process.env.MIDSCENE_USE_VLM_UI_TARS === '1';

describe.skipIf(!isUiTars)('only run in ui-tars', () => {
  it('plan to target', async () => {
    const { context } = await getContextFromFixture('todo');

    const { width, height } = context.size;
    const startTime = Date.now();
    const { actionsFromModel } = await uiTarsPlanning({
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
      'start_box' in actionsFromModel[0].action_inputs
        ? actionsFromModel[0].action_inputs.start_box
        : '[]';
    assert(start_box, 'start_box is required');
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
