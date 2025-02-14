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
      cacheId: 'finish-form-and-submit',
    });
    await agent.connectCurrentTab();

    await sleep(2000);

    await agent.aiAction(
      'Use the test data to complete the form,Comply with the following restrictions: 1. The Captcha code is not required 2. No need to click the register button',
    );

    await agent.destroy();
  });
});
