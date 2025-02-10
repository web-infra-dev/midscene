import {
  AgentOverChromeBridge,
  getBridgePageInCliSide,
} from '@/bridge-mode/agent-cli-side';
import { sleep } from '@midscene/core/utils';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 40 * 60 * 1000,
});

describe.skipIf(!process.env.BRIDGE_MODE)('drag event', () => {
  it('agent in cli side, current tab', async () => {
    const agent = new AgentOverChromeBridge({
      cacheId: 'star-midscene-github',
    });
    await agent.connectCurrentTab({
      trackingActiveTab: true,
    });

    await agent.aiAction(
      'Search midscene github and complete the star like or cancel',
    );

    await sleep(3000);

    await agent.destroy();
  });
});
