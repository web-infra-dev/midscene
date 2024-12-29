import fs from 'node:fs';
import path from 'node:path';
import { generateExtractData, generateTestDataPath } from '@/debug';
import { PlaywrightWebPage } from '@/playwright';
import { findElementPoint, planTargetAction } from '@midscene/core/ai-model';
import { compositePointInfoImg, saveBase64Image } from '@midscene/shared/img';
import test, { expect } from 'playwright/test';
test.beforeEach(async ({ page }) => {
  page.setViewportSize({ width: 400, height: 905 });
  await page.goto('https://heyteavivocity.meuu.online/home');
  await page.waitForLoadState('networkidle');
});

function getPoint(predictions: any, factor = 1000) {
  const [x, y] = predictions.positions;
  const point = [(x / factor).toFixed(3), (y / factor).toFixed(3)].map(Number);
  return point as [number, number];
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
  const targetPrompt = '切换语言中文';

  while (!isCompleted && currentActionNumber < 10) {
    await page.waitForLoadState('networkidle');
    const screenshotBase64 = await playwrightPage.screenshotBase64();
    const startTime = Date.now();
    const data = await planTargetAction<any>(targetPrompt, [], {
      screenshotBase64,
    });
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`API call duration: ${duration}ms`, data);

    if (data && data['is-completed'] === true) {
      isCompleted = true;
      break;
    }

    const size = await playwrightPage.size();
    const [x, y] = getPoint(data);
    const point = [x * size.width, y * size.height];
    const composeImage = await compositePointInfoImg({
      inputImgBase64: screenshotBase64,
      points: [
        {
          point: [x, y],
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
    if (data['action-type'] === 'click') {
      await playwrightPage.mouse.click(point[0], point[1]);
    } else if (data['action-type'] === 'scroll') {
      await playwrightPage.scrollDownOneScreen();
    }

    historyActions.push(
      `action: ${data['action-type']}, target: ${data['target-element']} thinking: ${data.thinking}`,
    );
    // break;
  }
  console.log('historyActions', historyActions);
});
