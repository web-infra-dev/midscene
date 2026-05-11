import { PuppeteerAgent } from '@/puppeteer';
import type { Page } from 'puppeteer';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TEST_TIMEOUT,
  createTestContext,
  getFixturePath,
} from './test-utils';
import { launchPage } from './utils';

const FIXTURE_URL = `file://${getFixturePath('select-scroll-bottom.html')}`;
const TARGET_OPTION = 'Zone 12 - Quartz Hill';

async function waitForSelectFixtureReady(originPage: Page) {
  await originPage.waitForSelector('#delivery-zone-trigger', {
    timeout: 30 * 1000,
  });
  await originPage.waitForSelector('#selection-result', {
    timeout: 30 * 1000,
  });
  await originPage.waitForFunction(
    () => document.querySelectorAll('#options-panel .option').length > 0,
    { timeout: 30 * 1000 },
  );
}

describe(
  'Scrollable Select capability',
  () => {
    const ctx = createTestContext();

    it('should open the only select and choose Zone 12 - Quartz Hill', async () => {
      const { originPage, reset } = await launchPage(FIXTURE_URL, {
        viewport: {
          width: 1440,
          height: 1200,
          deviceScaleFactor: 1,
        },
      });
      ctx.resetFn = reset;

      await waitForSelectFixtureReady(originPage);
      ctx.agent = new PuppeteerAgent(originPage, {
        cache: false,
      });

      await ctx.agent.aiAct(
        'Open the only select on the page, choose "Zone 12 - Quartz Hill", and return only the selected option text.',
      );

      const triggerText = await originPage.$eval(
        '#trigger-text',
        (element) => element.textContent?.trim() || '',
      );
      const selectionResult = await originPage.$eval(
        '#selection-result',
        (element) => element.textContent?.trim() || '',
      );

      expect(triggerText).toBe(TARGET_OPTION);
      expect(selectionResult).toContain(TARGET_OPTION);
    });
  },
  DEFAULT_TEST_TIMEOUT,
);
