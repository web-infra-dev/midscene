/**
 * E2E coverage for Chrome extension Playground execution in dark mode.
 *
 * This stays separate from the TodoMVC Playground test so its search fixture
 * and forced system color scheme cannot alter the existing smoke flow.
 */
import { once } from 'node:events';
import { readFileSync } from 'node:fs';
import { type Server, createServer } from 'node:http';
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { afterAll, beforeAll, describe, expect, it, rs } from '@rstest/core';
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

describe('chrome extension dark Playground timeline', () => {
  let agent: ComputerAgent;
  let extId: string;
  let server: Server;
  let searchUrl: string;
  const extensionPath = path.resolve(
    __dirname,
    '../../../../apps/chrome-extension/dist',
  );

  beforeAll(async () => {
    const html = readFileSync(
      path.join(__dirname, 'fixtures/search.html'),
      'utf8',
    );
    server = createServer((_request, response) => {
      response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      response.end(html);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') {
      throw new Error('Search fixture server did not bind a TCP port');
    }
    searchUrl = `http://127.0.0.1:${address.port}/`;

    agent = await agentFromComputer({
      aiActionContext:
        'Chrome browser with Midscene.js extension loaded in dark mode. The target page is Search Demo. The extension side panel is on the right side. The main page content is on the left.',
    });
    await launchChromeWithExtension(extensionPath, searchUrl, {
      forceDarkMode: true,
    });
    extId = await readExtensionId();
    console.log('Extension ID:', extId);
  });

  afterAll(async () => {
    if (server?.listening) {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      });
    }
  });

  async function focusSearchPage(): Promise<void> {
    const target = await findPageTargetByUrlPrefix(searchUrl);
    if (!target?.webSocketDebuggerUrl) {
      throw new Error('Search Demo page target not found');
    }
    await bringPageToFront(target.webSocketDebuggerUrl);
    await sleep(1500);
  }

  // Keep setup separate so the Search Demo execution and visual assertion receive
  // their own test timeout budget.
  it('opens the dark side panel and configures the extension', async () => {
    await openExtensionSidePanel(agent, extId);
    await agent.aiAssert(
      'The browser shows a dark side panel on the right side containing Midscene Playground UI, and the Search Demo page is still visible on the left',
    );

    await injectExtensionConfig(extId);
    const extensionTarget = await findExtensionPageTarget(extId);
    if (extensionTarget?.webSocketDebuggerUrl) {
      await reloadViaWebSocket(extensionTarget.webSocketDebuggerUrl);
      await sleep(3000);
    }
  });

  it('executes a search and renders a visible dark execution timeline', async () => {
    await agent.aiAct(
      `In ${SIDE_PANEL}, click the Action text input area, select and delete any existing text, then type exactly: Click the Search Demo search field, select and delete any existing text, type "midscene.js", then press Enter`,
    );
    await sleep(500);
    await focusSearchPage();
    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(30000);
    await focusSearchPage();
    await agent.aiWaitFor(
      'The Search Demo page on the left shows search results for "midscene.js"',
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
      visibleProgressCount: number;
    }>(
      extensionTarget.webSocketDebuggerUrl,
      `(async () => {
        const timeline = document.querySelector('.info-list-container');
        if (!timeline) throw new Error('Execution timeline not found');
        const progressItems = Array.from(timeline.querySelectorAll('.list-item')).filter(
          (item) => item.querySelector('.progress-row'),
        );
        if (!progressItems.length) throw new Error('Execution steps not found');
        // The completed report auto-scrolls to its player below the steps.
        // Scroll the list item because .progress-row uses display: contents.
        progressItems[0].scrollIntoView({ block: 'start', behavior: 'instant' });
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

        const timelineRect = timeline.getBoundingClientRect();
        const visibleProgressCount = progressItems.filter((item) => {
          const rect = item.querySelector('.progress-row-copy')?.getBoundingClientRect();
          return rect && rect.width > 0 && rect.height > 0 &&
            rect.top >= Math.max(timelineRect.top, 0) &&
            rect.bottom <= Math.min(timelineRect.bottom, window.innerHeight) &&
            rect.left >= Math.max(timelineRect.left, 0) &&
            rect.right <= Math.min(timelineRect.right, window.innerWidth);
        }).length;
        const connectorItems = progressItems.filter(
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
          visibleProgressCount,
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
    expect(visualState.visibleProgressCount).toBeGreaterThanOrEqual(2);
  });

  it('reveals the completed execution timeline in dark mode', async () => {
    // Completion auto-scrolls the history to Output and Report. Reveal the
    // earlier steps before checking visibility; DOM presence alone is not proof.
    // Keep a separate timeout budget from the model-driven Search Demo execution.
    await agent.aiAct(
      `In ${SIDE_PANEL}, scroll upward within the execution history area above the Action input until multiple completed action steps and their descriptions are visible. Scroll the side-panel history, not the Search Demo results page or the Action text input.`,
    );

    // Keep visual dogfooding after revealing the actual user-visible steps.
    await agent.aiAssert(
      `${SIDE_PANEL} is in dark mode and shows a Playground execution timeline with multiple visible action steps and descriptions`,
    );
  });
});
