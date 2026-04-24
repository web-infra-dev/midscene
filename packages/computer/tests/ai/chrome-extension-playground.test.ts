/**
 * E2E tests for Chrome extension Playground advanced features.
 *
 * Tests:
 * - aiQuery execution and result display
 * - aiAct to add a todo item and verify
 */
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, it, vi } from 'vitest';
import { type ComputerAgent, agentFromComputer } from '../../src';
import {
  bringPageToFront,
  findExtensionPageTarget,
  findPageTargetByUrlPrefix,
  injectExtensionConfig,
  launchChromeWithExtension,
  readExtensionId,
  reloadViaWebSocket,
} from './chrome-extension-helpers';

vi.setConfig({ testTimeout: 600 * 1000 });

const SIDE_PANEL =
  'the Midscene side panel on the right side of the browser window';
const TODO_MVC_URL_PREFIX = 'https://todomvc.com/examples/react/dist/';

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

  async function focusTodoMvcPage(): Promise<void> {
    const target = await findPageTargetByUrlPrefix(TODO_MVC_URL_PREFIX);
    if (!target?.webSocketDebuggerUrl) {
      throw new Error('TodoMVC page target not found');
    }
    await bringPageToFront(target.webSocketDebuggerUrl);
    await sleep(1500);
  }

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

  it('aiQuery: extract page title and verify result', async () => {
    await agent.aiAct(`Click the "aiQuery" button in ${SIDE_PANEL}`);
    await sleep(500);
    await agent.aiAct(
      `In ${SIDE_PANEL}, click the text input area and type: What is the title text shown at the top of the TodoMVC page?`,
    );
    await sleep(500);
    await focusTodoMvcPage();
    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(30000);
    await agent.aiWaitFor(
      `${SIDE_PANEL} shows a result section containing text related to "todos" (the TodoMVC app title)`,
      { timeoutMs: 180000, checkIntervalMs: 10000 },
    );
  });

  it('aiAct: add a todo item via playground', async () => {
    await agent.aiAct(`Click the "aiAct" button in ${SIDE_PANEL}`);
    await sleep(500);
    await agent.aiAct(
      `In ${SIDE_PANEL}, click the text input area and type: Enter "Buy groceries" in the todo input box, then press Enter`,
    );
    await sleep(500);
    await focusTodoMvcPage();
    await agent.aiAct(`Click the "Run" button in ${SIDE_PANEL}`);
    await sleep(30000);
    await focusTodoMvcPage();
    await agent.aiWaitFor(
      'The TodoMVC page on the left shows a todo item containing "Buy groceries"',
      { timeoutMs: 180000, checkIntervalMs: 10000 },
    );
  });
});
