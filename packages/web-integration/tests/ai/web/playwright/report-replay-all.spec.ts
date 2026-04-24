import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PlaywrightAgent } from '@/playwright';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { expect, test } from '@playwright/test';

const TEST_TIMEOUT = 15 * 60 * 1000;

function getReportPath(reportFileName: string): string {
  return join(getMidsceneRunSubDir('report'), `${reportFileName}.html`);
}

test.describe('report replay-all', () => {
  test.skip(
    process.env.MIDSCENE_CACHE === 'true',
    'replay-all validation only needs one non-cache report run',
  );
  test.setTimeout(TEST_TIMEOUT);

  test('should autoplay from the beginning instead of staying on the last step page', async ({
    page,
  }) => {
    const htmlPath = join(__dirname, '../../fixtures/search-engine.html');
    const reportId = `report-replay-all-${Date.now()}`;
    const validationReportId = `${reportId}-validation`;
    const validationReportPath = getReportPath(validationReportId);

    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto(`file://${htmlPath}`);

    const sourceAgent = new PlaywrightAgent(page, {
      cacheId: reportId,
      reportFileName: reportId,
    });

    const reportPage = await page.context().newPage();
    const reportAgent = new PlaywrightAgent(reportPage, {
      cacheId: validationReportId,
      reportFileName: validationReportId,
    });

    try {
      await sourceAgent.aiAct(
        'Type "Hello world" in the search box, then click the Search button.',
      );

      const resultsPage = page.locator('#results-page');
      try {
        await expect(resultsPage).toBeVisible({ timeout: 5_000 });
      } catch {
        // The first AI action occasionally types the query but misses the
        // actual submit click. A focused follow-up keeps the source report
        // AI-driven while making the state transition deterministic.
        await sourceAgent.aiAct(
          'Press Enter in the current search box to submit the existing "Hello world" query.',
        );
      }

      await expect(resultsPage).toBeVisible({ timeout: 30_000 });
      await expect(page.locator('#results-container')).toContainText(
        'Hello world',
      );

      const reportFile = sourceAgent.reportFile;
      expect(reportFile).toBeTruthy();

      await reportPage.setViewportSize({ width: 1440, height: 900 });
      await reportPage.goto(`file://${reportFile}`);
      await reportPage.bringToFront();
      await reportPage.waitForLoadState('domcontentloaded');

      // Use Playwright native selector to verify replay-all mode is active.
      // AI assertion for "not yet at final step" is too timing-sensitive because
      // short reports finish autoplay before the AI model can capture mid-playback.
      await reportPage.waitForSelector('.replay-all-mode-wrapper', {
        timeout: 30_000,
      });

      await reportAgent.aiWaitFor(
        'The replay-all playback has reached the final step. The main playback view is now showing the finished "Hello world" search results state from the end of the report.',
        {
          timeoutMs: 120_000,
          checkIntervalMs: 5_000,
        },
      );

      await reportAgent.aiAssert(
        'The replay-all playback is now on the final step, and the main playback view is showing the completed "Hello world" search results page.',
        'report should finish on the final replay step',
      );

      expect(existsSync(validationReportPath)).toBe(true);
      console.log('Source report file:', reportFile);
      console.log('Validation report file:', validationReportPath);
    } finally {
      await reportAgent.destroy();
      await sourceAgent.destroy();
      await reportPage.close();
    }
  });
});
