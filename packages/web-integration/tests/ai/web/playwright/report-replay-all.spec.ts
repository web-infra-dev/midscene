import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { PlaywrightAgent } from '@/playwright';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { type Page, expect, test } from '@playwright/test';

const REPLAY_ALL_SELECTOR = '.replay-all-mode-wrapper';
const TIME_DISPLAY_SELECTOR = `${REPLAY_ALL_SELECTOR} .time-display`;
const TASK_ROW_SELECTOR = '.task-row[data-task-id]';
const PLAYING_TASK_ROW_SELECTOR = `${TASK_ROW_SELECTOR}.playing`;
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

function formatAssertionReport(heading: string, checks: string[]): string {
  return [
    heading,
    '',
    'Assertions passed:',
    ...checks.map((check) => `- ${check}`),
  ].join('\n');
}

async function readReplayState(page: Page) {
  const timeText = (
    await page.locator(TIME_DISPLAY_SELECTOR).innerText()
  ).trim();
  const { currentSeconds, totalSeconds } = parsePlaybackTime(timeText);

  const taskState = await page
    .locator(TASK_ROW_SELECTOR)
    .evaluateAll((rows) => {
      const taskRows = rows as HTMLDivElement[];
      const playingRow =
        taskRows.find((row) => row.classList.contains('playing')) ?? null;
      const lastRow = taskRows.at(-1) ?? null;

      const normalizeText = (row: HTMLDivElement | null) =>
        row?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

      return {
        taskRowCount: taskRows.length,
        playingTaskId: playingRow?.dataset.taskId ?? null,
        playingTaskText: normalizeText(playingRow),
        lastTaskId: lastRow?.dataset.taskId ?? null,
        lastTaskText: normalizeText(lastRow),
      };
    });

  return {
    timeText,
    currentSeconds,
    totalSeconds,
    ...taskState,
  };
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
      await reportPage.waitForSelector(PLAYING_TASK_ROW_SELECTOR, {
        timeout: 30_000,
      });

      const initialState = await readReplayState(reportPage);
      expect(initialState.taskRowCount).toBeGreaterThan(1);
      expect(initialState.totalSeconds).toBeGreaterThan(0);
      expect(initialState.currentSeconds).toBeLessThan(
        initialState.totalSeconds,
      );
      expect(initialState.lastTaskId).toBeTruthy();
      expect(initialState.playingTaskId).toBeTruthy();
      expect(initialState.playingTaskId).not.toBe(initialState.lastTaskId);

      await reportAgent.recordToReport('Report replay-all initial state', {
        content: formatAssertionReport(
          'Replay-all initial-state assertions passed.',
          [
            `expect(taskRowCount).toBeGreaterThan(1) // ${initialState.taskRowCount}`,
            `expect(totalSeconds).toBeGreaterThan(0) // ${initialState.totalSeconds}`,
            `expect(currentSeconds).toBeLessThan(totalSeconds) // ${initialState.currentSeconds} < ${initialState.totalSeconds}`,
            `expect(playingTaskId).not.toBe(lastTaskId) // ${initialState.playingTaskId} !== ${initialState.lastTaskId}`,
            `active task at open: "${initialState.playingTaskText}"`,
            `final task in report: "${initialState.lastTaskText}"`,
            `time display at open: ${initialState.timeText}`,
          ],
        ),
      });

      await reportPage.waitForFunction(
        ({ taskRowSelector, timeDisplaySelector }) => {
          const taskRows = [
            ...document.querySelectorAll<HTMLDivElement>(taskRowSelector),
          ];
          const playingRow =
            taskRows.find((row) => row.classList.contains('playing')) ?? null;
          const lastRow = taskRows.at(-1) ?? null;
          const timeText =
            document
              .querySelector<HTMLElement>(timeDisplaySelector)
              ?.textContent?.trim() ?? '';

          const [currentTimeText = '', totalTimeText = ''] =
            timeText.split('/');
          const parseTime = (value: string) => {
            const [minuteText = '', secondText = ''] = value.trim().split(':');
            const minutes = Number(minuteText);
            const seconds = Number(secondText);
            if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
              return null;
            }
            return minutes * 60 + seconds;
          };

          const currentSeconds = parseTime(currentTimeText);
          const totalSeconds = parseTime(totalTimeText);

          return (
            Boolean(lastRow?.dataset.taskId) &&
            playingRow?.dataset.taskId === lastRow?.dataset.taskId &&
            currentSeconds !== null &&
            totalSeconds !== null &&
            currentSeconds >= totalSeconds - 1
          );
        },
        {
          taskRowSelector: TASK_ROW_SELECTOR,
          timeDisplaySelector: TIME_DISPLAY_SELECTOR,
        },
        { timeout: 120_000 },
      );

      const finalState = await readReplayState(reportPage);
      expect(finalState.playingTaskId).toBe(finalState.lastTaskId);
      expect(finalState.currentSeconds).toBeGreaterThanOrEqual(
        finalState.totalSeconds - 1,
      );

      await reportAgent.recordToReport('Report replay-all final state', {
        content: formatAssertionReport(
          'Replay-all final-state assertions passed.',
          [
            'waitForFunction resolved when the playing row matched the last task row and the time display reached the end.',
            `expect(playingTaskId).toBe(lastTaskId) // ${finalState.playingTaskId} === ${finalState.lastTaskId}`,
            `expect(currentSeconds).toBeGreaterThanOrEqual(totalSeconds - 1) // ${finalState.currentSeconds} >= ${finalState.totalSeconds - 1}`,
            `final active task: "${finalState.lastTaskText}"`,
            `final time display: ${finalState.timeText}`,
          ],
        ),
      });

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
