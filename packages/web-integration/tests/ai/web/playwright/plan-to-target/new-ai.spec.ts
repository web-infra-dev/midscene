import fs from 'node:fs';
import path from 'node:path';
import { generateExtractData, generateTestDataPath } from '@/debug';
import { PlaywrightWebPage } from '@/playwright';
import {
  type ChatCompletionMessageParam,
  findElementPoin,
  planTargetAction,
} from '@midscene/core/ai-model';
import { compositePointInfoImg, saveBase64Image } from '@midscene/shared/img';
import test, { expect } from 'playwright/test';
test.beforeEach(async ({ page }) => {
  // page.setViewportSize({ width: 400, height: 905 });
  await page.goto('https://google.com');
  await page.waitForLoadState('networkidle');
});

function getPoint(predictions: any, factor = 1000) {
  const [x, y] = predictions.positions;
  const point = [(x / factor).toFixed(3), (y / factor).toFixed(3)].map(Number);
  return point as [number, number];
}

function sleep(number: number) {
  return new Promise((resolve) => setTimeout(resolve, number));
}

test('ai online order', async ({ page }) => {
  try {
    const outputPath = path.join(__dirname, 'output');
    await fs.rmdirSync(outputPath, { recursive: true });
  } catch (error) {
    // console.log('output path not found');
  }

  const playwrightPage = new PlaywrightWebPage(page);
  const historyActions: string[] = [];
  let isCompleted = false;
  let currentActionNumber = 0;
  const targetPrompt = '搜索 midscene ，找到';
  // const targetPrompt =
  //   '切换语言到中文，下单一个饮品（饮品规格页说明：饮品规格页有很多饮品规格，可能需要滚动完成必选饮品的勾选，最下面有确认下单按钮）';
  let todoList = '暂无';
  let whatToDoNext = '暂无';

  while (!isCompleted && currentActionNumber < 20) {
    await page.waitForLoadState('networkidle');
    await sleep(1000);
    const screenshotBase64 = await playwrightPage.screenshotBase64();
    const startTime = Date.now();
    const { content: data } = await planTargetAction<any>({
      userTarget: targetPrompt,
      todoList,
      whatToDoNext,
      screenshotBase64,
    });
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`API call duration: ${duration}ms`, data);
    todoList = data['todo-list'];
    whatToDoNext = data['what-to-do-next'];

    const startFindElementTime = Date.now();
    let point: [number, number] | null = null;
    if (data['action-type'] === 'click') {
      point = await findElementPoin(data['target-element'], {
        screenshotBase64,
      });
    }
    const endFindElementTime = Date.now();
    const durationFindElement = endFindElementTime - startFindElementTime;
    console.log(
      `Find element API call duration: ${durationFindElement}ms`,
      point,
    );

    if (data.error) {
      console.log('error and retry', data.error);
      continue;
    }
    historyActions.push(data['action-summary']);

    if (data && data['is-completed'] === true) {
      isCompleted = true;
      break;
    }

    let newPoint: [number, number] | null = null;
    const size = await playwrightPage.size();
    if (point) {
      const [x, y] = point;
      newPoint = [x * size.width, y * size.height];
      // const [x, y] = getPoint(data);
      // const point = [x * size.width, y * size.height];
    }
    const composeImage = await compositePointInfoImg({
      inputImgBase64: screenshotBase64,
      points: [
        {
          point: newPoint ? [newPoint[0], newPoint[1]] : [0, 0],
          indexId: 0,
        },
      ],
      size: {
        width: size.width,
        height: size.height,
      },
    });
    await saveBase64Image({
      base64Data: composeImage,
      outputPath: path.join(
        __dirname,
        'output',
        `plan-target-${currentActionNumber++}.png`,
      ),
    });
    if (data['action-type'] === 'click' && newPoint) {
      await playwrightPage.mouse.click(newPoint[0], newPoint[1]);
    } else if (data['action-type'] === 'scroll') {
      await playwrightPage.scrollDownOneScreen();
    } else if (data['action-type'] === 'input') {
      await playwrightPage.keyboard.type(data.value);
    }

    historyActions.push(data['action-summary']);
    // break;
  }
  console.log('historyActions', historyActions);
});
