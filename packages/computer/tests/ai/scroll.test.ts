import { execSync } from 'node:child_process';
import { resolve } from 'node:path';
import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, it, vi } from 'vitest';
import { ComputerAgent, ComputerDevice } from '../../src';

vi.setConfig({
  testTimeout: 360 * 1000,
});

const FIXTURE_URL = `file://${resolve(__dirname, 'fixtures/scroll-page.html')}`;
const TOP_TEXT = 'TOP MARKER — MIDSCENE SCROLL TEST';
const BOTTOM_TEXT = 'BOTTOM MARKER — MIDSCENE SCROLL TEST';

describe.runIf(process.platform === 'darwin')(
  'computer scroll (darwin / Safari fixture)',
  () => {
    let agent: ComputerAgent;

    beforeAll(async () => {
      const device = new ComputerDevice({});
      agent = new ComputerAgent(device, {
        aiActionContext:
          'You are validating scroll behavior inside Safari. Close any popup that appears. Ignore the Safari chrome and assert only against the visible webpage content.',
      });
      await device.connect();

      // Open the fixture page in Safari and give it time to load + fullscreen-ish.
      execSync(`open -a "Safari" "${FIXTURE_URL}"`);
      await sleep(2500);
      await agent.aiAct(
        'Bring the Safari window containing the scroll test fixture to the foreground.',
      );
      await sleep(800);
    });

    it('scrollToBottom reaches the bottom marker', async () => {
      // Start from top so the assertion is meaningful.
      await agent.aiScroll(undefined, {
        scrollType: 'scrollToTop',
      });
      await sleep(600);
      await agent.aiAssert(
        `The header "${TOP_TEXT}" is visible near the top of the viewport.`,
      );

      await agent.aiScroll(undefined, {
        scrollType: 'scrollToBottom',
      });
      await sleep(800);
      await agent.aiAssert(
        `The footer text "${BOTTOM_TEXT}" is visible on screen, confirming the page reached the bottom.`,
      );
    });

    it('scrollToTop returns to the top marker', async () => {
      // Begin from bottom.
      await agent.aiScroll(undefined, {
        scrollType: 'scrollToBottom',
      });
      await sleep(800);

      await agent.aiScroll(undefined, {
        scrollType: 'scrollToTop',
      });
      await sleep(800);
      await agent.aiAssert(
        `The header "${TOP_TEXT}" is visible and the first numbered row (Row 1) is shown.`,
      );
    });

    it('singleAction down moves the viewport by roughly one screen', async () => {
      await agent.aiScroll(undefined, {
        scrollType: 'scrollToTop',
      });
      await sleep(600);

      // One viewport is ~900px; request 900 to aim for a single-screen scroll.
      await agent.aiScroll(undefined, {
        scrollType: 'singleAction',
        direction: 'down',
        distance: 900,
      });
      await sleep(800);

      await agent.aiAssert(
        `The header "${TOP_TEXT}" is NO LONGER visible (scrolled off the top) and the footer "${BOTTOM_TEXT}" is also NOT visible yet — the viewport is showing numbered rows in the middle of the page.`,
      );
    });
  },
);
