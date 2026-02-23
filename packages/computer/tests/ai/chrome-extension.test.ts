import { execSync } from 'node:child_process';
import path from 'node:path';
import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { type ComputerAgent, agentFromComputer } from '../../src';
import {
  findLinuxBrowser,
  isHeadlessLinux,
  openBrowserWithExtension,
} from './test-utils';

vi.setConfig({ testTimeout: 240 * 1000 });

describe('chrome extension basic test', () => {
  let agent: ComputerAgent;
  const extensionPath = path.resolve(
    __dirname,
    '../../../../apps/chrome-extension/dist',
  );

  beforeAll(async () => {
    agent = await agentFromComputer({
      aiActionContext: 'Chrome browser with Midscene.js extension loaded.',
    });
    await openBrowserWithExtension(
      agent,
      extensionPath,
      'https://todomvc.com/examples/react/dist/',
    );
  });

  it('extension loads and side panel opens', async () => {
    // Navigate to chrome://extensions to find the extension ID
    await agent.aiAct(
      'Click the browser address bar, type "chrome://extensions" and press Enter',
    );
    await sleep(3000);

    // Extract the extension ID from the extensions page
    const extensionId = await agent.aiQuery(
      'string, find the Midscene.js extension card on the page and return its extension ID (a 32-character string of lowercase letters, usually shown below the extension name or in the details)',
    );
    console.log('Extension ID:', extensionId);

    // Navigate to the extension's side panel page directly
    const extensionUrl = `chrome-extension://${extensionId}/index.html`;
    await agent.aiAct(
      `Click the browser address bar, type "${extensionUrl}" and press Enter`,
    );
    await sleep(5000);

    // Verify the extension UI loaded
    await agent.aiAssert('The page shows the Midscene.js extension UI');
  });

  it('extension page shows mode tabs', async () => {
    await agent.aiAssert(
      'The page contains tabs or buttons for Playground, Bridge, and Recorder modes',
    );
  });
});
