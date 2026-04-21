import { join } from 'node:path';
import { PlaywrightAgent } from '@/playwright';
import { expect, test } from '@playwright/test';

const TARGET_TEXT = 'abcdefghijklmnopqrstuvwxyz';
const TEST_TIMEOUT = 3 * 60 * 1000;

test.describe('narrow input prompt override', () => {
  test.setTimeout(TEST_TIMEOUT);

  test('should finish long text input within the replanning limit', async ({
    page,
  }) => {
    const htmlPath = join(__dirname, '../../fixtures/narrow-input.html');
    const reportId = `narrow-input-prompt-${Date.now()}`;
    const agent = new PlaywrightAgent(page, {
      cache: false,
      reportFileName: reportId,
      replanningCycleLimit: 5,
    });

    try {
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`file://${htmlPath}`);

      await agent.aiAct(`输入 ${TARGET_TEXT}`);

      await expect(page.locator('#prompt-input')).toHaveValue(TARGET_TEXT);
    } finally {
      await agent.destroy();
    }
  });
});
