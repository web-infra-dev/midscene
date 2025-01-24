import {
  AgentOverChromeBridge,
  getBridgePageInCliSide,
} from '@/bridge-mode/agent-cli-side';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 260 * 1000,
});

describe.skipIf(!process.env.BRIDGE_MODE)('drag event', () => {
  it('agent in cli side, current tab', async () => {
    const agent = new AgentOverChromeBridge();
    await agent.connectCurrentTab();
    await agent.ai('Finish dragging the slider');

    await agent.destroy();
  });
});
