import fs from 'node:fs';
import path from 'node:path';
import { AIActionType } from '@/ai-model/common';
import { call, callToGetJSONObject } from '@/ai-model/openai/index';
import {
  findElementPoin,
  findElementPointPrompt,
} from '@/ai-model/prompt/find_element_point';
import {
  compositePointInfoImg,
  imageInfo,
  saveBase64Image,
} from '@midscene/shared/img';
import sizeOf from 'image-size';
import { assert, afterAll, describe, expect, it } from 'vitest';

interface ElementPoint {
  point: [number, number];
  // reason: string;
  duration: string;
}

const min_pixels = 256 * 28 * 28;
const max_pixels = 1344 * 28 * 28;

interface PageInfo {
  imageBase64: string;
  inputImgPath: string;
  size: {
    screenWidth: number;
    screenHeight: number;
  };
}

class ElementLocator {
  private pageInfo: PageInfo;

  constructor(testDataDir: string) {
    // const elementSnapshotList = JSON.parse(
    //   fs.readFileSync(
    //     path.resolve(testDataDir, 'element-snapshot.json'),
    //     'utf8',
    //   ),
    // );

    const imagePath = path.resolve(testDataDir, 'input.png');
    const image = fs.readFileSync(imagePath);

    this.pageInfo = {
      imageBase64: image.toString('base64'),
      inputImgPath: imagePath,
      size: {
        // screenWidth: elementSnapshotList[0].screenWidth,
        // screenHeight: elementSnapshotList[0].screenHeight,
        screenWidth: 400,
        screenHeight: 905,
      },
    };
  }

  async findElement(prompt: string): Promise<ElementPoint> {
    const startTime = Date.now();
    // const response = await fetch(
    //   `${process.env.OPENAI_BASE_URL}/chat/completions`,
    //   {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //       Cookie: process.env.MIDSCENE_COOKIE || '',
    //     },
    //     body: JSON.stringify({
    //       model: process.env.MIDSCENE_MODEL_NAME,
    //       messages: [
    //         {
    //           role: 'user',
    //           content: [
    //             {
    //               type: 'text',
    //               text: 'Based on the screenshot of the page, I give a text description and you give its corresponding center point location. The coordinate represents the center point [x, y] of the target element, which is a relative coordinate on the screenshot, scaled from 0 to 1. Please ensure the coordinate is at the exact center of the element.',
    //             },
    //             {
    //               type: 'image',
    //               image_url: {
    //                 url: `data:image/png;base64,${this.pageInfo.imageBase64}`,
    //               },
    //               min_pixels: min_pixels,
    //               max_pixels: max_pixels,
    //             },
    //             {
    //               type: 'text',
    //               text: `${prompt}`,
    //             },
    //           ],
    //         },
    //       ],
    //       temperature: 0.1,
    //     }),
    //   },
    // );

    // const data = await response.json();
    const point = await findElementPoin(prompt, {
      screenshotBase64: this.pageInfo.imageBase64,
    });

    const duration = `${(Date.now() - startTime) / 1000}s`;
    // console.log(point);
    // const resObj = this.parseNonStrictJSON(result.content);

    return {
      point: point,
      duration,
    };
  }

  async visualizeResults(results: ElementPoint[], outputPath: string) {
    const points = results.map((result, index) => ({
      point: [result.point[0], result.point[1]] as [number, number],
      index,
    }));
    const { width, height } = await sizeOf(this.pageInfo.inputImgPath);
    assert(width && height, 'Invalid image');

    const composeImage = await compositePointInfoImg({
      inputImgBase64: this.pageInfo.imageBase64,
      points,
      size: {
        width,
        height,
      },
    });

    await saveBase64Image({
      base64Data: composeImage,
      outputPath,
    });
  }

  private parseNonStrictJSON(source: string) {
    let jsonObj = null;
    source = source.replace(/```json\n/g, '').replace(/\n```/g, '');
    try {
      jsonObj = JSON.parse(source);
    } catch (e) {
      try {
        jsonObj = new Function(`return ${source}`)();
      } catch (ee) {
        console.error('无法解析 JSON 字符串: \n', source);
      }
    }
    return jsonObj;
  }
}

describe(
  'img point',
  () => {
    async function runTest(dataDir: string, prompts: string[]) {
      const locator = new ElementLocator(dataDir);
      const points = [];
      for (let index = 0; index < prompts.length; index++) {
        const prompt = prompts[index];
        const result = await locator.findElement(prompt);
        points.push({
          index,
          prompt,
          ...result,
        });
      }

      await locator.visualizeResults(
        points,
        path.join(dataDir, 'output_with_markers.png'),
      );

      console.log('points', points);
      expect(points).toBeDefined();
    }

    it('online order', async () => {
      await runTest(path.resolve(__dirname, '../test-data/online_order_en'), [
        'Shopping cart button in the top right',
        'Select specifications',
        'Price',
        'Customer service button in the lower right corner',
        'Switch language',
      ]);
    });

    it('online order list', async () => {
      await runTest(path.resolve(__dirname, '../test-data/online_order_list'), [
        '多肉葡萄选择规格按钮',
      ]);
    });
    it('online order args', async () => {
      await runTest(
        path.resolve(__dirname, '../test-data/oneline_order_args'),
        ['可降解吸管，复选框', '冰沙'],
      );
    });
    it('online order chinese', async () => {
      await runTest(path.resolve(__dirname, '../test-data/online_order'), [
        'switch language.',
        '多肉葡萄价格',
        '多肉葡萄选择规格',
        '右上角购物车',
        '右下角客服',
      ]);
    });

    it('video player', async () => {
      await runTest(path.resolve(__dirname, '../test-data/aweme-play'), [
        '五角星按钮',
        '点赞按钮',
        '收藏按钮',
        '关闭按钮',
        '搜索框',
        '音量调节按钮',
      ]);
    });
  },
  {
    timeout: 180 * 1000,
  },
);
