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

      // pinch out = zoom in, pinch in = zoom out
      await agent.aiPinch('the map', { direction: 'out', distance: 200 });
      await agent.aiPinch('the map', { direction: 'in', distance: 200 });
    });
  },
  360 * 1000,
);
