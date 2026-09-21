/**
 * Basic extension launch smoke test. Playground, Bridge, Recorder, and
 * Settings behavior lives in their dedicated parallel suites.
 */
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, it, rs } from '@rstest/core';
import { type ComputerAgent, agentFromComputer } from '../../src';
import {
  findExtensionPageTarget,
  injectExtensionConfig,
  launchChromeWithExtension,
  openExtensionSidePanel,
  readExtensionId,
  reloadViaWebSocket,
} from './chrome-extension-helpers';

rs.setConfig({ testTimeout: 360 * 1000 });

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

  it('open side panel via extension icon', async () => {
    await openExtensionSidePanel(agent, extId);

    await agent.aiAssert(
      'A docked browser side panel is visible at the far right and contains Midscene or Playground UI, while the main browser content still shows the TodoMVC todos app',
    );

    // Inject env config into the side panel's localStorage via CDP
    await injectExtensionConfig(extId);
    const target = await findExtensionPageTarget(extId);
    if (target?.webSocketDebuggerUrl) {
      await reloadViaWebSocket(target.webSocketDebuggerUrl);
      await sleep(3000);
    }
  });
});
