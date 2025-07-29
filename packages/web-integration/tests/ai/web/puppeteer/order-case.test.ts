import { PuppeteerAgent } from '@/puppeteer';
import { afterEach, describe, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 1200 * 1000,
});

describe('order case', () => {
  let resetFn: () => Promise<void>;
  afterEach(async () => {
    if (resetFn) {
      await resetFn();
    }
  });

  it('order sensitive', async () => {
    const { originPage, reset } = await launchPage(
      'https://eshop.hkcsl.com/zh_HK/handsets-and-digital-device/smart-wearable-product/GARMIN570scol.html',
    );
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage, {
      cacheId: 'order-case',
      waitForNavigationTimeout: 0,
      waitForNetworkIdleTimeout: 0,
    });
    await agent.aiTap('選擇 顏色');
    await agent.aiTap('選擇 顏色下拉框的第二个选项');
  });

  it('order insensitive', async () => {
    const { originPage, reset } = await launchPage(
      'https://eshop.hkcsl.com/zh_HK/handsets-and-digital-device/smart-wearable-product/GARMIN570scol.html',
    );
    resetFn = reset;
    const agent = new PuppeteerAgent(originPage, {
      cacheId: 'order-case',
      waitForNavigationTimeout: 0,
      waitForNetworkIdleTimeout: 0,
    });
    await agent.aiTap('選擇 顏色');
    await agent.aiTap('選擇 顏色下拉框的躍動黃选项');
  });
});
