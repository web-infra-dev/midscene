import { PageAgent } from '@/common/agent';
import type { ChromeExtensionPageBrowserSide } from './bridge-page-browser-side';
import { getBridgePageInCliSide } from './bridge-page-cli-side';

export class ChromePageOverBridgeAgent extends PageAgent {
  constructor() {
    const page = getBridgePageInCliSide();
    super(page, {});
  }

  async connectNewTabWithUrl(url: string) {
    await (this.page as ChromeExtensionPageBrowserSide).connectNewTabWithUrl(
      url,
    );
  }
}
