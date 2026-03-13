import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PlaywrightAgent } from '@/playwright';
import { sleep } from '@midscene/core/utils';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { expect, test } from '@playwright/test';

const REPLAY_ALL_SELECTOR = '.replay-all-mode-wrapper';
const TIME_DISPLAY_SELECTOR = `${REPLAY_ALL_SELECTOR} .time-display`;
const PLAYBACK_ADVANCE_TIMEOUT = 30_000;
const PLAYBACK_COMPLETE_TIMEOUT = 90_000;
const PLAYBACK_POLL_INTERVAL = 500;
const TEST_TIMEOUT = 15 * 60 * 1000;

function parseTimeText(text: string): number {
  const [minuteText, secondText] = text.trim().split(':');
  const minutes = Number(minuteText);
  const seconds = Number(secondText);

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    throw new Error(`Unexpected playback time text: ${text}`);
  }

  return minutes * 60 + seconds;
}

function parsePlaybackTime(timeText: string): {
  currentSeconds: number;
  totalSeconds: number;
} {
  const [currentTimeText = '', totalTimeText = ''] = timeText.split('/');

  return {
    currentSeconds: parseTimeText(currentTimeText),
    totalSeconds: parseTimeText(totalTimeText),
  };
}

function getReportPath(reportFileName: string): string {
  return join(getMidsceneRunSubDir('report'), `${reportFileName}.html`);
}

async function waitForPlaybackToAdvance(
  readCurrentSeconds: () => Promise<number>,
  previousSeconds: number,
): Promise<number> {
  const startTime = Date.now();

  while (Date.now() - startTime < PLAYBACK_ADVANCE_TIMEOUT) {
    const currentSeconds = await readCurrentSeconds();
    if (currentSeconds > previousSeconds) {
      return currentSeconds;
    }
    await sleep(PLAYBACK_POLL_INTERVAL);
  }

  throw new Error(
    `Replay time did not advance within ${PLAYBACK_ADVANCE_TIMEOUT}ms`,
  );
}

async function waitForPlaybackToReach(
  readCurrentSeconds: () => Promise<number>,
  targetSeconds: number,
  timeoutMs: number,
): Promise<number> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    const currentSeconds = await readCurrentSeconds();
    if (currentSeconds >= targetSeconds) {
      return currentSeconds;
    }
    await sleep(PLAYBACK_POLL_INTERVAL);
  }

  throw new Error(
    `Replay time did not reach ${targetSeconds}s within ${timeoutMs}ms`,
  );
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
      await reportPage.waitForFunction(
        () => document.visibilityState === 'visible',
        {
          timeout: 30_000,
        },
      );
      await reportPage.waitForSelector(REPLAY_ALL_SELECTOR, {
        timeout: 30_000,
      });
      await reportPage.waitForSelector(TIME_DISPLAY_SELECTOR, {
        timeout: 30_000,
      });

      await reportAgent.aiAssert(
        'Only inspect the large replay player in the main content area. It is showing the initial search page with a centered large search box. It is not staying on the final "Hello world" search results page.',
      );

      const initialTimeText = await reportPage
        .locator(TIME_DISPLAY_SELECTOR)
        .innerText();
      const { currentSeconds: initialSeconds, totalSeconds } =
        parsePlaybackTime(initialTimeText.trim());
      const completionTimeoutMs = Math.max(
        PLAYBACK_COMPLETE_TIMEOUT,
        (totalSeconds + 5) * 5_000,
      );

      const advancedSeconds = await waitForPlaybackToAdvance(async () => {
        const timeText = await reportPage
          .locator(TIME_DISPLAY_SELECTOR)
          .innerText();
        return parsePlaybackTime(timeText.trim()).currentSeconds;
      }, initialSeconds);

      await waitForPlaybackToReach(
        async () => {
          const timeText = await reportPage
            .locator(TIME_DISPLAY_SELECTOR)
            .innerText();
          return parsePlaybackTime(timeText.trim()).currentSeconds;
        },
        Math.max(advancedSeconds + 1, totalSeconds),
        completionTimeoutMs,
      );

      await sleep(1_000);

      await reportAgent.aiAssert(
        'Only inspect the large replay player in the main content area. It is now showing the final search results page for "Hello world".',
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
