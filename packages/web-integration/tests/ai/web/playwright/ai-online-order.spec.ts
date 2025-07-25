import { expect } from 'playwright/test';
import { test } from './fixture';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test.beforeEach(async ({ page }) => {
  page.setViewportSize({ width: 400, height: 905 });
  await page.goto('https://heyteavivocity.meuu.online/home');
  await page.waitForLoadState('networkidle');
});

test('ai online order', async ({ ai, aiTap, page, aiQuery }) => {
  await ai('点击顶部语言切换按钮(英文、中文)，在弹出的下拉列表中点击中文');
  await ai('向下滚动一屏');
  await sleep(2000);
  await aiTap('点击多肉葡萄的规格按钮', {
    deepThink: true,
  });
  await ai('点击不使用吸管、点击冰沙推荐、点击正常冰推荐');
  await ai('向下滚动一屏');
  await sleep(2000);
  await ai('点击标准甜、点击绿妍（推荐）,点击标准口味');
  await ai('滚动到最下面');
  await ai('点击页面下边的“选好了”按钮');
  await sleep(2000);
  await ai('点击屏幕右上角购物袋按钮');

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
