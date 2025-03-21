import { AndroidAgent } from '@/android';
import { describe, expect, it, vi } from 'vitest';
import { launchPage } from './utils';

vi.setConfig({
  testTimeout: 90 * 1000,
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 使用环境变量或默认值作为设备ID
const DEVICE_ID = process.env.ANDROID_DEVICE_ID;

describe(
  'android integration',
  () => {
    it('懂车帝查找小米 SU7', async () => {
      const page = await launchPage({ deviceId: DEVICE_ID });
      const agent = new AndroidAgent(page);

      // await agent.aiAction('点击同意按钮');
      // await sleep(3000);

      // await agent.aiAction('点击允许获取应用位置信息');
      // await sleep(3000);

      await agent.aiAction('点击顶部输入框');
      await sleep(3000);

      await agent.aiAction('在输入框里输入"SU7"，并点击搜索');
      await sleep(3000);

      const items = await agent.aiQuery(
        '"{carName: string, price: number }[], return item name, price',
      );
      console.log('items: ', items);
      expect(items.length).toBeGreaterThanOrEqual(2);

      await agent.aiAssert('最贵的那辆是 29.99 万');
      await agent.aiAction('列表滚动到底部');
    });
  },
  720 * 1000,
);
