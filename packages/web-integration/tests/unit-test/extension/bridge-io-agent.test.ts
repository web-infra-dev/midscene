import { describe, expect, it, vi } from 'vitest';

import { ChromeExtensionProxyPageAgent } from '@/chrome-extension/agent';
import { getBridgePageInCliSide } from '@/chrome-extension/bridge-page-cli-side';

describe('fully functional agent in server(cli) side', () => {
  it('basic', async () => {
    const page = getBridgePageInCliSide();
    expect(page).toBeDefined();

    // server should be destroyed as well
    await page.destroy();
  });

  it(
    'run',
    async () => {
      const page = getBridgePageInCliSide();

      // make sure the extension bridge is launched before timeout
      await page.connectNewTabWithUrl('https://www.baidu.com');

      const agent = new ChromeExtensionProxyPageAgent(page);
      await agent.aiAction('type "AI 101" and tap "百度一下"');
      await agent.destroy();
    },
    30 * 1000,
  );
});
