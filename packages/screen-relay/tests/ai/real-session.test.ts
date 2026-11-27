import { readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_FAMILY,
  MIDSCENE_MODEL_NAME,
  MIDSCENE_MODEL_RETRY_COUNT,
  MIDSCENE_MODEL_TIMEOUT,
} from '@midscene/shared/env';
import { afterEach, describe, expect, it } from '@rstest/core';
import {
  MIDSCENE_SCREEN_RELAY_TOKEN,
  MIDSCENE_SCREEN_RELAY_URL,
  ScreenRelayAgent,
  ScreenRelayDevice,
  parseScreenRelayTarget,
  readPngDimensions,
} from '../../src';
import {
  type RunningDesktopFixture,
  sleep,
  startDesktopFixture,
  waitFor,
} from './fixture-harness';

const REPORT_FILE_NAME = 'screen-relay-ci-e2e';

function locateAt(center: [number, number], prompt: string) {
  return {
    prompt,
    locatedPixelResult: { center },
  };
}

describe('screen-relay deterministic desktop protocol', () => {
  let fixture: RunningDesktopFixture | undefined;

  afterEach(async () => {
    await fixture?.stop();
    fixture = undefined;
  });

  it('rejects an invalid session token when token authentication is enabled', async () => {
    const rawUrl = process.env[MIDSCENE_SCREEN_RELAY_URL];
    if (!rawUrl) {
      throw new Error(
        `Set ${MIDSCENE_SCREEN_RELAY_URL} to run screen-relay tests.`,
      );
    }

    const { url, token } = parseScreenRelayTarget({
      url: rawUrl,
      token: process.env[MIDSCENE_SCREEN_RELAY_TOKEN],
    });
    if (!token) {
      if (process.env.CI) {
        throw new Error(
          `Set ${MIDSCENE_SCREEN_RELAY_TOKEN} (or embed #token= in ${MIDSCENE_SCREEN_RELAY_URL}) in CI.`,
        );
      }
      return;
    }

    const wrongToken = token.startsWith('0')
      ? `1${token.slice(1)}`
      : `0${token.slice(1)}`;
    const device = new ScreenRelayDevice({ url, token: wrongToken });
    try {
      await expect(device.connect()).rejects.toThrow(/unauthorized/);
    } finally {
      await device.destroy();
    }
  });

  it('delivers real DOM events, updates screenshots, holds /control drag, and generates a Midscene report with 0 model calls', async () => {
    const url = process.env[MIDSCENE_SCREEN_RELAY_URL];
    const token = process.env[MIDSCENE_SCREEN_RELAY_TOKEN];
    if (!url) {
      throw new Error(
        `Set ${MIDSCENE_SCREEN_RELAY_URL} to run screen-relay tests.`,
      );
    }

    const runDir = path.resolve(process.env.MIDSCENE_RUN_DIR || 'midscene_run');
    const reportFile = path.join(runDir, 'report', `${REPORT_FILE_NAME}.html`);
    await rm(reportFile, { force: true });

    const device = new ScreenRelayDevice({ url, token });
    let agent: ScreenRelayAgent | undefined;

    try {
      const caps = await device.connect();
      const size = await device.size();
      expect(size.width).toBeGreaterThan(0);
      expect(size.height).toBeGreaterThan(0);

      fixture = await startDesktopFixture(size);
      const { events, targets } = fixture;

      agent = new ScreenRelayAgent(device, {
        modelConfig: {
          [MIDSCENE_MODEL_NAME]: 'screen-relay-ci-model-must-not-run',
          [MIDSCENE_MODEL_API_KEY]: 'screen-relay-ci-unused-key',
          [MIDSCENE_MODEL_BASE_URL]: 'http://127.0.0.1:1/v1',
          [MIDSCENE_MODEL_FAMILY]: 'qwen3-vl',
          [MIDSCENE_MODEL_TIMEOUT]: '1000',
          [MIDSCENE_MODEL_RETRY_COUNT]: '0',
        },
        groupName: 'Screen Relay CI E2E',
        groupDescription: `Deterministic desktop E2E via screen-relay (${caps.backend}, ${size.width}x${size.height})`,
        generateReport: true,
        reportFileName: REPORT_FILE_NAME,
        waitAfterAction: 150,
      });

      const captureChangedScreenshot = async (
        previous: string | undefined,
        title: string,
        content: string,
      ): Promise<string> => {
        let latest = '';
        const deadline = Date.now() + 5_000;
        while (Date.now() < deadline) {
          latest = await device.screenshotBase64();
          if (!previous || latest !== previous) break;
          await sleep(150);
        }
        expect(latest.startsWith('data:image/png;base64,')).toBe(true);
        const pngBytes = Buffer.from(
          latest.slice('data:image/png;base64,'.length),
          'base64',
        );
        expect(readPngDimensions(pngBytes)).toEqual(size);
        if (previous) {
          expect(latest).not.toBe(previous);
        }
        await agent!.recordToReport(title, {
          screenshotBase64: latest,
          content,
        });
        return latest;
      };

      let lastFrame = await captureChangedScreenshot(
        undefined,
        'Initial fixture loaded',
        'Fullscreen Chromium fixture rendered on screen-relay virtual display.',
      );

      // 1. Replace text input (ASCII)
      await agent.callActionInActionSpace('Input', {
        value: 'hello-relay',
        mode: 'replace',
        locate: locateAt(targets.input, 'the text input field'),
      });
      await waitFor(
        () =>
          events.some((e) => e.type === 'input' && e.value === 'hello-relay'),
        'ASCII text input event',
      );
      lastFrame = await captureChangedScreenshot(
        lastFrame,
        'ASCII Input (replace)',
        'Replaced initial input value with hello-relay.',
      );

      // 2. Chinese text input + Enter key
      await agent.callActionInActionSpace('Input', {
        value: '北京天气',
        mode: 'replace',
        locate: locateAt(targets.input, 'the text input field'),
      });
      await waitFor(
        () => events.some((e) => e.type === 'input' && e.value === '北京天气'),
        'Chinese text input event',
      );
      await agent.callActionInActionSpace('KeyboardPress', {
        keyName: 'Enter',
      });
      await waitFor(
        () => events.some((e) => e.type === 'enter' && e.value === '北京天气'),
        'Enter keydown event',
      );
      lastFrame = await captureChangedScreenshot(
        lastFrame,
        'Chinese Input + Enter',
        'Entered Chinese text and confirmed Enter key event.',
      );

      // 3. Hover
      await agent.callActionInActionSpace('Hover', {
        locate: locateAt(targets.hover, 'the hover target box'),
      });
      await waitFor(
        () => events.some((e) => e.type === 'hover'),
        'hover event',
      );
      lastFrame = await captureChangedScreenshot(
        lastFrame,
        'Pointer Hover',
        'Hovered over the target box without clicking.',
      );

      // 4. DoubleClick
      await agent.callActionInActionSpace('DoubleClick', {
        locate: locateAt(targets.dblclick, 'the double-click target box'),
      });
      await waitFor(
        () => events.some((e) => e.type === 'dblclick'),
        'dblclick event',
      );
      lastFrame = await captureChangedScreenshot(
        lastFrame,
        'Double Click',
        'Delivered double-click to target box.',
      );

      // 5. RightClick
      await agent.callActionInActionSpace('RightClick', {
        locate: locateAt(targets.rightclick, 'the right-click target box'),
      });
      await waitFor(
        () => events.some((e) => e.type === 'rightclick'),
        'rightclick event',
      );
      lastFrame = await captureChangedScreenshot(
        lastFrame,
        'Right Click',
        'Delivered contextmenu right-click to target box.',
      );

      // 6. Vertical + Horizontal Scroll
      await agent.callActionInActionSpace('Scroll', {
        scrollType: 'singleAction',
        direction: 'down',
        distance: 360,
        locate: locateAt(targets.scroll, 'the scrollable area'),
      });
      await waitFor(
        () => events.some((e) => e.type === 'scroll' && (e.scrollTop ?? 0) > 0),
        'vertical scroll event',
      );
      await agent.callActionInActionSpace('Scroll', {
        scrollType: 'scrollToRight',
        locate: locateAt(targets.scroll, 'the scrollable area'),
      });
      await waitFor(
        () =>
          events.some((e) => e.type === 'scroll' && (e.scrollLeft ?? 0) > 0),
        'horizontal scroll event',
      );
      lastFrame = await captureChangedScreenshot(
        lastFrame,
        'Vertical & Horizontal Scroll',
        'Scrolled scrollable container vertically and horizontally.',
      );

      // 7. DragAndDrop over stateful /control WebSocket session
      await agent.callActionInActionSpace('DragAndDrop', {
        from: locateAt(targets.dragSource, 'the drag source'),
        to: locateAt(targets.dropTarget, 'the drop target'),
      });
      await waitFor(
        () =>
          events.some((e) => e.type === 'dropped') ||
          events.some((e) => e.type === 'drop-missed') ||
          events.some((e) => e.type === 'drag-lost-button'),
        'drag completion event',
      );
      const eventTypes = events.map((e) => e.type);
      expect(eventTypes).toContain('drag-started');
      expect(eventTypes).toContain('target-held');
      expect(eventTypes).toContain('dropped');
      expect(eventTypes).not.toContain('drag-lost-button');
      expect(eventTypes).not.toContain('drop-missed');

      await captureChangedScreenshot(
        lastFrame,
        'Drag and Drop over /control WebSocket',
        'Held primary mouse button across motion from drag source to drop target.',
      );

      expect(agent.metrics.calls).toBe(0);

      await agent.destroy();
      const destroyedAgent = agent;
      agent = undefined;

      expect(destroyedAgent.reportFile).toBe(reportFile);
      const reportHtml = await readFile(reportFile, 'utf8');
      expect(reportHtml).toContain('<script type="midscene_web_dump"');
      expect(reportHtml).not.toContain('REPLACE_ME_WITH_REPORT_HTML');
      for (const title of [
        'Initial fixture loaded',
        'ASCII Input (replace)',
        'Chinese Input + Enter',
        'Pointer Hover',
        'Double Click',
        'Right Click',
        'Vertical & Horizontal Scroll',
        'Drag and Drop over /control WebSocket',
      ]) {
        expect(reportHtml).toContain(title);
      }
    } finally {
      if (agent) {
        await agent.destroy();
      } else {
        await device.destroy();
      }
    }
  });
});
