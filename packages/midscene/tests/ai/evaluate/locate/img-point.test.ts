import fs from 'node:fs';
import path from 'node:path';
import { call } from '@/ai-model/openai/index';
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
    const elementSnapshotList = JSON.parse(
      fs.readFileSync(
        path.resolve(testDataDir, 'element-snapshot.json'),
        'utf8',
      ),
    );

    const imagePath = path.resolve(testDataDir, 'input.png');
    const image = fs.readFileSync(imagePath);

    this.pageInfo = {
      imageBase64: image.toString('base64'),
      inputImgPath: imagePath,
      size: {
        screenWidth: elementSnapshotList[0].screenWidth,
        screenHeight: elementSnapshotList[0].screenHeight,
      },
    };
  }

  async findElement(prompt: string): Promise<ElementPoint> {
    const startTime = Date.now();
    const response = await fetch(
      `${process.env.OPENAI_BASE_URL}/chat/completions`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Cookie: process.env.MIDSCENE_COOKIE || '',
        },
        body: JSON.stringify({
          model: process.env.MIDSCENE_MODEL_NAME,
          messages: [
            {
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: 'Based on the screenshot of the page, I give a text description and you give its corresponding location. The coordinate represents a clickable location [x, y] for an element, which is a relative coordinate on the screenshot, scaled from 0 to 1.',
                },
                {
                  type: 'image',
                  image_url: {
                    url: `data:image/png;base64,${this.pageInfo.imageBase64}`,
                  },
                  min_pixels: min_pixels,
                  max_pixels: max_pixels,
                },
                {
                  type: 'text',
                  text: `${prompt}`,
                },
              ],
            },
          ],
          temperature: 0.1,
        }),
      },
    );

    const data = await response.json();
    // const result = await call([
    //   // {
    //   //   role: 'system',
    //   //   // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
    //   //   content: `Based on the screenshot of the page, I give a text description and you give its corresponding location. The coordinate represents a clickable location [x, y] for an element, which is a relative coordinate on the screenshot, scaled from 0 to 1.`,
    //   // },
    //   {
    //     role: 'user',
    //     content: [
    //       {
    //         type: 'text',
    //         text: `
    //         Based on the screenshot of the page, I give a text description and you give its corresponding location. The coordinate represents a clickable location [x, y] for an element, which is a relative coordinate on the screenshot, scaled from 0 to 1.
    //         `,
    //       },
    //       {
    //         type: 'text',
    //         text: `
    //         用户希望查找的目标元素描述: ${prompt}
    //         页面尺寸: ${this.pageInfo.size.screenWidth}x${this.pageInfo.size.screenHeight}
    //         `,
    //       },
    //       {
    //         type: 'image_url',
    //         image_url: {
    //           url: `data:image/png;base64,${this.pageInfo.imageBase64}`,
    //         },
    //       },
    //     ],
    //   },
    // ]);

    const duration = `${(Date.now() - startTime) / 1000}s`;
    const { content } = data.choices[0].message;
    console.log(content);
    // const resObj = this.parseNonStrictJSON(result.content);

    return {
      point: content as unknown as [number, number],
      duration,
    };
  }

  async visualizeResults(results: ElementPoint[], outputPath: string) {
    const points = results.map((result, index) => ({
      point: result.point,
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

    // it('online order', async () => {
    //   await runTest(path.resolve(__dirname, '../test-data/online_order_en'), [
    //     'Shopping cart button in the top right',
    //     'Select specifications',
    //     'Price',
    //     'Customer service button in the lower right corner',
    //     'Switch language',
    //   ]);
    // });

    it('online order chinese', async () => {
      await runTest(path.resolve(__dirname, '../test-data/online_order'), [
        'switch language.',
        '多肉葡萄价格',
        '多肉葡萄选择规格',
        '右上角购物车',
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
