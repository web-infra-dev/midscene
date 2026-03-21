/**
 * E2E tests for Chrome extension Playground advanced features.
 *
 * Tests combined for speed - each it() covers multiple related scenarios:
 * - aiQuery execution → result display → structured data
 * - aiAssert pass → aiAssert fail (negative case)
 * - aiAct add todo → consecutive aiAct operations
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

  // ── Combined: aiQuery + aiAssert pass + aiAssert fail ─────────────────
  it('aiQuery result display, aiAssert pass and fail', async () => {
    // 1. aiQuery: extract page title
    await agent.aiAct(`Click the "aiQuery" button in ${SIDE_PANEL}`);
    await sleep(500);
    await agent.aiAct(
      `In ${SIDE_PANEL}, click the text input area and type: What is the title text shown at the top of the TodoMVC page?`,
    );
    await sleep(500);
    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(20000);
    await agent.aiAssert(
      `${SIDE_PANEL} shows a result section containing text related to "todos" (the TodoMVC app title)`,
    );

    // 2. aiAssert: passing condition (no mode switch overhead - just click button)
    await agent.aiAct(`Click the "aiAssert" button in ${SIDE_PANEL}`);
    await sleep(500);
    await agent.aiAct(
      `In ${SIDE_PANEL}, click the text input area and type: The page contains a text input for adding new todos`,
    );
    await sleep(500);
    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(20000);
    await agent.aiAssert(
      `${SIDE_PANEL} shows an execution result that indicates success or passed status (no error message)`,
    );

    // 3. aiAssert: failing condition - assert something that doesn't exist
    await agent.aiAct(
      `In ${SIDE_PANEL}, clear the text input area and type: There is a "Delete All" button visible on the TodoMVC page`,
    );
    await sleep(500);
    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(20000);
    await agent.aiAssert(
      `${SIDE_PANEL} shows an execution result that indicates failure or error status, such as an error message or a red/failed indicator`,
    );
  });

  // ── Combined: aiAct add todo + consecutive operation ──────────────────
  it('aiAct add todo and complete it consecutively', async () => {
    // 1. Switch to aiAct and add a todo
    await agent.aiAct(`Click the "aiAct" button in ${SIDE_PANEL}`);
    await sleep(500);
    await agent.aiAct(
      `In ${SIDE_PANEL}, click the text input area and type: Enter "Buy groceries" in the todo input box, then press Enter`,
    );
    await sleep(500);
    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(20000);
    await agent.aiAssert(
      'The TodoMVC page on the left shows a todo item containing "Buy groceries"',
    );

    // 2. Consecutive: complete the todo (no mode switch needed, still in aiAct)
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
