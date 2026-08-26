/**
 * E2E coverage for Chrome extension Playground execution in dark mode.
 *
 * This stays separate from the TodoMVC Playground test so its Bing fixture
 * and forced system color scheme cannot alter the existing smoke flow.
 */
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, it, rs } from '@rstest/core';
import { type ComputerAgent, agentFromComputer } from '../../src';
import {
  bringPageToFront,
  findExtensionPageTarget,
  findPageTargetByUrlPrefix,
  injectExtensionConfig,
  launchChromeWithExtension,
  openExtensionSidePanel,
  readExtensionId,
  reloadViaWebSocket,
} from './chrome-extension-helpers';

rs.setConfig({ testTimeout: 900 * 1000 });

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
    await openExtensionSidePanel(agent);
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
      `In ${SIDE_PANEL}, click the "Action" button, then click the text input area and type: Click the Bing search field, type "midscene.js", then press Enter`,
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
    await agent.aiWaitFor(
      `${SIDE_PANEL} shows that the Playground execution has finished: there is no blue loading spinner in the timeline and the bottom action control no longer says "Stop"`,
      { timeoutMs: 240000, checkIntervalMs: 10000 },
    );
    await agent.aiAssert(
      `${SIDE_PANEL} is in dark mode and shows completed Playground timeline rows with green check icons and readable descriptions. For the completed rows that are currently visible, a thin light-gray vertical connector extends from each check icon toward the next row. Judge only the action types shown; exact step names may vary. Small gaps where status icons cover the connector are expected, and the line may be thin or medium gray rather than pure white. The full trash-can glyph and its rounded control in the top-right are visible; being close to the panel edge is acceptable when no part is cut off.`,
    );
  });
});
