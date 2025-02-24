import { AppiumAgent } from '@/appium';
import { describe, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 90 * 1000,
});

const IOS_DEFAULT_OPTIONS = {
  port: 4723,
  capabilities: {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': 'iPhone (3)',
    'appium:platformVersion': '17.5.1',
    'appium:bundleId': 'com.apple.Preferences',
    'appium:udid': 'B8517A53-6C4C-41D8-9B1E-825A0D75FA47',
  },
};

describe(
  'appium integration',
  () => {
    it('iOS settings page demo', async () => {
      const page = await launchPage(IOS_DEFAULT_OPTIONS);
      const agent = new AppiumAgent(page);
      await agent.aiAction('滑动列表到底部');
      await agent.aiAction('打开"开发者"');
      await agent.aiAction('滑动列表到底部');
      await agent.aiAction('滑动列表到顶部');
      await agent.aiAction('向下滑动一屏');
      await agent.aiAction('向上滑动一屏');
    });
  },
  {
    timeout: 360 * 1000,
  },
);
