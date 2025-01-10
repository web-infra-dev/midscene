import fs from 'node:fs';
import path from 'node:path';
import { generateExtractData, generateTestDataPath } from '@/debug';
import { PlaywrightWebPage } from '@/playwright';
import {
  type ChatCompletionMessageParam,
  planToTarget,
} from '@midscene/core/ai-model';
import { saveBase64Image, savePositionImg } from '@midscene/shared/img';
import type { Page } from 'playwright';
import { test } from '../fixture';

function getPoint(startBox: string, size: { width: number; height: number }) {
  const [x, y] = JSON.parse(startBox);
  return [x * size.width, y * size.height];
}

function sleep(number: number) {
  return new Promise((resolve) => setTimeout(resolve, number));
}
function capitalize(str: string) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

async function loopAgent(
  page: Page,
  playwrightPage: PlaywrightWebPage,
  userInstruction: string,
) {
  let isCompleted = false;
  let currentActionNumber = 0;
  // const targetPrompt =
  //   '切换语言到中文，下单一个饮品（饮品规格页说明：饮品规格页有很多饮品规格，可能需要滚动完成必选饮品的勾选，最下面有确认下单按钮）';
  const conversationHistory: ChatCompletionMessageParam[] = [];

  while (!isCompleted && currentActionNumber < 100) {
    await page.waitForLoadState('networkidle');
    await sleep(1000);
    const screenshotBase64 = await playwrightPage.screenshotBase64();
    const size = await playwrightPage.size();
    const startTime = Date.now();
    conversationHistory.push({
      role: 'user',
      content: [
        {
          type: 'image_url',
          image_url: {
            url: screenshotBase64,
          },
        },
      ],
    });
    const { realActions, action_summary } = await planToTarget({
      userInstruction: userInstruction,
      conversationHistory,
      size,
    });
    const endTime = Date.now();
    const duration = endTime - startTime;
    console.log(`API call duration: ${duration}ms`, realActions);

    const action = realActions[0];

    if (action.action_type === 'click') {
      const point = getPoint(action.action_inputs.start_box, size);
      await playwrightPage.mouse.click(point[0], point[1]);
      await savePositionImg({
        inputImgBase64: screenshotBase64,
        rect: {
          x: point[0],
          y: point[1],
        },
        outputPath: path.join(
          __dirname,
          'output',
          `plan-target-${currentActionNumber++}.png`,
        ),
      });
    } else if (action.action_type === 'type') {
      await playwrightPage.keyboard.type(
        action.action_inputs.content.trim().replace('\\n', '\n'),
      );
    } else if (action.action_type === 'hotkey') {
      const keys = action.action_inputs.key.split(',');
      for (const key of keys) {
        await playwrightPage.keyboard.press(capitalize(key) as any);
      }
      // await playwrightPage.keyboard.press(
      //   capitalize(action.action_inputs.key) as any,
      // );
    } else if (action.action_type === 'finished') {
      isCompleted = true;
      break;
    } else if (action.action_type === 'scroll') {
      if (action.action_inputs.direction === 'down') {
        await playwrightPage.scrollDown();
      } else {
        await playwrightPage.scrollUp();
      }
      // await playwrightPage.scrollTo(
    }

    conversationHistory.push({
      role: 'assistant',
      content: action_summary,
    });

    if (currentActionNumber > 10) {
      break;
    }

    // console.log('conversationHistory', conversationHistory);
  }

  console.log('historyActions', conversationHistory);
}

test('search midscene and star aiTarget', async ({ page, aiAction }) => {
  try {
    const outputPath = path.join(__dirname, 'output');
    await fs.rmSync(outputPath, { recursive: true });
  } catch (error) {}
  await page.goto('https://google.com');
  page.on('popup', async (popup) => {
    const url = await popup.url();
    console.log(`Popup opened: ${url}`);
    await popup.close(); // 关闭新打开的标签页
    await page.goto(url);
  });
  await aiAction('搜索 midscene ，找到 github 地址，点击 star');
});

test('music aiTarget', async ({ page, aiAction }) => {
  try {
    const outputPath = path.join(__dirname, 'output');
    await fs.rmdirSync(outputPath, { recursive: true });
  } catch (error) {}
  await page.goto('https://google.com');
  page.on('popup', async (popup) => {
    const url = await popup.url();
    console.log(`Popup opened: ${url}`);
    await popup.close(); // 关闭新打开的标签页
    await page.goto(url);
  });
  await aiAction('搜索抖音，搜索黑神话悟空，点赞');
});

test('search midscene and star', async ({ page }) => {
  try {
    const outputPath = path.join(__dirname, 'output');
    await fs.rmdirSync(outputPath, { recursive: true });
  } catch (error) {}
  await page.goto('https://google.com');
  page.on('popup', async (popup) => {
    const url = await popup.url();
    console.log(`Popup opened: ${url}`);
    await popup.close(); // 关闭新打开的标签页
    await page.goto(url);
  });
  const playwrightPage = new PlaywrightWebPage(page);

  await loopAgent(
    page,
    playwrightPage,
    '搜索 midscene ，找到 github 地址，滚动到下面查看有几个贡献者',
  );
});

test('douyin', async ({ page }) => {
  try {
    const outputPath = path.join(__dirname, 'output');
    await fs.rmdirSync(outputPath, { recursive: true });
  } catch (error) {}
  await page.goto('https://douyin.com');

  const playwrightPage = new PlaywrightWebPage(page);

  await loopAgent(page, playwrightPage, '搜索 黑神话，看两个视频');
});

// test('ai online order plan to target', async ({ page }) => {
//   try {
//     const outputPath = path.join(__dirname, 'output');
//     await fs.rmdirSync(outputPath, { recursive: true });
//   } catch (error) {
//     // console.log('output path not found');
//   }

//   const playwrightPage = new PlaywrightWebPage(page);
//   // const historyActions: string[] = [];
//   // let isCompleted = false;
//   // let currentActionNumber = 0;

//   await loopAgent(page, playwrightPage, '切换中文');
//   await loopAgent(page, playwrightPage, '点击青芒芒甘露的选择规格按钮');
//   await loopAgent(
//     page,
//     playwrightPage,
//     '在饮品选择规格页，将必选规格都勾选上，需要向下滚动，直到看到下单按钮',
//   );
//   // await loopAgent(
//   //   page,
//   //   playwrightPage,
//   //   '点击轻芒芒甘露选择规格，并将选择饮品中的规格',
//   // );
// });
