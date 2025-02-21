import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('https://cn.bing.com');
});

const CACHE_TIME_OUT = process.env.MIDSCENE_CACHE;

test('test open new tab', async ({ page, ai, aiAssert, aiQuery }) => {
  if (CACHE_TIME_OUT) {
    test.setTimeout(200 * 1000);
  }
  await ai(
    'type "midscene github" in search box, hit Enter, sleep 5s, and open the github page in result list',
  );
  await aiAssert('the page is "midscene github"');
});
