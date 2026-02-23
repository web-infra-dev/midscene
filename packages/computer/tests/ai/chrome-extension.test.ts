import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { type ComputerAgent, agentFromComputer } from '../../src';
import { openBrowserWithExtension } from './test-utils';

vi.setConfig({ testTimeout: 120 * 1000 });

describe('chrome extension basic test', () => {
  let agent: ComputerAgent;
  const extensionPath = path.resolve(
    __dirname,
    '../../../../apps/chrome-extension/dist',
  );

  beforeAll(async () => {
    agent = await agentFromComputer({
      aiActionContext: 'Chrome browser with Midscene extension loaded.',
    });
    await openBrowserWithExtension(
      agent,
      extensionPath,
      'https://todomvc.com/examples/react/dist/',
    );
  });

  it('extension loads and side panel opens', async () => {
    await agent.aiAct(
      'Right-click the Midscene.js extension icon in the Chrome toolbar, then click "Open side panel"',
    );
    await agent.aiAssert(
      'A side panel is visible on the right side of the browser',
    );
  });

  it('side panel shows mode tabs', async () => {
    await agent.aiAssert(
      'The side panel contains Playground, Bridge, and Recorder tabs or buttons',
    );
  });
});
