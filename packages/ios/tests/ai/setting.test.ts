import { describe, it, vi } from 'vitest';
import { agentFromWebDriverAgent, checkIOSEnvironment } from '../../src';

vi.setConfig({
  testTimeout: 90 * 1000,
});

describe(
  'iOS settings page',
  async () => {
    await it('iOS settings page demo for scroll', async () => {
      // Check if iOS environment is available before running tests
      const envCheck = await checkIOSEnvironment();
      if (!envCheck.available) {
        throw new Error(`iOS environment check failed: ${envCheck.error}`);
      }

      const agent = await agentFromWebDriverAgent({
        aiActionContext:
          'If any location, permission, user agreement, etc. popup, click agree. If login page pops up, close it.',
        autoDismissKeyboard: false, // Disable auto keyboard dismissal to avoid extra "done" text
      });

      console.log('Connected to WebDriverAgent successfully');

      await agent.launch('com.apple.Preferences');
      await agent.aiAct('pull down to refresh');
      await agent.aiAct('long press chat list first chat');
      await agent.aiAct('click recent apps button');
      await agent.aiAct('click android home button');
      await agent.aiAct('scroll list to bottom');
      await agent.aiAct('open "More settings"');
      await agent.aiAct('scroll left until left edge');
      await agent.aiAct('scroll right until right edge');
      await agent.aiAct('scroll list to top');
      await agent.aiAct('scroll list to bottom');
      await agent.aiAct('scroll down one screen');
      await agent.aiAct('scroll up one screen');
      await agent.aiAct('scroll right one screen');
      await agent.aiAct('scroll left one screen');
    });
  },
  360 * 1000,
);
