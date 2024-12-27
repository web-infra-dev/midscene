import assert from 'node:assert';
import type { AbstractPage } from '@/page';
import ChromeExtensionProxyPage from './page';

interface ConnectedPage {
  tabId: number;
  page: ChromeExtensionProxyPage;
  status: 'connected' | 'disconnected';
}

export class ChromeExtensionBridgeServer {
  public connectedPages: Record<number, ConnectedPage> = {};

  constructor() {
    this.connectedPages = {};
  }

  listen() {}

  async newTabWithUrl(url: string) {
    assert(url, 'url is required');

    // new tab
    const tab = await chrome.tabs.create({ url });
    const tabId = tab.id;
    assert(tabId, 'failed to get tabId after creating a new tab');

    const page = new ChromeExtensionProxyPage(tabId);
    this.connectedPages[tabId] = {
      tabId,
      page,
      status: 'connected',
    };
    return {
      tabId,
      page,
    };
  }

  async call(tabId: number, method: string, ...args: any[]) {
    assert(tabId, 'tabId is required');
    assert(this.connectedPages[tabId], 'tabId is not connected');
    return (
      this.connectedPages[tabId].page[
        method as keyof ChromeExtensionProxyPage
      ] as any
    )(...args);
  }

  disconnect(tabId: number, closeTab = true) {
    assert(tabId, 'tabId is required');
    assert(this.connectedPages[tabId], 'tabId is not connected');
    this.connectedPages[tabId].status = 'disconnected';
    if (closeTab) {
      chrome.tabs.remove(tabId);
    }
  }
}

// export class PageOverChromeExtensionBridge implements AbstractPage {
//   pageType = 'page-over-chrome-extension-bridge';

//   constructor() {}
// }
