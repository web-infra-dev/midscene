import {
  AgentOverChromeBridge,
  getBridgePageInCliSide,
} from '@/bridge-mode/agent-cli-side';
import { sleep } from '@midscene/core/utils';
import { describe, expect, it, test, vi } from 'vitest';

vi.setConfig({
  testTimeout: 300 * 1000,
});

const describeIf = process.env.BRIDGE_MODE ? describe : describe.skip;

describeIf('open new tab in bridge mode', () => {
  it(
    'open new tab',
    {
      timeout: 3 * 60 * 1000,
    },
    async () => {
      const agent = new AgentOverChromeBridge();
      await agent.connectNewTabWithUrl('https://www.google.com');

      await agent.aiAction(
        'search "midscene github" and open the first result',
      );
      await agent.aiAssert('the page is "midscene github"');

      await agent.destroy();
    },
  );
});
