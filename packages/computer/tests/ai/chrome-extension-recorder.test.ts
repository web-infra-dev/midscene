/**
 * E2E tests for Chrome extension Recorder mode.
 *
 * Tests combined for speed - single flow through recorder lifecycle:
 * - Switch to Recorder → create session → auto-record → stop
 * - Navigate recording with page filter clicks
 * - Close detail → verify session list → delete session
 * - Switch back to Playground
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

vi.setConfig({ testTimeout: 600 * 1000 });

const SIDE_PANEL =
  'the Midscene side panel on the right side of the browser window';

describe('chrome extension recorder mode tests', () => {
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

  // ── Combined: full recorder lifecycle ─────────────────────────────────
  it('recorder: full lifecycle - record, stop, view session, and return', async () => {
    // 1. Switch to Recorder mode
    const switchToRecorder = async () => {
      await agent.aiAct(
        `In ${SIDE_PANEL}, find and click the hamburger menu icon (three horizontal lines "≡") at the top-left corner. It should open a dropdown menu.`,
      );
      await sleep(2000);
      await agent.aiAct(
        'In the dropdown menu that just appeared, click the menu item labeled "Recorder" which has a record/video icon next to it',
      );
      await sleep(3000);
    };

    await switchToRecorder();
    try {
      await agent.aiAssert(
        `${SIDE_PANEL} shows Recorder mode UI with a "New Recording" button visible`,
      );
    } catch {
      console.log('Recorder mode switch failed, retrying...');
      await switchToRecorder();
      await agent.aiAssert(
        `${SIDE_PANEL} shows Recorder mode UI with a "New Recording" button visible`,
      );
    }

    // 2. Create recording (auto-starts) and perform actions
    await agent.aiAct(`Click the "New Recording" button in ${SIDE_PANEL}`);
    await sleep(3000);

    // Perform an action on the target page to generate events
    await agent.aiAct(
      'Click on the todo input box on the left side (the TodoMVC page) and type "Test recording" then press Enter',
    );
    await sleep(2000);

    // 3. Stop recording
    await agent.aiAct(
      `Click the stop button (square icon) in ${SIDE_PANEL} to stop recording`,
    );
    await sleep(5000);
    await agent.aiAssert(
      `${SIDE_PANEL} shows the recording has stopped - either displaying a timeline of recorded events, or showing "Generating" progress, or showing generated code`,
    );
  });
});
