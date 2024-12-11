import fs from 'node:fs';
import path from 'node:path';
import { call } from '@/ai-model/openai/index';
import { compositeElementInfoImg, saveBase64Image } from '@midscene/shared/img';
import { describe, expect, it } from 'vitest';

interface ElementBox {
  number: number;
  reason: string;
  duration: string;
  indexId: number;
}

interface PageInfo {
  imageBase64: string;
  originImgBase64: string;
  size: {
    screenWidth: number;
    screenHeight: number;
  };
}

class ElementLocator {
  private pageInfo: PageInfo;
  private elementSnapshotList: any[];

  constructor(testDataDir: string) {
    this.elementSnapshotList = JSON.parse(
      fs.readFileSync(
        path.resolve(testDataDir, 'element-snapshot.json'),
        'utf8',
      ),
    );

    const imagePath = path.resolve(testDataDir, 'output.png');
    const originImgPath = path.resolve(testDataDir, 'input.png');
    const image = fs.readFileSync(imagePath);
    const originImg = fs.readFileSync(originImgPath);

    this.pageInfo = {
      imageBase64: image.toString('base64'),
      originImgBase64: originImg.toString('base64'),
      size: {
        screenWidth: this.elementSnapshotList[0].screenWidth,
        screenHeight: this.elementSnapshotList[0].screenHeight,
      },
    };
  }

  async findElement(prompt: string): Promise<ElementBox> {
    const startTime = Date.now();
    const result = await call([
      {
        role: 'system',
        // content: `你是一位专业的UI测试工程师（2D）。请仔细观察图片，根据问题找到对应的UI元素，并检查其标号。请以JSON格式返回结果，格式为: {\"reason\": \"解释为什么选择这个数字，包括元素的位置和特征\"}。请务必仔细检查每个元素的细节特征，确保标号的准确性。如果发现多个相似元素，请详细说明选择依据。如果不确定，请说明原因。 \"number\": \"找到的数字\", `,
        content: `
          You are an expert in identifying numbered boxes in images. You will receive the following information:
          1. User's target element description (in any language)
          2. Page screenshot (base64 encoded) with numbered boxes marking elements

          Your task is:
          1. Carefully analyze the user's description to understand which numbered box they want to find
          2. Return the box number and explain your reasoning

          Requirements:
          1. You should identify the correct box number based on the user's description
          2. If no matching box can be found, return null
          3. You should be able to handle descriptions in any language

          Return format (strict JSON):
          {
            "number": number,  // The identified box number
            "reason": "string" // Explanation of why this box number was chosen
          }
          or
          {
            "number": null,
            "reason": "string" // Explanation of why no matching box could be found
          }
        `,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `用户希望查找的目标元素描述: ${prompt}`,
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

  async visualizeResults(results: ElementBox[], outputPath: string) {
    const boxes: any = results
      .map((result) => {
        const element = this.elementSnapshotList.find(
          (el) => el.indexId === Number(result.number),
        );
        if (!element) return null;
        return {
          rect: element.rect,
          indexId: result.indexId,
        };
      })
      .filter(Boolean);

    const composeImage = await compositeElementInfoImg({
      inputImgBase64: this.pageInfo.originImgBase64,
      elementsPositionInfo: boxes,
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
  'img box',
  () => {
    async function runTest(dataDir: string, prompts: string[]) {
      const locator = new ElementLocator(dataDir);

      const boxes = await Promise.all(
        prompts.map(async (prompt, indexId) => ({
          prompt,
          ...(await locator.findElement(prompt)),
          indexId,
        })),
      );

      await locator.visualizeResults(
        boxes,
        path.join(dataDir, 'output_with_boxes.png'),
      );

      console.log(boxes);
      expect(boxes).toBeDefined();
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
        '购物车图标',
        '选规格',
        '价格',
        '切换语言',
        '右下角客服按钮',
      ]);
    });

    // it('video player', async () => {
    //   await runTest(path.resolve(__dirname, '../test-data/aweme-play'), [
    //     '播放按钮',
    //     '左下角暂停按钮',
    //     '点赞按钮（爱心）',
    //     '收藏按钮',
    //     '关闭按钮',
    //     '搜索框',
    //     '右下角音量调节按钮',
    //   ]);
    // });
  },
  {
    timeout: 180 * 1000,
  },
);
