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

    const imagePath = path.resolve(testDataDir, 'input.png');
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

    // Get all elements with their text content and visual properties
    const filteredElements = this.elementSnapshotList.map((el) => ({
      nodeType: el.nodeType,
      indexId: el.indexId,
      rect: el.rect,
      content: el.content,
      attributes: el.attributes,
      // isVisible: el.isVisible,
      // isClickable: el.isClickable
    }));

    const result = await call([
      {
        role: 'system',
        content: `
          You are an expert in analyzing web page elements by combining visual and textual information. You will receive:
          1. A user's target element description (in any language)
          2. A screenshot showing numbered boxes around interactive elements
          3. Detailed element data including:
             - Text content
             - Element positions and sizes
             - Element attributes and properties
             - Visual characteristics
          
          Your task is to find the most relevant element by:
          1. Analyzing both visual and textual characteristics together
          2. Considering:
             - Text content matches
             - Visual appearance and location
             - Semantic relevance to the user's description
             - Proximity to other relevant elements
             - Element attributes and interactive properties
          
          Return format (strict JSON):
          {
            "number": number,     // The identified element's number
            "reason": "string",   // Detailed explanation combining visual and textual evidence
            "confidence": number  // 0-1 score indicating match confidence
          }
          or
          {
            "number": null,
            "reason": "string",   // Why no suitable match was found
            "confidence": 0
          }
        `,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `
            Target element description: ${prompt}
            Page dimensions: ${JSON.stringify(this.pageInfo.size)}
            Element data: ${JSON.stringify(filteredElements)}
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

      const boxes = [];
      for (let indexId = 0; indexId < prompts.length; indexId++) {
        const prompt = prompts[indexId];
        const result = await locator.findElement(prompt);
        boxes.push({
          prompt,
          ...result,
          indexId,
        });
      }

      await locator.visualizeResults(
        boxes,
        path.join(dataDir, 'output_with_boxes_without_text.png'),
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
        '选规格按钮',
        '轻芒芒甘露价格',
        '切换语言',
        '右下角客服图标',
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
