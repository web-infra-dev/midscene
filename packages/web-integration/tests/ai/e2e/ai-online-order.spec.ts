import { expect } from 'playwright/test';
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  page.setViewportSize({ width: 400, height: 905 });
  await page.goto('https://heyteavivocity.meuu.online/home');
  await page.waitForLoadState('networkidle');
});

test('ai online order', async ({ ai, aiQuery }) => {
  await ai('点击左上角语言切换按钮(英文、中文)，在弹出的下拉列表中点击中文');
  await ai('向下滚动一屏');
  await ai('直接点击多肉葡萄的规格按钮');
  await ai('点击不使用吸管、点击冰沙推荐、点击正常冰推荐');
  await ai('向下滚动一屏');
  await ai('点击标准甜、点击绿妍（推荐）、点击标准口味');
  await ai('滚动到最下面');
  await ai('点击选好了按钮');
  await ai('点击右上角商品图标按钮');

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
  expect(cardDetail.productName).toContain('多肉葡萄');
  expect(cardDetail.productDescription).toContain('绿妍');

  console.log('商品订单详情：', {
    productName: cardDetail.productName,
    productPrice: cardDetail.productPrice,
    productDescription: cardDetail.productDescription,
  });
});
