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
      await sourceAgent.aiAssert(
        'The page is now showing search results about "Hello world".',
      );

      const reportFile = sourceAgent.reportFile;
      expect(reportFile).toBeTruthy();

      await reportPage.setViewportSize({ width: 1440, height: 900 });
      await reportPage.goto(`file://${reportFile}`);
      await reportPage.bringToFront();
      await reportPage.waitForLoadState('domcontentloaded');

      await reportAgent.aiWaitFor(
        'The Midscene report page is fully loaded. There is a left sidebar listing the report steps, and the main area is showing the replay-all player for this report.',
        {
          timeoutMs: 30_000,
          checkIntervalMs: 3_000,
        },
      );

      await reportAgent.aiAssert(
        'This report is currently in replay-all mode, and the playback has started from an earlier step instead of already staying on the final "Hello world" search results step. The main playback view is not yet showing the finished final result state.',
        'report should open before the final replay step',
      );

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
