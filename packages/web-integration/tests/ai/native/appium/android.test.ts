import { AppiumAgent } from '@/appium';
import { describe, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 90 * 1000,
});

const ANDROID_DEFAULT_OPTIONS = {
  port: 4723,
  capabilities: {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': 'Android',
    'appium:appPackage': 'com.android.settings',
    'appium:appActivity': '.MainSettings',
    'appium:newCommandTimeout': 600,
  },
};

describe(
  'appium integration',
  async () => {
    await it('Android settings page demo for input', async () => {
      const page = await launchPage(ANDROID_DEFAULT_OPTIONS);
      const agent = new AppiumAgent(page);

      await agent.aiAction('输入框中输入“123”');
      await agent.aiAction('输入框中输入“456”');
      await agent.aiAction('输入框中输入“789”');
    });
    await it('Android settings page demo for scroll', async () => {
      const page = await launchPage(ANDROID_DEFAULT_OPTIONS);
      const agent = new AppiumAgent(page);

      await agent.aiAction('滑动列表到底部');
      await agent.aiAction('打开"更多设置"');
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
