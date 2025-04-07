import { PageAgent, type PageAgentOpt } from '@/common/agent';
import type { BridgeConnectTabOptions } from './common';
import { getBridgePageInCliSide } from './page-cli-side';
import type { ExtensionBridgePageBrowserSide } from './page-extension-side';

interface ChromeExtensionPageCliSide extends ExtensionBridgePageBrowserSide {
  showStatusMessage: (message: string) => Promise<void>;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class AgentOverChromeBridge extends PageAgent<ChromeExtensionPageCliSide> {
  private destroyAfterDisconnectFlag?: boolean;

  constructor(opts?: PageAgentOpt & { closeNewTabsAfterDisconnect?: boolean }) {
    const page = getBridgePageInCliSide<ChromeExtensionPageCliSide>();
    super(
      page,
      Object.assign(opts || {}, {
        onTaskStartTip: (tip: string) => {
          this.page.showStatusMessage(tip);
        },
      }),
    );
    this.destroyAfterDisconnectFlag = opts?.closeNewTabsAfterDisconnect;
  }

  async setDestroyOptionsAfterConnect() {
    if (this.destroyAfterDisconnectFlag) {
      this.page.setDestroyOptions({
        closeTab: true,
      });
    }
  }

  async connectNewTabWithUrl(url: string, options?: BridgeConnectTabOptions) {
    await this.page.connectNewTabWithUrl(url, options);
    await sleep(500);
    await this.setDestroyOptionsAfterConnect();
  }

  async connectCurrentTab(options?: BridgeConnectTabOptions) {
    await this.page.connectCurrentTab(options);
    await sleep(500);
    await this.setDestroyOptionsAfterConnect();
  }

  async aiAction(prompt: string, options?: any) {
    if (options) {
      console.warn(
        'the `options` parameter of aiAction is not supported in cli side',
      );
    }
    return await super.aiAction(prompt);
  }

  async destroy(closeNewTabsAfterDisconnect?: boolean) {
    if (typeof closeNewTabsAfterDisconnect === 'boolean') {
      await this.page.setDestroyOptions({
        closeTab: closeNewTabsAfterDisconnect,
      });
    }
    await super.destroy();
  }
}
