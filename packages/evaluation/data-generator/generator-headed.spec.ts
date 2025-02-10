import { PlaywrightWebPage } from '@midscene/web/playwright';
import { test } from './fixture';
import { generateExtractData, generateTestDataPath } from './utils';

function sleep(time: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(0);
    }, time);
  });
}

test('taobao', async ({ page, ai }) => {
  const playwrightPage = new PlaywrightWebPage(page);
  page.setViewportSize({ width: 1280, height: 800 });

  await page.goto('https://www.taobao.com/');

  // for --ui
  await sleep(5000);

  await generateExtractData(playwrightPage, generateTestDataPath('taobao'));
});
