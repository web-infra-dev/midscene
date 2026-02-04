import { AgentOverChromeBridge } from '@/bridge-mode/agent-cli-side';
import { sleep } from '@midscene/core/utils';
import { describe, it, vi } from 'vitest';

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
      const agent = new AgentOverChromeBridge({
        cache: { id: 'bridge-open-new-tab' },
      });
      await agent.connectNewTabWithUrl('https://www.baidu.com');

      await agent.aiAct('查询杭州今天的天气');

      // sleep 3s
      await sleep(5000);

      await agent.aiAssert('the page is "杭州天气"');

      await agent.destroy();
    },
  );
});
