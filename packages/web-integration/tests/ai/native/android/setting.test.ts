import { AndroidAgent } from '@/android';
import { describe, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 90 * 1000,
});

// 使用环境变量或默认值作为设备ID
const DEVICE_ID = process.env.ANDROID_DEVICE_ID;

describe(
  'android integration',
  async () => {
    await it('Android settings page demo for scroll', async () => {
      const page = await launchPage({
        deviceId: DEVICE_ID,
        page: 'android.settings.SETTINGS',
      });
      const agent = new AndroidAgent(page);

      await agent.aiAction('scroll list to bottom');
      await agent.aiAction('open "More settings"');
      await agent.aiAction('scroll list to bottom');
      await agent.aiAction('scroll list to top');
      await agent.aiAction('swipe down one screen');
      await agent.aiAction('swipe up one screen');
    });
  },
  360 * 1000,
);
