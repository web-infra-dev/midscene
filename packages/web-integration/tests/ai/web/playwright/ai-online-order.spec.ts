import path from 'node:path';
import { generateExtractData, generateTestDataPath } from '@/debug';
import { PlaywrightWebPage } from '@/playwright';
import { expect } from 'playwright/test';
import { test } from './fixture';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.beforeEach(async ({ page }) => {
  page.setViewportSize({ width: 400, height: 905 });
  await page.goto('https://heyteavivocity.meuu.online/home');
  await page.waitForLoadState('networkidle');
});
let index = 0;
async function generateTestData(playwrightPage: any) {
  return await generateExtractData(
    playwrightPage,
    path.join(__dirname, 'test-data', 'online-order-history', `${index++}`),
    {
      disableInputImage: false,
      disableOutputImage: true,
      disableOutputWithoutTextImg: true,
      disableResizeOutputImg: true,
      disableSnapshot: true,
    },
  );
}

test('ai online order', async ({ ai, page, aiQuery }) => {
  const playwrightPage = new PlaywrightWebPage(page);
  await generateTestData(playwrightPage);
  await ai('点击语言切换按钮“english”');
  await generateTestData(playwrightPage);
  await ai('点击语言切换中的中文');
  await generateTestData(playwrightPage);
  await ai('向下滚动两屏');
  await generateTestData(playwrightPage);
  await ai('点击多肉葡萄的选规格按钮');
  await generateTestData(playwrightPage);
  await ai('点击不使用吸管、点击冰沙推荐、点击正常冰推荐');
  await generateTestData(playwrightPage);
  await ai('向下滚动一屏');
  await generateTestData(playwrightPage);
  await ai('点击标准甜、点击绿妍（推荐）、点击标准口味');
  await generateTestData(playwrightPage);
  await ai('滚动到最下面');
  await generateTestData(playwrightPage);
  await ai('点击页面下边的“选好了”按钮');
  await generateTestData(playwrightPage);
  await ai('点击屏幕右上角购物袋按钮');
  await generateTestData(playwrightPage);

  const cardDetail = await aiQuery({
    productName: '商品名称，在价格上面',
    productPrice: '商品价格， string',
    productDescription: '商品描述（饮品的各种参数，吸管、冰沙等），在价格下面',
  });

  // expect(cardDetail.productName.indexOf('多肉葡萄')).toBeGreaterThanOrEqual(0);

  // const content = await aiQuery(query('购物车商品详情', {
  //   productName: "商品名称，在价格上面",
  //   productPrice: "商品价格",
  //   productDescription: "商品描述（饮品的各种参数，吸管、冰沙等），在价格下面",
  // }));

  console.log('商品订单详情：', {
    productName: cardDetail.productName,
    productPrice: cardDetail.productPrice,
    productDescription: cardDetail.productDescription,
  });
  expect(cardDetail.productName).toContain('多肉葡萄');
  expect(cardDetail.productDescription).toContain('绿妍');
});
