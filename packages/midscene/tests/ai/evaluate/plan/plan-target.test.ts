import path from 'node:path';
import { planTargetAction } from '@/ai-model';
import { extractJSONFromCodeBlock, safeParseJson } from '@/ai-model/openai';
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

function getPoint(predictions: any, factor = 1000) {
  const [x, y] = predictions.positions;
  const point = [(x / factor).toFixed(3), (y / factor).toFixed(3)].map(Number);
  return point as [number, number];
}

async function getImgSize(base64: string) {
  const base64Data = base64.replace(/^data:image\/\w+;base64,/, '');
  const imageBuffer = Buffer.from(base64Data, 'base64');
  const { width, height } = await sizeOf(imageBuffer);
  return { width, height };
}

describe('automation - planning target', () => {
  it('basic run', async () => {
    const { context } = await getPageDataOfTestName('todo');
    const startTime = Date.now();
    const predictions = await planTargetAction<any>(
      'type "Why is the earth a sphere?", wait 3.5s, hit Enter',
      [],
      {
        screenshotBase64: context.screenshotBase64,
      },
    );
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`API call duration: ${duration}ms`);
    console.log(predictions);
    const { width, height } = await getImgSize(context.screenshotBase64);
    assert(width && height, 'Invalid image');
    const point = getPoint(predictions);

    const composeImage = await compositePointInfoImg({
      inputImgBase64: context.screenshotBase64,
      points: [
        {
          point: [point[0], point[1]],
          indexId: 0,
        },
      ],
      size: {
        width,
        height,
      },
    });
    await saveBase64Image({
      base64Data: composeImage,
      outputPath: path.join(__dirname, 'output', 'plan-target.png'),
    });
    // // console.log(pointInfo);
    // expect(data).toBeTruthy();
  });
});
