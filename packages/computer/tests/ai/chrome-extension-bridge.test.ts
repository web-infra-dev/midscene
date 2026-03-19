/**
 * E2E test for Chrome extension Bridge Mode start/stop controls.
 *
 * Verifies the fix for https://github.com/web-infra-dev/midscene/issues/2119:
 * - Bridge mode shows a Stop button when listening
 * - Clicking Stop changes status to "Stopped" and button to "Start"
 * - Server URL input becomes editable after stopping
 * - Clicking Start restarts bridge with "Listening" status
 *
 * This test launches its own Chrome instance with the extension loaded.
 */
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

describe('chrome extension bridge mode start/stop (#2119)', () => {
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

  // ── Setup: open side panel ──────────────────────────────────────────

  it('open side panel and switch to Bridge Mode', async () => {
    // Open side panel
    await agent.aiAct(
      'Click the puzzle piece icon (Extensions button) in the top-right area of the Chrome toolbar',
    );
    await sleep(1000);

    await agent.aiAct('Click "Midscene.js" in the extensions dropdown list');
    await sleep(3000);

    await agent.aiAssert(
      'The browser shows a side panel on the right side containing Midscene or Playground UI',
    );

    // Inject env config
    await injectExtensionConfig(extId);
    const target = await findExtensionPageTarget(extId);
    if (target?.webSocketDebuggerUrl) {
      await reloadViaWebSocket(target.webSocketDebuggerUrl);
      await sleep(3000);
    }

    // Switch to Bridge Mode
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

    await switchToBridge();
    try {
      await agent.aiAssert(
        `${SIDE_PANEL} shows Bridge mode UI with "Bridge Mode" title and a "Stop" button at the bottom`,
      );
    } catch {
      console.log('Bridge mode switch failed, retrying...');
      await switchToBridge();
      await agent.aiAssert(
        `${SIDE_PANEL} shows Bridge mode UI with "Bridge Mode" title and a "Stop" button at the bottom`,
      );
    }
  });

  // ── Test: stop listening ──────────────────────────────────────────────

  it('stop bridge listening', async () => {
    await agent.aiAct(`Click the "Stop" button at the bottom of ${SIDE_PANEL}`);
    await sleep(2000);

    await agent.aiAssert(
      `${SIDE_PANEL} bottom area shows "Stopped" and a "Start" button`,
    );
  });

  // ── Test: server URL editable when stopped ────────────────────────────

  it('server URL input is editable when bridge is stopped', async () => {
    await agent.aiAct(
      `In ${SIDE_PANEL}, click on "Use remote server (optional)" to expand the server configuration section`,
    );
    await sleep(1000);

    await agent.aiAct(
      `In ${SIDE_PANEL}, click the server URL input field (with placeholder "ws://localhost:3766") and type "ws://example.com:4000"`,
    );
    await sleep(1000);

    await agent.aiAssert(
      `${SIDE_PANEL} shows a server URL input field containing "ws://example.com:4000"`,
    );
  });

  // ── Test: restart listening ───────────────────────────────────────────

  it('restart bridge listening', async () => {
    await agent.aiAct(
      `Click the "Start" button at the bottom of ${SIDE_PANEL}`,
    );
    await sleep(2000);

    await agent.aiAssert(
      `${SIDE_PANEL} bottom area shows "Listening" and a "Stop" button`,
    );
  });
});
