import {
  AgentOverChromeBridge,
  getBridgePageInCliSide,
} from '@/bridge-mode/agent-cli-side';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 3 * 60 * 1000,
});
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe.skipIf(!process.env.BRIDGE_MODE)(
  'keyboard event in bridge mode',
  () => {
    it('page in cli side scroll down', async () => {
      const agent = new AgentOverChromeBridge();
      await agent.connectNewTabWithUrl('https://www.baidu.com');

      await agent.aiAction('type "midscene" and hit Enter and scroll down');
      // sleep 3s
      await sleep(3000);

      await agent.destroy();
    });

    it('page in cli side select all text', async () => {
      const agent = new AgentOverChromeBridge();
      await agent.connectNewTabWithUrl('https://www.baidu.com');

      await agent.aiAction('type "Midscene" and hit Enter and select all text');
      // sleep 3s
      await sleep(3000);

      await agent.destroy();
    });
  },
  {
    timeout: 3 * 60 * 10,
  },
);
