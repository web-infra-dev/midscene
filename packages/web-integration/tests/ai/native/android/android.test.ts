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
    await it('Android settings page demo for input', async () => {
      const page = await launchPage({ deviceId: DEVICE_ID });
      const agent = new AndroidAgent(page);

      await agent.aiAction('点击输入框');
      await agent.aiAction('输入框中输入"hello world"');
      await agent.aiAction('输入框中输入"你好 世界"');
    });
    await it('Android settings page demo for scroll', async () => {
      const page = await launchPage({ deviceId: DEVICE_ID });
      const agent = new AndroidAgent(page);

      await agent.aiAction('滑动列表到底部');
      await agent.aiAction('打开"更多设置"');
      await agent.aiAction('滑动列表到底部');
      await agent.aiAction('滑动列表到顶部');
      await agent.aiAction('向下滑动一屏');
      await agent.aiAction('向上滑动一屏');
    });
  },
  360 * 1000,
);
