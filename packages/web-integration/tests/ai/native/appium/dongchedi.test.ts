import path from 'node:path';
import { AppiumAgent } from '@/appium';
import { describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 90 * 1000,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const IOS_OPTIONS = {
  port: 4723,
  capabilities: {
    platformName: 'iOS',
    'appium:automationName': 'XCUITest',
    'appium:deviceName': 'iPhone 15 Pro Simulator (17.5)',
    'appium:platformVersion': '17.5',
    'appium:bundleId': 'com.ss.ios.InHouse.AutoMobile',
    'appium:udid': '9ADCE031-36DF-4025-8C62-073FC7FAB901',
    'appium:newCommandTimeout': 600,
  },
  outputDir: path.join(__dirname, 'tmp'),
};

const ANDROID_OPTIONS = {
  port: 4723,
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  capabilities: {
    platformName: 'Android',
    'appium:automationName': 'UiAutomator2',
    'appium:deviceName': 'Android',
    'appium:appPackage': 'com.ss.android.auto',
    'appium:appActivity': '.policy.AutoPrivacyActivity',
    'appium:newCommandTimeout': 600,
  },
};

describe(
  'appium integration',
  () => {
    it('懂车帝查找小米 SU7', async () => {
      const page = await launchPage(IOS_OPTIONS);
      const mid = new AppiumAgent(page);
      await mid.aiAction('点击同意按钮');
      await sleep(3000);
      await mid.aiAction('点击允许获取应用位置信息');
      await sleep(3000);
      await mid.aiAction('点击顶部输入框');
      await sleep(3000);
      await mid.aiAction('在输入框里输入"SU7"，并点击搜索');
      await sleep(3000);
      const items = await mid.aiQuery(
        '"{carName: string, price: number }[], return item name, price',
      );
      console.log('items: ', items);
      expect(items.length).toBeGreaterThanOrEqual(2);
      await mid.aiAssert('最贵的那辆是 29.99 万');
      await mid.aiAction('列表滚动到底部');
    });
  },
  {
    timeout: 720 * 1000,
  },
);
