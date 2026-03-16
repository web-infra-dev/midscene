import { describe, it, vi } from 'vitest';
import { agentFromWebDriverAgent, checkIOSEnvironment } from '../../src';

vi.setConfig({
  testTimeout: 90 * 1000,
});

describe(
  'Pinch zoom gesture',
  () => {
    it('Pinch: zoom in on a map', async () => {
      const envCheck = await checkIOSEnvironment();
      if (!envCheck.available) {
        throw new Error(`iOS environment check failed: ${envCheck.error}`);
      }

      const agent = await agentFromWebDriverAgent({
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
      });

      await agent.launch('com.apple.Maps');

      // Use aiAct to test that AI can plan and execute a pinch action
      await agent.aiAct('pinch to zoom in on the map');
    });

    it('Pinch: zoom out on a map', async () => {
      const envCheck = await checkIOSEnvironment();
      if (!envCheck.available) {
        throw new Error(`iOS environment check failed: ${envCheck.error}`);
      }

      const agent = await agentFromWebDriverAgent({
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
      });

      await agent.launch('com.apple.Maps');

      // Use aiAct to test that AI can plan and execute a pinch action
      await agent.aiAct('pinch to zoom out on the map');
    });

    it('Pinch: use aiPinch API directly', async () => {
      const envCheck = await checkIOSEnvironment();
      if (!envCheck.available) {
        throw new Error(`iOS environment check failed: ${envCheck.error}`);
      }

      const agent = await agentFromWebDriverAgent({
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
      });

      await agent.launch('com.apple.Maps');

      // Test the direct aiPinch API
      await agent.aiPinch('the map', { scale: 2 });
      await agent.aiPinch('the map', { scale: 0.5 });
    });
  },
  360 * 1000,
);
