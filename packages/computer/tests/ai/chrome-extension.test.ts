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
    // Switch to Bridge Mode with retry - the dropdown menu can be flaky in headless
    const switchToBridge = async () => {
      await agent.aiAct(
        `In ${SIDE_PANEL}, find and click the hamburger menu icon (three horizontal lines "≡") at the top-left corner. It should open a dropdown menu.`,
      );
      await sleep(2000);
      await agent.aiAct(
        'In the dropdown menu that just appeared, click the menu item labeled "Bridge Mode" which has an API icon next to it',
      );
      await sleep(3000);
    };

    // First attempt
    await switchToBridge();

    // Verify or retry once if needed
    try {
      await agent.aiAssert(
        `${SIDE_PANEL} shows Bridge mode UI with text containing "Listening" or "Disconnected" or "Bridge" connection status`,
      );
    } catch {
      // Retry: the dropdown click may not have registered
      console.log('Bridge mode switch failed, retrying...');
      await switchToBridge();
      await agent.aiAssert(
        `${SIDE_PANEL} shows Bridge mode UI with text containing "Listening" or "Disconnected" or "Bridge" connection status`,
      );
    }

    // Switch back to Playground
    await agent.aiAct(
      `In ${SIDE_PANEL}, find and click the hamburger menu icon (three horizontal lines "≡") at the top-left corner`,
    );
    await sleep(2000);
    await agent.aiAct(
      'In the dropdown menu that just appeared, click the menu item labeled "Playground"',
    );
    await sleep(3000);
  });

  // ── 5b. Bridge Mode: stop, change URL, and restart (issue #2119) ─────

  it('bridge mode: stop and restart listening (issue #2119)', async () => {
    // The previous test (case 5) already switched to Bridge and back.
    // Switch to Bridge Mode again with retry.
    const switchToBridgeMode = async () => {
      await agent.aiAct(
        `In ${SIDE_PANEL}, find and click the hamburger menu icon (three horizontal lines "≡") at the top-left corner. It should open a dropdown menu.`,
      );
      await sleep(2000);
      await agent.aiAct(
        'In the dropdown menu that just appeared, click the menu item labeled "Bridge Mode" which has an API icon next to it',
      );
      await sleep(3000);
    };

    await switchToBridgeMode();
    try {
      await agent.aiAssert(
        `${SIDE_PANEL} shows Bridge mode UI with "Bridge Mode" title and a "Stop" button at the bottom`,
      );
    } catch {
      console.log('Bridge mode switch failed, retrying...');
      await switchToBridgeMode();
    }

    // Stop listening
    await agent.aiAct(`Click the "Stop" button at the bottom of ${SIDE_PANEL}`);
    await sleep(2000);

    // Verify stopped state: "Stopped" text and "Start" button
    await agent.aiAssert(
      `${SIDE_PANEL} bottom area shows "Stopped" and a "Start" button`,
    );

    // Restart listening
    await agent.aiAct(
      `Click the "Start" button at the bottom of ${SIDE_PANEL}`,
    );
    await sleep(2000);

    // Verify listening state restored
    await agent.aiAssert(
      `${SIDE_PANEL} bottom area shows "Listening" and a "Stop" button`,
    );
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
