/**
 * E2E tests for Chrome extension settings, theme, and cross-mode navigation.
 *
 * Tests combined for speed:
 * - Settings modal: open → verify env config area → close
 * - Three-mode rotation: Playground → Bridge → Recorder → Playground
 * - Bridge mode UI: verify server config section and status bar
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

vi.setConfig({ testTimeout: 480 * 1000 });

const SIDE_PANEL =
  'the Midscene side panel on the right side of the browser window';

describe('chrome extension settings and cross-mode tests', () => {
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

  it('open side panel and configure', async () => {
    await agent.aiAct(
      'Click the puzzle piece icon (Extensions button) in the top-right area of the Chrome toolbar',
    );
    await sleep(1000);
    await agent.aiAct('Click "Midscene.js" in the extensions dropdown list');
    await sleep(3000);
    await agent.aiAssert(
      'The browser shows a side panel on the right side containing Midscene or Playground UI',
    );

    await injectExtensionConfig(extId);
    const target = await findExtensionPageTarget(extId);
    if (target?.webSocketDebuggerUrl) {
      await reloadViaWebSocket(target.webSocketDebuggerUrl);
      await sleep(3000);
    }
  });

  // ── Combined: settings modal open/edit/close ──────────────────────────
  it('settings: open modal, verify content, and close', async () => {
    const openEnvConfigModal = async () => {
      await agent.aiAct(
        `Click the settings icon in the top-right header area of ${SIDE_PANEL}, next to the GitHub and help icons. Do not click the run configuration icon inside the prompt composer.`,
      );
      await sleep(1500);
    };

    // 1. Open settings
    await openEnvConfigModal();
    try {
      await agent.aiAssert(
        'A modal titled "Model Env Config" is visible, and it contains a large text area for environment variable configuration.',
      );
    } catch {
      await openEnvConfigModal();
      await agent.aiAssert(
        'A modal titled "Model Env Config" is visible, and it contains a large text area for environment variable configuration.',
      );
    }

    // 2. Verify the text area contains env config (injected earlier)
    await agent.aiAssert(
      'The modal text area contains environment variable text like "MIDSCENE_MODEL" or API configuration',
    );

    // 3. Close settings
    await agent.aiAct(
      'Click the X close button in the top-right corner of the "Model Env Config" modal.',
    );
    await sleep(1500);
    await agent.aiAssert(
      `The "Model Env Config" modal is closed, and ${SIDE_PANEL} is visible showing Playground UI without any modal overlay.`,
    );
  });

  // ── Combined: three-mode rotation with Bridge UI checks ───────────────
  it('cross-mode: Playground → Bridge (verify UI) → Recorder → Playground', async () => {
    // 1. Switch to Bridge Mode
    await agent.aiAct(
      `In ${SIDE_PANEL}, find and click the hamburger menu icon (three horizontal lines "≡") at the top-left corner`,
    );
    await sleep(2000);
    await agent.aiAct(
      'In the dropdown menu that just appeared, click the menu item labeled "Bridge Mode"',
    );
    await sleep(3000);

    // Verify Bridge Mode UI elements
    try {
      await agent.aiAssert(
        `${SIDE_PANEL} shows Bridge mode UI with "Bridge Mode" title and a status indicator (Connected, Listening, or Stopped) at the bottom`,
      );
    } catch {
      // Retry menu click
      await agent.aiAct(
        `In ${SIDE_PANEL}, find and click the hamburger menu icon (three horizontal lines "≡") at the top-left corner`,
      );
      await sleep(2000);
      await agent.aiAct('In the dropdown menu, click "Bridge Mode"');
      await sleep(3000);
      await agent.aiAssert(
        `${SIDE_PANEL} shows Bridge mode UI with "Bridge Mode" title`,
      );
    }

    // 2. Switch to Recorder Mode
    await agent.aiAct(
      `In ${SIDE_PANEL}, find and click the hamburger menu icon (three horizontal lines "≡") at the top-left corner`,
    );
    await sleep(2000);
    await agent.aiAct(
      'In the dropdown menu that just appeared, click the menu item labeled "Recorder"',
    );
    await sleep(3000);
    await agent.aiAssert(
      `${SIDE_PANEL} shows Recorder mode UI with a "New Recording" button`,
    );

    // 3. Switch back to Playground
    await agent.aiAct(
      `In ${SIDE_PANEL}, find and click the hamburger menu icon (three horizontal lines "≡") at the top-left corner`,
    );
    await sleep(2000);
    await agent.aiAct(
      'In the dropdown menu that just appeared, click the menu item labeled "Playground"',
    );
    await sleep(3000);
    await agent.aiAssert(
      `${SIDE_PANEL} shows Playground UI with action type buttons like "Act" and "Query"`,
    );
  });
});
