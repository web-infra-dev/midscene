import path from 'node:path';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { type ComputerAgent, agentFromComputer } from '../../src';
import { openBrowserWithExtension } from './test-utils';

vi.setConfig({ testTimeout: 240 * 1000 });

describe('chrome extension basic test', () => {
  let agent: ComputerAgent;
  const extensionPath = path.resolve(
    __dirname,
    '../../../../apps/chrome-extension/dist',
  );

  beforeAll(async () => {
    agent = await agentFromComputer({
      aiActionContext:
        'Chrome browser with Midscene.js extension loaded. The extension icon may be hidden under the puzzle piece (Extensions) button in the toolbar.',
    });
    await openBrowserWithExtension(
      agent,
      extensionPath,
      'https://todomvc.com/examples/react/dist/',
    );
  });

  it('extension loads and side panel opens', async () => {
    // Step 1: Click the puzzle piece icon (Extensions button) in Chrome toolbar to reveal extensions
    await agent.aiAct(
      'Click the puzzle piece icon (Extensions button) in the Chrome toolbar to show the extensions list',
    );

    // Step 2: Click the Midscene.js entry in the extensions dropdown to open its side panel
    await agent.aiAct('Click "Midscene.js" in the extensions dropdown list');

    // Verify side panel opened
    await agent.aiAssert(
      'A side panel is visible on the right side of the browser window',
    );
  });

  it('side panel shows mode tabs', async () => {
    await agent.aiAssert(
      'The side panel contains tabs or buttons labeled Playground, Bridge, and Recorder',
    );
  });
});
