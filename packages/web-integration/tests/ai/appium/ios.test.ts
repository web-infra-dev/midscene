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
    'appium:deviceName': 'iPhone 15 Plus Simulator (18.0)',
    'appium:platformVersion': '18.0',
    'appium:bundleId': 'com.apple.Preferences',
    'appium:udid': 'B8517A53-6C4C-41D8-9B1E-825A0D75FA47',
    'appium:newCommandTimeout': 600,
  },
};

describe(
  'appium integration',
  async () => {
    await it('iOS settings page demo for input', async () => {
      const page = await launchPage(IOS_DEFAULT_OPTIONS);
      const mid = new AppiumAgent(page);

      await mid.aiAction('输入框中输入“123”');
      await mid.aiAction('输入框中输入“456”');
      await mid.aiAction('输入框中输入“789”');
    });
    await it('iOS settings page demo for scroll', async () => {
      const page = await launchPage(IOS_DEFAULT_OPTIONS);
      const mid = new AppiumAgent(page);

      await mid.aiAction('滑动列表到底部');
      await mid.aiAction('打开"开发者"');
      await mid.aiAction('滑动列表到底部');
      await mid.aiAction('滑动列表到顶部');
      await mid.aiAction('向下滑动一屏');
      await mid.aiAction('向上滑动一屏');
    });
  },
  {
    timeout: 360 * 1000,
  },
);
