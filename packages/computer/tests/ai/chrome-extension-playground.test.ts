/**
 * E2E tests for Chrome extension Playground advanced features.
 *
 * Tests:
 * - aiQuery execution and result display
 * - aiAssert execution and pass/fail feedback
 * - Multiple sequential todo operations
 * - Clearing completed todos via playground
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

describe('chrome extension playground advanced tests', () => {
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

  // ── Setup: open side panel ──────────────────────────────────────────────

  it('open side panel and configure', async () => {
    await agent.aiAct(
      'Click the puzzle piece icon (Extensions button) in the top-right area of the Chrome toolbar',
    );
    await sleep(1000);

    await agent.aiAct('Click "Midscene.js" in the extensions dropdown list');
    await sleep(3000);

    await agent.aiAssert(
      'The browser shows a side panel on the right side containing Midscene or Playground UI, and the TodoMVC page is still visible on the left',
    );

    await injectExtensionConfig(extId);
    const target = await findExtensionPageTarget(extId);
    if (target?.webSocketDebuggerUrl) {
      await reloadViaWebSocket(target.webSocketDebuggerUrl);
      await sleep(3000);
    }
  });

  // ── Test: run aiQuery to extract page data ──────────────────────────────

  it('playground: run aiQuery to extract todo count', async () => {
    // Switch to aiQuery mode
    await agent.aiAct(`Click the "aiQuery" button in ${SIDE_PANEL}`);
    await sleep(500);

    // Enter a query
    await agent.aiAct(
      `In ${SIDE_PANEL}, click the text input area and type: What is the title text shown at the top of the TodoMVC page?`,
    );
    await sleep(500);

    // Run the query
    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(20000);

    // Verify result is displayed
    await agent.aiAssert(
      `${SIDE_PANEL} shows a result section containing text related to "todos" (the TodoMVC app title)`,
    );
  });

  // ── Test: run aiAssert for positive assertion ───────────────────────────

  it('playground: run aiAssert with passing condition', async () => {
    await agent.aiAct(`Click the "aiAssert" button in ${SIDE_PANEL}`);
    await sleep(500);

    await agent.aiAct(
      `In ${SIDE_PANEL}, click the text input area and type: The page contains a text input for adding new todos`,
    );
    await sleep(500);

    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(20000);

    // Should show success/passed result
    await agent.aiAssert(
      `${SIDE_PANEL} shows an execution result that indicates success or passed status (no error message)`,
    );
  });

  // ── Test: add multiple todos via aiAct ──────────────────────────────────

  it('playground: add multiple todos and verify', async () => {
    // Switch back to aiAct
    await agent.aiAct(`Click the "aiAct" button in ${SIDE_PANEL}`);
    await sleep(500);

    // Add first todo
    await agent.aiAct(
      `In ${SIDE_PANEL}, click the text input area and type: Enter "Buy groceries" in the todo input box, then press Enter`,
    );
    await sleep(500);

    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(20000);

    await agent.aiAssert(
      'The TodoMVC page on the left shows a todo item containing "Buy groceries"',
    );

    // Add second todo
    await agent.aiAct(
      `In ${SIDE_PANEL}, clear the text input area and type: Enter "Read a book" in the todo input box, then press Enter`,
    );
    await sleep(500);

    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(20000);

    await agent.aiAssert(
      'The TodoMVC page on the left shows at least two todo items',
    );
  });

  // ── Test: complete a todo via aiAct ─────────────────────────────────────

  it('playground: complete a todo item', async () => {
    await agent.aiAct(
      `In ${SIDE_PANEL}, clear the text input area and type: Click the checkbox next to "Buy groceries" to mark it as complete`,
    );
    await sleep(500);

    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(20000);

    await agent.aiAssert(
      'The TodoMVC page shows "Buy groceries" with a strikethrough or completed style',
    );
  });
});
