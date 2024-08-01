import { expect } from '@playwright/test';
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  page.setViewportSize({ width: 400, height: 905 });
  await page.goto('https://www.ebay.com');
  await page.waitForLoadState('networkidle');
});

test('search headphone on ebay', async ({ ai, aiQuery }) => {
  // 👀 perform a search
  await ai('type "Headphones" in search box, hit Enter');

  // 👀 find the items
  const items = await aiQuery(
    '{itemTitle: string, price: Number}[], find item in list and corresponding price',
  );

  console.log('headphones in stock', items);

  expect(items?.length).toBeGreaterThan(1);
});
