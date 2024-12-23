import path from 'node:path';
import { planTargetAction } from '@/ai-model';
import { findElementPoint } from '@/ai-model/prompt/find_element_point';
import { compositePointInfoImg, saveBase64Image } from '@midscene/shared/img';
import sizeOf from 'image-size';
/* eslint-disable max-lines-per-function */
import { assert, describe, expect, it, vi } from 'vitest';
import { getPageDataOfTestName } from '../test-suite/util';

vi.setConfig({
  testTimeout: 180 * 1000,
  hookTimeout: 30 * 1000,
});

describe('automation - planning target', () => {
  it('basic run', async () => {
    const { context } = await getPageDataOfTestName('todo');
    const startTime = Date.now();
    const data = await planTargetAction<any>(
      'type "Why is the earth a sphere?", wait 3.5s, hit Enter',
      [],
      {
        screenshotBase64: context.screenshotBase64,
      },
    );
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`API call duration: ${duration}ms`);
    console.log(data.content);
    const findElementStartTime = Date.now();
    const pointInfo = await findElementPoint<any>(
      data.content['target-element'],
      {
        screenshotBase64: context.screenshotBase64,
      },
    );
    const findElementEndTime = Date.now();
    const findElementDuration = findElementEndTime - findElementStartTime;
    console.log(`Find element duration: ${findElementDuration}ms`);

    // const { width, height } = await sizeOf(context.screenshotBase64);
    // assert(width && height, 'Invalid image');
    const composeImage = await compositePointInfoImg({
      inputImgBase64: context.screenshotBase64,
      points: [
        {
          point: pointInfo.content,
          indexId: 0,
        },
      ],
      size: {
        width: 1280,
        height: 720,
      },
    });
    await saveBase64Image({
      base64Data: composeImage,
      outputPath: path.join(__dirname, 'output', 'plan-target.png'),
    });
    console.log(pointInfo);
    expect(data).toBeTruthy();
  });
});
