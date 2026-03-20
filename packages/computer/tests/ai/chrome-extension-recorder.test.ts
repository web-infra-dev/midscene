/**
 * E2E tests for Chrome extension Recorder mode.
 *
 * Tests:
 * - Navigate to Recorder mode via menu
 * - Create a new recording session
 * - Start and stop recording
 * - View recording timeline with captured events
 * - Switch to code generation tab
 * - Return to Playground mode
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

  // ── Setup: open side panel and configure ────────────────────────────────

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

  // ── Test: switch to Recorder mode ───────────────────────────────────────

  it('switch to Recorder mode via menu', async () => {
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
        `${SIDE_PANEL} shows Recorder mode UI with a "New Recording" button or a list of recording sessions`,
      );
    } catch {
      console.log('Recorder mode switch failed, retrying...');
      await switchToRecorder();
      await agent.aiAssert(
        `${SIDE_PANEL} shows Recorder mode UI with a "New Recording" button or a list of recording sessions`,
      );
    }
  });

  // ── Test: create new recording session ──────────────────────────────────

  it('create a new recording session', async () => {
    await agent.aiAct(`Click the "New Recording" button in ${SIDE_PANEL}`);
    await sleep(2000);

    // Should automatically enter detail view with recording controls
    await agent.aiAssert(
      `${SIDE_PANEL} shows a recording detail view with a "Start Recording" or "Resume Recording" button, and a session name/title at the top`,
    );
  });

  // ── Test: start and stop recording ──────────────────────────────────────

  it('start recording and perform actions', async () => {
    await agent.aiAct(`Click the "Start Recording" button in ${SIDE_PANEL}`);
    await sleep(2000);

    // Verify recording indicator is shown
    await agent.aiAssert(
      `${SIDE_PANEL} shows a recording indicator with "Recording" text or a pulsing red dot, and a stop button`,
    );

    // Perform some actions on the target page to generate events
    await agent.aiAct(
      'Click on the todo input box on the left side (the TodoMVC page) and type "Test recording" then press Enter',
    );
    await sleep(3000);

    // Stop recording
    await agent.aiAct(
      `Click the stop button (square icon) in ${SIDE_PANEL} to stop recording`,
    );
    await sleep(3000);

    // Verify recording stopped and events captured
    await agent.aiAssert(
      `${SIDE_PANEL} shows the recording has stopped with captured events in a timeline or event list`,
    );
  });

  // ── Test: view code generation tab ──────────────────────────────────────

  it('switch to Generate code tab', async () => {
    await agent.aiAct(
      `Click the "Generate code" tab or the code icon tab in ${SIDE_PANEL}`,
    );
    await sleep(2000);

    await agent.aiAssert(
      `${SIDE_PANEL} shows a code generation view with a code type selector (Playwright/YAML) and generate/copy/download buttons`,
    );
  });

  // ── Test: return to session list ────────────────────────────────────────

  it('close detail and return to session list', async () => {
    await agent.aiAct(
      `Click the close button (X) at the top-right area of the recording detail view in ${SIDE_PANEL}`,
    );
    await sleep(2000);

    await agent.aiAssert(
      `${SIDE_PANEL} shows the session list with at least one recording session card`,
    );
  });

  // ── Test: switch back to Playground ─────────────────────────────────────

  it('switch back to Playground mode', async () => {
    await agent.aiAct(
      `In ${SIDE_PANEL}, find and click the hamburger menu icon (three horizontal lines "≡") at the top-left corner`,
    );
    await sleep(2000);
    await agent.aiAct(
      'In the dropdown menu that just appeared, click the menu item labeled "Playground"',
    );
    await sleep(3000);

    await agent.aiAssert(
      `${SIDE_PANEL} shows Playground UI with action type buttons like "aiAct" and "aiQuery"`,
    );
  });
});
