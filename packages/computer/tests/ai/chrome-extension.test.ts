import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, it, vi } from 'vitest';
import { type ComputerAgent, agentFromComputer } from '../../src';
import {
  findExtensionPageTarget,
  injectExtensionConfig,
  launchChromeWithExtension,
  readExtensionId,
  reloadViaWebSocket,
} from './chrome-extension-helpers';

vi.setConfig({ testTimeout: 360 * 1000 });

const SIDE_PANEL =
  'the Midscene side panel on the right side of the browser window';

describe('chrome extension smoke test', () => {
  let agent: ComputerAgent;
  let extId: string;
  const extensionPath = path.resolve(
    __dirname,
    '../../../../apps/chrome-extension/dist',
  );

  beforeAll(async () => {
    agent = await agentFromComputer({
      aiActionContext:
        'Chrome browser with Midscene.js extension loaded. The target page is a TodoMVC app. The extension side panel is on the right side. The main page content is on the left.',
    });
    await launchChromeWithExtension(
      extensionPath,
      'https://todomvc.com/examples/react/dist/',
    );
    extId = await readExtensionId();
    console.log('Extension ID:', extId);
  });

  // ── 1. Side Panel Launch ──────────────────────────────────────────────

  it('open side panel via extension icon', async () => {
    await agent.aiAct(
      'Click the puzzle piece icon (Extensions button) in the top-right area of the Chrome toolbar',
    );
    await sleep(1000);

    await agent.aiAct('Click "Midscene.js" in the extensions dropdown list');
    await sleep(3000);

    await agent.aiAssert(
      'The browser shows a side panel on the right side containing Midscene or Playground UI, and the TodoMVC page is still visible on the left',
    );

    // Inject env config into the side panel's localStorage via CDP
    await injectExtensionConfig(extId);
    const target = await findExtensionPageTarget(extId);
    if (target?.webSocketDebuggerUrl) {
      await reloadViaWebSocket(target.webSocketDebuggerUrl);
      await sleep(3000);
    }
  });

  // ── 2. Playground UI Elements ───────────────────────────────────────

  it('playground: UI elements are rendered correctly', async () => {
    await agent.aiAssert(
      `${SIDE_PANEL} shows: (1) action type buttons like "aiAct" and "aiQuery", (2) a text input area with a "Run" button, (3) a gear/settings icon`,
    );
  });

  // ── 3. Action Type Switching ──────────────────────────────────────────

  it('playground: action type switching changes placeholder', async () => {
    await agent.aiAct(`Click the "aiQuery" button in ${SIDE_PANEL}`);
    await sleep(500);
    await agent.aiAssert(
      `${SIDE_PANEL} shows an input area with placeholder text containing "query"`,
    );

    await agent.aiAct(`Click the "aiAssert" button in ${SIDE_PANEL}`);
    await sleep(500);
    await agent.aiAssert(
      `${SIDE_PANEL} shows an input area with placeholder text containing "assert"`,
    );

    // Switch back to aiAct for the next test
    await agent.aiAct(`Click the "aiAct" button in ${SIDE_PANEL}`);
    await sleep(500);
  });

  // ── 4. Run aiAct Task ─────────────────────────────────────────────────

  it('playground: run aiAct to add a todo item', async () => {
    await agent.aiAct(
      `In ${SIDE_PANEL}, click the text input area and type: Enter "Learn JS today" in the task box, then press Enter`,
    );
    await sleep(500);

    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(20000);

    await agent.aiAssert(
      'The TodoMVC page on the left shows a todo item containing "Learn JS today" OR the side panel shows execution progress/result',
    );
  });

  // ── 5. Mode Switching ──────────────────────────────────────────────────

  it('mode switching: switch to Bridge and back', async () => {
    await agent.aiAct(
      `Click the menu icon (hamburger or three-line icon) at the top-left of ${SIDE_PANEL}`,
    );
    await sleep(1000);
    await agent.aiAct('Click "Bridge Mode" or "Bridge" in the dropdown menu');
    await sleep(2000);
    await agent.aiAssert(
      `${SIDE_PANEL} shows Bridge mode UI with connection status like "Listening" or "Disconnected"`,
    );

    await agent.aiAct(
      `Click the menu icon (hamburger or three-line icon) at the top-left of ${SIDE_PANEL}`,
    );
    await sleep(1000);
    await agent.aiAct('Click "Playground" in the dropdown menu');
    await sleep(2000);
  });

  // ── 6. Settings Modal ─────────────────────────────────────────────────

  it('settings: open and close env config modal', async () => {
    await agent.aiAct(
      `Click the gear or settings icon in the top area of ${SIDE_PANEL}`,
    );
    await sleep(1000);

    await agent.aiAssert(
      'A modal or dialog is visible with title containing "Config" or "Env" and a text area for environment variable configuration',
    );

    await agent.aiAct(
      'Click the "Cancel" button or the close button (X) on the modal',
    );
    await sleep(1000);

    await agent.aiAssert(
      `The modal is closed and ${SIDE_PANEL} is visible with Playground UI`,
    );
  });
});
