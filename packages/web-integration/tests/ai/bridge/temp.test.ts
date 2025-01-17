import {
  AgentOverChromeBridge,
  getBridgePageInCliSide,
} from '@/bridge-mode/agent-cli-side';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 260 * 1000,
});

describe.skipIf(process.env.CI)('drag event', () => {
  it('agent in cli side, current tab', async () => {
    const agent = new AgentOverChromeBridge();
    await agent.connectCurrentTab();
    const answer = await agent.ai('完成滑块拖动');

    await agent.destroy();
  });
});
