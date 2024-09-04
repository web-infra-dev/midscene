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

      await mid.aiAction('输入框中输入“123”');
      await mid.aiAction('输入框中输入“456”');
      await mid.aiAction('输入框中输入“789”');
    });
  },
  {
    timeout: 360 * 1000,
  },
);
