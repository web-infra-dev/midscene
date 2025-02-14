import {
  AgentOverChromeBridge,
  getBridgePageInCliSide,
} from '@/bridge-mode/agent-cli-side';
import { sleep } from '@midscene/core/utils';
import { describe, expect, it, vi } from 'vitest';

vi.setConfig({
  testTimeout: 300 * 1000,
});

describe.skipIf(!process.env.BRIDGE_MODE)('drag event', () => {
  it('agent in cli side, current tab', async () => {
    const agent = new AgentOverChromeBridge({
      // cacheId: 'finish-form-and-submit',
    });
    await agent.connectCurrentTab();

    await sleep(2000);

    await agent.aiAction('输入 "Happy Birthday，只需要输入即可"');
    await agent.aiQuery('输入框内容：Array<string>');

    await agent.destroy();
  });
});
