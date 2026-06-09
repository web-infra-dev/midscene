import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from '@playwright/test';
import { test } from './fixture';

const CACHE_TIME_OUT = process.env.MIDSCENE_CACHE;

test.skip(
  process.env.MIDSCENE_CACHE === 'true',
  'runMarkdown reference-image order is covered by the non-cache e2e run',
);

test('agent.runMarkdown follows Markdown reference image order', async ({
  agentForPage,
  page,
}) => {
  if (CACHE_TIME_OUT) {
    test.setTimeout(200 * 1000);
  }

  const fixtureDir = path.resolve(__dirname, '__fixtures__/image-prompt-order');
  const markdownPath = path.join(fixtureDir, 'fruit-order.md');

  await page.goto(pathToFileURL(path.join(fixtureDir, 'index.html')).href);

  const agent = await agentForPage(page);
  await agent.runMarkdown(markdownPath);

  await expect(page.locator('#result')).toHaveText('已经按照预期顺序点击');
  await expect
    .poll(() => page.evaluate(() => (window as any).clickedSlots))
    .toEqual(['slot-3', 'slot-4', 'slot-1', 'slot-2']);
});
