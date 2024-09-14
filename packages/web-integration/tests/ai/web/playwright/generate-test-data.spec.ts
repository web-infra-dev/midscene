import { generateExtractData, generateTestDataPath } from '@/debug';
import { PlaywrightWebPage } from '@/playwright';
import { test } from './fixture';

function sleep(time: number) {
  return new Promise((resolve) => {
    setTimeout(() => {
      resolve(0);
    }, time);
  });
}

test('generate todo test data', async ({ page }) => {
  const playwrightPage = new PlaywrightWebPage(page);
  await page.goto('https://todomvc.com/examples/react/dist/');
  // Add data
  await page.getByTestId('text-input').click();
  await page.keyboard.type('Learn Python');
  await page.keyboard.press('Enter');
  await page.getByTestId('text-input').click();
  await page.keyboard.type('Learn Rust');
  await page.keyboard.press('Enter');
  await page.getByTestId('text-input').click();
  await page.keyboard.type('Learn AI');
  await page.keyboard.press('Enter');
  await page.getByText('Learn Rust').hover();

  await generateExtractData(playwrightPage, generateTestDataPath('todo'));
  await page.keyboard.type('Learn English');
  await generateExtractData(
    playwrightPage,
    generateTestDataPath('todo-input-with-value'),
  );
});

test('generate visualstudio test data', async ({ page }) => {
  const playwrightPage = new PlaywrightWebPage(page);

  await page.goto('https://code.visualstudio.com/');
  await page.waitForLoadState('networkidle');

  await generateExtractData(
    playwrightPage,
    generateTestDataPath('visualstudio'),
  );
});

test('generate githubstatus test data', async ({ page }) => {
  const playwrightPage = new PlaywrightWebPage(page);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('https://www.githubstatus.com/');
  await page.waitForLoadState('networkidle');
  await sleep(3000);

  await generateExtractData(
    playwrightPage,
    generateTestDataPath('githubstatus'),
  );
});

test('antd widget pagination', async ({ page }) => {
  const playwrightPage = new PlaywrightWebPage(page);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('https://ant.design/components/pagination-cn');
  await page.waitForLoadState('networkidle');
  await generateExtractData(
    playwrightPage,
    generateTestDataPath('antd-pagination'),
  );
});

test('antd widget - tooltip', async ({ page }) => {
  const playwrightPage = new PlaywrightWebPage(page);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('https://ant.design/components/tooltip-cn');
  await page.waitForLoadState('networkidle');
  await generateExtractData(
    playwrightPage,
    generateTestDataPath('antd-tooltip'),
  );
});

test('antd widget - carousel', async ({ page }) => {
  const playwrightPage = new PlaywrightWebPage(page);

  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto('https://ant.design/components/carousel-cn');
  await page.waitForLoadState('networkidle');
  await generateExtractData(
    playwrightPage,
    generateTestDataPath('antd-carousel'),
  );
});

test('generate online order test data', async ({ page, ai }) => {
  const playwrightPage = new PlaywrightWebPage(page);

  page.setViewportSize({ width: 400, height: 905 });
  await page.goto('https://heyteavivocity.meuu.online/home');
  await page.evaluate('window.localStorage.setItem("LOCALE", "zh-CN")');
  await page.goto('https://heyteavivocity.meuu.online/home');
  await page.waitForLoadState('networkidle');
  // await page.getByText('English').nth(2).click();

  await generateExtractData(
    playwrightPage,
    generateTestDataPath('online_order'),
  );

  await ai('点击菜单文字');
  await ai('向下滚动一屏幕');

  await generateExtractData(
    playwrightPage,
    generateTestDataPath('online_order_list'),
  );
});
