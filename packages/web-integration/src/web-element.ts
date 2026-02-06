import type {
  AgentOpt,
  DeviceAction,
  Rect,
  WebElementInfo,
} from '@midscene/core';
import { _keyDefinitions } from '@midscene/shared/us-keyboard-layout';

import type { NodeType } from '@midscene/shared/constants';
import type ChromeExtensionProxyPage from './chrome-extension/page';
import type { PlaywrightWebPage } from './playwright';
import type { PuppeteerWebPage } from './puppeteer';
import type { StaticPage } from './static';
export type { WebElementInfo };

export type WebPageAgentOpt = AgentOpt & WebPageOpt;
export type WebPageOpt = {
  waitForNavigationTimeout?: number;
  waitForNetworkIdleTimeout?: number;
  forceSameTabNavigation?: boolean /* if limit the new tab to the current page, default true */;
  enableTouchEventsInActionSpace?: boolean;
  /**
   * Force Chrome to render select elements using base-select appearance instead of OS-native rendering.
   * This makes select elements visible in screenshots captured by Playwright/Puppeteer.
   *
   * Reference: https://developer.chrome.com/blog/a-customizable-select
   *
   * When enabled, adds a style tag with `select { appearance: base-select !important; }` to the page.
   */
  forceChromeSelectRendering?: boolean;
  beforeInvokeAction?: () => Promise<void>;
  afterInvokeAction?: () => Promise<void>;
  customActions?: DeviceAction<any>[];
};

export type WebPage =
  | PlaywrightWebPage
  | PuppeteerWebPage
  | StaticPage
  | ChromeExtensionProxyPage;

export class WebElementInfoImpl implements WebElementInfo {
  content: string;

  rect: Rect;

  center: [number, number];

  id: string;

  indexId: number;

  attributes: {
    nodeType: NodeType;
    [key: string]: string;
  };

  xpaths?: string[];

  isVisible: boolean;

  constructor({
    content,
    rect,
    id,
    attributes,
    indexId,
    xpaths,
    isVisible,
  }: {
    content: string;
    rect: Rect;
    id: string;
    attributes: {
      nodeType: NodeType;
      [key: string]: string;
    };
    indexId: number;
    xpaths?: string[];
    isVisible: boolean;
  }) {
    this.content = content;
    this.rect = rect;
    this.center = [
      Math.floor(rect.left + rect.width / 2),
      Math.floor(rect.top + rect.height / 2),
    ];
    this.id = id;
    this.attributes = attributes;
    this.indexId = indexId;
    this.xpaths = xpaths;
    this.isVisible = isVisible;
  }
}

export const limitOpenNewTabScript = `
if (!window.__MIDSCENE_NEW_TAB_INTERCEPTOR_INITIALIZED__) {
  window.__MIDSCENE_NEW_TAB_INTERCEPTOR_INITIALIZED__ = true;

  // Intercept the window.open method (only once)
  window.open = function(url) {
    console.log('Blocked window.open:', url);
    window.location.href = url;
    return null;
  };

  // Block all a tag clicks with target="_blank" (only once)
  document.addEventListener('click', function(e) {
    const target = e.target.closest('a');
    if (target && target.target === '_blank') {
      e.preventDefault();
      console.log('Blocked new tab:', target.href);
      window.location.href = target.href;
      target.removeAttribute('target');
    }
  }, true);
}
`;
