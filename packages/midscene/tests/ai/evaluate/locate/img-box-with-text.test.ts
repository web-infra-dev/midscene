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

    const imagePath = path.resolve(testDataDir, 'output_without_text.png');
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

    // Filter element snapshot list to only include text elements with required fields
    const filteredElements = this.elementSnapshotList
      .filter((el) => el.nodeType === 'TEXT Node')
      .map((el) => ({
        indexId: el.indexId,
        rect: el.rect,
        content: el.content,
      }));

    const result = await call([
      {
        role: 'system',
        content: `
          You are an expert in identifying numbered boxes and text elements in images. You will receive:
          1. User's target element description (in any language)
          2. Page screenshot with numbered boxes (only non-text elements like images and buttons are boxed)
          3. JSON data of text elements with their positions and content
          
          Your task:
          1. First analyze the image to find any numbered box matching the description
             (Note: Only non-text elements have numbered boxes in the image)
          2. If no matching box is found, analyze both the image and JSON data together:
             - Look at the text content in the JSON data
             - Consider the position information (rect) to understand spatial relationships
             - Check if any text elements are near or related to visible numbered boxes
             - Use this combined visual and textual context to find the target element
          
          The JSON data format for text elements:
          {
            indexId: number,    // Element ID
            rect: {             // Position and size
              x: number,
              y: number,
              width: number,
              height: number
            },
            content: string     // Text content
          }

          Return format (strict JSON):
          {
            "reason": "string", // Explanation of why this element was selected, including spatial relationships if relevant
            "source": "string",  // "text" if found through text content, "image" if found through visual analysis
            "number": number,  // The identified box number
          }
          or
          {
            "number": null,
            "reason": "string", // Explanation of why no match was found
            "source": null
          }
        `,
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `
            用户希望查找的目标元素描述: ${prompt} \n
            页面尺寸: ${JSON.stringify(this.pageInfo.size)} \n
            文本元素数据: ${JSON.stringify(filteredElements)} \n
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

      const boxes = await Promise.all(
        prompts.map(async (prompt, indexId) => ({
          prompt,
          ...(await locator.findElement(prompt)),
          indexId,
        })),
      );

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
        '价格',
        '切换语言',
        '客服图标',
      ]);
    });

    // it('video player', async () => {
    //   await runTest(path.resolve(__dirname, '../test-data/aweme-play'), [
    //     '播放按钮',
    //     '点赞按钮',
    //     '收藏按钮',
    //     '关闭按钮',
    //     '搜索框',
    //     '音量调节按钮',
    //   ]);
    // });
  },
  {
    timeout: 180 * 1000,
  },
);
