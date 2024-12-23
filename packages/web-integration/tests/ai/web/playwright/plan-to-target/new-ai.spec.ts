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
  const targetPrompt =
    '切换语言中文，滚动找到多肉葡萄，点击选择规格，在选择规格勾选所有必选参数';

  while (!isCompleted && currentActionNumber < 10) {
    await page.waitForLoadState('networkidle');
    const screenshotBase64 = await playwrightPage.screenshotBase64();

    const data = await planTargetAction<any>(targetPrompt, historyActions, {
      screenshotBase64,
    });
    console.log(data.content);

    if (data.content['is-completed'] === true) {
      isCompleted = true;
      break;
    }

    const pointInfo = await findElementPoint<any>(
      data.content['target-element'],
      {
        screenshotBase64,
      },
    );
    console.log(pointInfo);
    const size = await playwrightPage.size();
    const composeImage = await compositePointInfoImg({
      inputImgBase64: screenshotBase64,
      points: [
        {
          point: [pointInfo.content[0], pointInfo.content[1]],
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
    if (data.content['action-type'] === 'CLICK') {
      await playwrightPage.mouse.click(
        pointInfo.content[0] * size.width,
        pointInfo.content[1] * size.height,
      );
    } else if (data.content['action-type'] === 'SCROLL') {
      await playwrightPage.scrollDownOneScreen();
    }

    historyActions.push(
      `action: ${data.content['action-type']}, target: ${data.content['target-element']} thinking: ${data.content.thinking}`,
    );
  }
  console.log('historyActions', historyActions);
});
