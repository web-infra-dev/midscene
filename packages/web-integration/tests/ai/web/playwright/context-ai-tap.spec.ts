import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect } from '@playwright/test';
import { test } from './fixture';

test('AI methods use per-call context', async ({ agentForPage, page }) => {
  const fixtureDir = path.resolve(__dirname, '__fixtures__/context-ai-tap');
  await page.goto(pathToFileURL(path.join(fixtureDir, 'index.html')).href);

  const agent = await agentForPage(page);
  await agent.aiTap("Click Tom's favorite fruit", {
    context: "Tom's favorite fruit is orange.",
  });
  await agent.aiAssert(
    "The selected fruit is Tom's favorite fruit",
    undefined,
    {
      context: "Tom's favorite fruit is orange.",
    },
  );

  await expect(page.locator('body')).toHaveAttribute(
    'data-selected-fruit',
    'orange',
  );
  await expect(page.locator('#result')).toHaveText('Selected: orange');
});
