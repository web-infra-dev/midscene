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
    'appium:bundleId': 'com.ss.iphone.ugc.Aweme',
    'appium:udid': '00008110-0016254836E8401E',
  },
};

describe(
  'appium integration',
  () => {
    it('iOS settings page demo', async () => {
      const page = await launchPage(IOS_DEFAULT_OPTIONS);
      const mid = new AppiumAgent(page);
      await mid.ai('点击点赞按钮，点击作者头像');
      // await mid.aiAction('滑动列表到底部');
      // await mid.aiAction('打开"开发者"');
      // await mid.aiAction('滑动列表到底部');
      // await mid.aiAction('滑动列表到顶部');
      // await mid.aiAction('向下滑动一屏');
      // await mid.aiAction('向上滑动一屏');
    });
  },
  {
    timeout: 360 * 1000,
  },
);
