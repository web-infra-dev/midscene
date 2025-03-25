import { AndroidAgent } from '@/android';
import { describe, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 90 * 1000,
});

const DEVICE_ID = process.env.ANDROID_DEVICE_ID;

describe(
  'android integration',
  async () => {
    await it('Android settings page demo for scroll', async () => {
      const page = await launchPage({
        deviceId: DEVICE_ID,
        app: {
          pkg: 'com.android.settings',
          activity: '.Settings',
        },
      });
      const agent = new AndroidAgent(page);
      await agent.aiAction('点击输入框');
      await agent.aiAction('在输入框输入你好 世界');
    });
  },
  360 * 1000,
);
