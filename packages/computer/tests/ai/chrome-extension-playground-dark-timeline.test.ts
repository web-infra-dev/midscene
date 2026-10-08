/**
 * E2E coverage for Chrome extension Playground execution in dark mode.
 *
 * This stays separate from the TodoMVC Playground test so its search fixture
 * and forced system color scheme cannot alter the existing smoke flow.
 */
import { once } from 'node:events';
import { type Server, createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
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
const searchPageHtml = `<!doctype html>
<html><head><meta charset="utf-8"><title>Timeline Search Fixture</title>
<style>body{font:24px sans-serif;padding:64px;background:#fff;color:#111}input,button{font:inherit;padding:12px}#results{margin-top:40px}</style>
</head><body><h1>Timeline Search</h1>
<form id="search"><label for="query">Search query</label><input id="query" name="query"><button>Search</button></form>
<section id="results" aria-live="polite"></section>
<script>document.querySelector('#search').addEventListener('submit',event=>{
event.preventDefault();document.querySelector('#results').textContent='Search results for: '+document.querySelector('#query').value;
});</script></body></html>`;

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
    server = createServer((_req, res) => {
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end(searchPageHtml);
    });
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    searchUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;
    agent = await agentFromComputer({
      aiActionContext:
        'Chrome browser with Midscene.js extension loaded in dark mode. The target page is Timeline Search. The extension side panel is on the right side. The main page content is on the left.',
    });
    await launchChromeWithExtension(extensionPath, searchUrl, {
      forceDarkMode: true,
    });
    extId = await readExtensionId();
    console.log('Extension ID:', extId);
  });

  afterAll(async () => {
    try {
      await agent?.destroy();
    } finally {
      if (server?.listening) {
        await new Promise<void>((resolve, reject) => {
          server.close((error) => (error ? reject(error) : resolve()));
          server.closeAllConnections();
        });
      }
    }
  });

  async function focusSearchPage(): Promise<void> {
    const target = await findPageTargetByUrlPrefix(searchUrl);
    if (!target?.webSocketDebuggerUrl) {
      throw new Error('Search fixture page target not found');
    }
    await bringPageToFront(target.webSocketDebuggerUrl);
    await sleep(1500);
  }

  // Keep setup separate so execution and visual assertions receive
  // their own test timeout budget.
  it('opens the dark side panel and configures the extension', async () => {
    await openExtensionSidePanel(agent, extId);
    await agent.aiAssert(
      'The browser shows a dark side panel on the right side containing Midscene Playground UI, and the Timeline Search page is still visible on the left',
    );

    await injectExtensionConfig(extId);
    const extensionTarget = await findExtensionPageTarget(extId);
    if (extensionTarget?.webSocketDebuggerUrl) {
      await reloadViaWebSocket(extensionTarget.webSocketDebuggerUrl);
      await sleep(3000);
    }
  });

  it('executes a search and renders a visible dark execution timeline', async () => {
    // A retry must not inherit the previous attempt's running task or form state.
    const extensionTarget = await findExtensionPageTarget(extId);
    const searchTarget = await findPageTargetByUrlPrefix(searchUrl);
    if (
      !extensionTarget?.webSocketDebuggerUrl ||
      !searchTarget?.webSocketDebuggerUrl
    ) {
      throw new Error(
        'Extension side-panel or search fixture target not found',
      );
    }
    await reloadViaWebSocket(extensionTarget.webSocketDebuggerUrl);
    await reloadViaWebSocket(searchTarget.webSocketDebuggerUrl);
    await focusSearchPage();
    await agent.aiWaitFor(
      `${SIDE_PANEL} shows the idle Playground with a Run button`,
      { timeoutMs: 60000 },
    );
    await agent.aiAct(
      `In ${SIDE_PANEL}, replace the Action input with exactly this instruction: "Click the Search query field, type midscene.js, then click the Search button". Only enter the instruction; do not execute it or click Run yet.`,
    );
    await sleep(500);
    await focusSearchPage();
    await agent.aiAct(
      `Click the "Run" button once in ${SIDE_PANEL}. If it changes to Stop, execution has started and this action is complete. Do not click Stop or wait for the task to finish.`,
    );
    await agent.aiWaitFor(
      'The page on the left shows "Search results for: midscene.js", and the Midscene side panel has finished execution and shows Run rather than Stop',
      { timeoutMs: 180000, checkIntervalMs: 10000 },
    );
    await agent.aiAct(
      `Scroll up inside the execution history in ${SIDE_PANEL} until multiple completed action steps and their descriptions are visible. Do not scroll the search page on the left.`,
    );

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
