/**
 * E2E coverage for Chrome extension Playground execution in dark mode.
 *
 * This stays separate from the TodoMVC Playground test so its Bing fixture
 * and forced system color scheme cannot alter the existing smoke flow.
 */
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, expect, it, rs } from '@rstest/core';
import { type ComputerAgent, agentFromComputer } from '../../src';
import {
  bringPageToFront,
  evaluateViaWebSocket,
  findExtensionPageTarget,
  findPageTargetByUrlPrefix,
  injectExtensionConfig,
  launchChromeWithExtension,
  openExtensionSidePanel,
  readExtensionId,
  reloadViaWebSocket,
} from './chrome-extension-helpers';

rs.setConfig({ testTimeout: 600 * 1000 });

const SIDE_PANEL =
  'the Midscene side panel on the right side of the browser window';
const BING_URL_PREFIX = 'https://www.bing.com/';

describe('chrome extension dark Playground timeline', () => {
  let agent: ComputerAgent;
  let extId: string;
  const extensionPath = path.resolve(
    __dirname,
    '../../../../apps/chrome-extension/dist',
  );

  beforeAll(async () => {
    agent = await agentFromComputer({
      aiActionContext:
        'Chrome browser with Midscene.js extension loaded in dark mode. The target page is Bing. The extension side panel is on the right side. The main page content is on the left.',
    });
    await launchChromeWithExtension(extensionPath, BING_URL_PREFIX, {
      forceDarkMode: true,
    });
    extId = await readExtensionId();
    console.log('Extension ID:', extId);
  });

  async function focusBingPage(): Promise<void> {
    const target = await findPageTargetByUrlPrefix(BING_URL_PREFIX);
    if (!target?.webSocketDebuggerUrl) {
      throw new Error('Bing page target not found');
    }
    await bringPageToFront(target.webSocketDebuggerUrl);
    await sleep(1500);
  }

  // Keep setup separate so the Bing execution and visual assertion receive
  // their own test timeout budget.
  it('opens the dark side panel and configures the extension', async () => {
    await openExtensionSidePanel(agent, extId);
    await agent.aiAssert(
      'The browser shows a dark side panel on the right side containing Midscene Playground UI, and the Bing page is still visible on the left',
    );

    await injectExtensionConfig(extId);
    const extensionTarget = await findExtensionPageTarget(extId);
    if (extensionTarget?.webSocketDebuggerUrl) {
      await reloadViaWebSocket(extensionTarget.webSocketDebuggerUrl);
      await sleep(3000);
    }
  });

  it('executes a Bing search and renders a visible dark execution timeline', async () => {
    await agent.aiAct(
      `In ${SIDE_PANEL}, click the Action text input area, select and delete any existing text, then type exactly: Click the Bing search field, select and delete any existing text, type "midscene.js", then press Enter`,
    );
    await sleep(500);
    await focusBingPage();
    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(30000);
    await focusBingPage();
    await agent.aiWaitFor(
      'The Bing page on the left shows search results for "midscene.js"',
      { timeoutMs: 180000, checkIntervalMs: 10000 },
    );
    const extensionTarget = await findExtensionPageTarget(extId);
    if (!extensionTarget?.webSocketDebuggerUrl) {
      throw new Error('Extension side-panel target not found');
    }

    const visualState = await evaluateViaWebSocket<{
      connectorColors: string[];
      connectorCount: number;
      connectorHeights: number[];
      clearButtonInsideViewport: boolean;
    }>(
      extensionTarget.webSocketDebuggerUrl,
      `(() => {
        const connectorItems = Array.from(document.querySelectorAll('.list-item')).filter(
          (item) => item.querySelector('.progress-row:not(.progress-row-last)'),
        );
        const connectorColors = Array.from(
          new Set(
            connectorItems.map(
              (item) => getComputedStyle(item, '::after').backgroundColor,
            ),
          ),
        );
        const connectorHeights = connectorItems.map((item) => {
          const style = getComputedStyle(item, '::after');
          const rect = item.getBoundingClientRect();
          return rect.height - parseFloat(style.top) - parseFloat(style.bottom);
        });
        const clearButton = document.querySelector('.clear-button');
        const clearRect = clearButton?.getBoundingClientRect();
        return {
          connectorColors,
          connectorCount: connectorItems.length,
          connectorHeights,
          clearButtonInsideViewport: Boolean(
            clearRect &&
              clearRect.left >= 0 &&
              clearRect.right <= window.innerWidth &&
              clearRect.top >= 0 &&
              clearRect.bottom <= window.innerHeight
          ),
        };
      })()`,
    );

    expect(visualState.connectorCount).toBeGreaterThan(2);
    expect(visualState.connectorColors).toEqual(['rgb(217, 217, 217)']);
    expect(Math.min(...visualState.connectorHeights)).toBeGreaterThan(0);
    expect(visualState.clearButtonInsideViewport).toBe(true);

    // Keep visual dogfooding for the user-visible result. Fine-grained 2px
    // color and clipping checks above use the browser's computed geometry so
    // they do not become false negatives when the full-screen image is scaled.
    await agent.aiAssert(
      `${SIDE_PANEL} is in dark mode and shows a Playground execution timeline with multiple visible action steps and descriptions`,
    );
  });
});
