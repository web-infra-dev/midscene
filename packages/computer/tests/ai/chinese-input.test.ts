import { sleep } from '@midscene/core/utils';
import { beforeAll, describe, it, vi } from 'vitest';
import { ComputerAgent, ComputerDevice } from '../../src';

vi.setConfig({
  testTimeout: 240 * 1000,
});

describe('chinese and non-ASCII input', () => {
  let agent: ComputerAgent;

  beforeAll(async () => {
    const device = new ComputerDevice({
      inputStrategy: 'clipboard-for-non-ascii',
    });
    agent = new ComputerAgent(device, {
      aiActionContext:
        'You are testing text input on a desktop computer. Focus on testing Chinese and other non-ASCII character input.',
    });
    await device.connect();
  });

  it(
    'should input Chinese text in browser search',
    async () => {
      const isMac = process.platform === 'darwin';

      // Open browser (using platform-specific shortcuts)
      if (isMac) {
        await agent.aiAct('press Cmd+Space to open Spotlight');
        await sleep(1000);
        await agent.aiAct('type "Safari" and press Enter');
      } else {
        await agent.aiAct('press Windows key');
        await sleep(1000);
        await agent.aiAct('type "Chrome" or "Edge" and press Enter');
      }

      await sleep(3000);

      // Wait for browser to open
      await agent.aiWaitFor('Browser window is open');

      // Navigate to a search engine
      await agent.aiAct('click on address bar');
      await sleep(500);
      await agent.aiAct('type "google.com" and press Enter');

      await sleep(3000);

      // Test Chinese input
      await agent.aiAct('click on search box');
      await sleep(500);

      // Input Chinese text
      await agent.aiAct('type "你好世界"');
      await sleep(1000);

      // Verify Chinese text was input correctly
      await agent.aiAssert('The search box contains Chinese text "你好世界"');

      // Clear and test Japanese
      await agent.aiAct('clear the search box');
      await sleep(500);
      await agent.aiAct('type "こんにちは"');
      await sleep(1000);

      // Verify Japanese text
      await agent.aiAssert('The search box contains Japanese text');

      // Clear and test emoji
      await agent.aiAct('clear the search box');
      await sleep(500);
      await agent.aiAct('type "Hello 😀🎉"');
      await sleep(1000);

      // Verify emoji input
      await agent.aiAssert('The search box contains text with emoji');

      // Clear and test mixed text
      await agent.aiAct('clear the search box');
      await sleep(500);
      await agent.aiAct('type "Hello 你好 World"');
      await sleep(1000);

      // Verify mixed text
      await agent.aiAssert(
        'The search box contains mixed English and Chinese text',
      );

      // Close browser
      if (isMac) {
        await agent.aiAct('press Cmd+Q to close Safari');
      } else {
        await agent.aiAct('press Alt+F4 to close browser');
      }
    },
    720 * 1000,
  );

  it(
    'should use always-clipboard strategy',
    async () => {
      // Create a new device with always-clipboard strategy
      const deviceAlways = new ComputerDevice({
        inputStrategy: 'always-clipboard',
      });
      const agentAlways = new ComputerAgent(deviceAlways, {
        aiActionContext: 'You are testing text input using clipboard.',
      });
      await deviceAlways.connect();

      const isMac = process.platform === 'darwin';

      // Open a text editor
      if (isMac) {
        await agentAlways.aiAct('press Cmd+Space to open Spotlight');
        await sleep(1000);
        await agentAlways.aiAct('type "TextEdit" and press Enter');
      } else {
        await agentAlways.aiAct('press Windows key');
        await sleep(1000);
        await agentAlways.aiAct('type "Notepad" and press Enter');
      }

      await sleep(2000);

      // Wait for text editor to open
      await agentAlways.aiWaitFor('Text editor is open');

      // Test ASCII input (should also use clipboard with always-clipboard strategy)
      await agentAlways.aiAct('type "Hello World"');
      await sleep(1000);

      // Verify ASCII text
      await agentAlways.aiAssert('The text editor contains "Hello World"');

      // Close text editor without saving
      if (isMac) {
        await agentAlways.aiAct('press Cmd+Q');
        await sleep(500);
        await agentAlways.aiAct('click "Don\'t Save" button if it appears');
      } else {
        await agentAlways.aiAct('press Alt+F4');
        await sleep(500);
        await agentAlways.aiAct('click "Don\'t Save" button if it appears');
      }

      await deviceAlways.destroy();
    },
    720 * 1000,
  );
});
