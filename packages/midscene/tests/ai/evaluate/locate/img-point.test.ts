import fs from 'node:fs';
import path from 'node:path';
import { call } from '@/ai-model/openai/index';
import { compositeElementInfoImg, saveBase64Image } from '@midscene/shared/img';
import { describe, expect, it } from 'vitest';

interface ElementPoint {
  point: [number, number];
  reason: string;
  duration: string;
}

interface PageInfo {
  imageBase64: string;
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
      size: {
        screenWidth: elementSnapshotList[0].screenWidth,
        screenHeight: elementSnapshotList[0].screenHeight,
      },
    };
  }

  async findElement(prompt: string): Promise<ElementPoint> {
    const startTime = Date.now();
    const result = await call([
      {
        role: 'system',
        content: `
          You are an expert in precisely locating page elements. You will receive the following information:
          1. User's target element description (in any language)
          2. Page dimensions (width x height)
          3. Page screenshot (base64 encoded)

          Your task is:
          1. Carefully analyze the user's description to understand the specific element they want to find, regardless of the language used
          2. Accurately locate this element in the page screenshot
          3. Return the center point coordinates of the element and explain your reasoning

          Requirements:
          1. Coordinates must be within page dimensions
          2. Coordinates should point to the center of the target element as precisely as possible
          3. If multiple matching elements are found, choose the one that best matches the user's description
          4. If no matching element can be found, return null
          5. You should be able to handle element descriptions in any language (e.g. English, Chinese, Japanese, etc.)

          Return format (strict JSON):
          {
            "point": [x, y],  // x,y as integer coordinates
            "reason": "string" // Detailed explanation of why this element was chosen and how it matches the description
          }
          or
          {
            "point": null,
            "reason": "string" // Explanation of why no matching element could be found
          }
        `,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `
            用户希望查找的目标元素描述: ${prompt}
            页面尺寸: ${this.pageInfo.size.screenWidth}x${this.pageInfo.size.screenHeight}
            `,
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${this.pageInfo.imageBase64}`,
            },
          },
        ],
      },
    ]);

    const duration = `${(Date.now() - startTime) / 1000}s`;
    const resObj = this.parseNonStrictJSON(result.content);

    return {
      ...resObj,
      duration,
    };
  }

  async visualizeResults(results: ElementPoint[], outputPath: string) {
    const points = results.map((result, index) => ({
      point: result.point,
      index,
    }));

    const composeImage = await compositeElementInfoImg({
      inputImgBase64: this.pageInfo.imageBase64,
      elementsPositionInfo: points.map((point) => ({
        rect: {
          left: point.point[0] - 4,
          top: point.point[1] - 4,
          width: 8,
          height: 8,
        },
        indexId: point.index,
      })),
      size: {
        width: this.pageInfo.size.screenWidth,
        height: this.pageInfo.size.screenHeight,
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

      const points = await Promise.all(
        prompts.map(async (prompt, index) => ({
          index,
          prompt,
          ...(await locator.findElement(prompt)),
        })),
      );

      await locator.visualizeResults(
        points,
        path.join(dataDir, 'output_with_markers.png'),
      );

      console.log(points);
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

    it('online order chinese', async () => {
      await runTest(path.resolve(__dirname, '../test-data/online_order'), [
        '右上角购物车按钮',
        '选规格',
        '价格',
        '客服按钮',
        '切换语言',
      ]);
    });

    it('video player', async () => {
      await runTest(path.resolve(__dirname, '../test-data/aweme-play'), [
        '播放按钮',
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
