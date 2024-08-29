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
  },
};

describe(
  'appium integration',
  () => {
    it('Android settings page demo', async () => {
      const page = await launchPage(ANDROID_DEFAULT_OPTIONS);
      const mid = new AppiumAgent(page);

      await mid.aiAction('滑动列表到底部');
      await mid.aiAction('打开"更多设置"');
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
