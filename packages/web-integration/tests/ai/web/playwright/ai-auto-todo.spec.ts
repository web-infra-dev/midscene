import { expect } from 'playwright/test';
import { test } from './fixture';

test.beforeEach(async ({ page }) => {
  await page.goto('http://127.0.0.1:8081/xss.html');
});

const CACHE_TIME_OUT = process.env.MIDSCENE_CACHE;

test.describe('ai todo describe', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('http://127.0.0.1:8081/xss.html');
  });

  test('ai todo', async ({ ai, aiAction }) => {
    await aiAction(
      `点击第二行标题 "<script>setTimeout(() =>; { alert('1'); }, 15000);</script>" 标题`,
    );
  });
});
