import type { AgentOpt, Rect, UIContext, WebElementInfo } from '@midscene/core';
import type { AbstractInterface } from '@midscene/core/device';
import { traverseTree } from '@midscene/shared/extractor';
import { getDebug } from '@midscene/shared/logger';
import { _keyDefinitions } from '@midscene/shared/us-keyboard-layout';

import { commonContextParser } from '@midscene/core/agent';
import type { StaticPage } from '@midscene/playground';
import type { NodeType } from '@midscene/shared/constants';
import type ChromeExtensionProxyPage from './chrome-extension/page';
import type { PlaywrightWebPage } from './playwright';
import type { PuppeteerWebPage } from './puppeteer';

export type WebPageAgentOpt = AgentOpt & WebPageOpt;
export type WebPageOpt = {
  waitForNavigationTimeout?: number;
  waitForNetworkIdleTimeout?: number;
  forceSameTabNavigation?: boolean /* if limit the new tab to the current page, default true */;
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

const debug = getDebug('web:parse-context');
export async function WebPageContextParser(
  page: AbstractInterface,
  _opt?: any, // unused
): Promise<UIContext> {
  const basicContext = await commonContextParser(page);

  debug('will traverse element tree');
  const tree = await page.getElementsNodeTree();
  const webTree = traverseTree(tree!, (elementInfo) => {
    const { rect, id, content, attributes, indexId, isVisible } = elementInfo;
    return new WebElementInfoImpl({
      rect,
      id,
      content,
      attributes,
      indexId,
      isVisible,
    });
  });
  debug('traverse element tree end');

  return {
    ...basicContext,
    tree: webTree,
  };
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
