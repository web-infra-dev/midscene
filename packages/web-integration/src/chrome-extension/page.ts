/// <reference types="chrome" />

import type { ElementInfo } from '@/extractor';
import type { AbstractPage } from '@/page';

const ThrowNotImplemented: any = (methodName: string) => {
  throw new Error(
    `The method "${methodName}" is not implemented in this context.`,
  );
};

async function getScreenshotBase64FromCache(
  tabId: number,
  windowId: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      {
        type: 'get-screenshot',
        payload: { tabId, windowId },
      },
      (response) => {
        if (!response || response.error) {
          reject(response.error);
        } else {
          resolve((response as any).base64);
        }
      },
    );
  });
}

// remember to include this file into extension's package
const scriptFileToRetrieve = './scripts/htmlElement.js';
async function getActivePageContent(tabId: number): Promise<{
  context: ElementInfo[];
  size: { width: number; height: number; dpr: number };
}> {
  const injectResult = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: [scriptFileToRetrieve],
  });
  console.log('injectResult', injectResult);

  // call and retrieve the result
  const returnValue = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: () => {
      return {
        context: (
          window as any
        ).midscene_element_inspector.webExtractTextWithPosition(),
        size: {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
          dpr: window.devicePixelRatio,
        },
      };
    },
  });
  if (!returnValue[0].result) {
    throw new Error(`Failed to get active page content of tabId: ${tabId}`);
  }

  return returnValue[0].result;
}

export default class ChromeExtensionProxyPage implements AbstractPage {
  pageType = 'chrome-extension-proxy';

  private tabId: number;

  private windowId: number;

  private viewportSize?: { width: number; height: number; dpr: number };

  constructor(tabId: number, windowId: number) {
    this.tabId = tabId;
    this.windowId = windowId;
  }

  async getElementInfos() {
    const content = await getActivePageContent(this.tabId);
    if (content?.size) {
      this.viewportSize = content.size;
    }
    return content?.context || [];
  }

  async size() {
    if (this.viewportSize) return this.viewportSize;

    const content = await getActivePageContent(this.tabId);
    return content.size;
  }

  async screenshotBase64() {
    const base64 = await getScreenshotBase64FromCache(
      this.tabId,
      this.windowId,
    );
    return base64;
  }

  url() {
    // TODO: get url from chrome extension
    return 'url_in_chrome_extension';
    // return this.uiContext.url;
    //
  }

  async scrollUntilTop() {
    return ThrowNotImplemented('scrollUntilTop');
  }

  async scrollUntilBottom() {
    return ThrowNotImplemented('scrollUntilBottom');
  }

  async scrollUpOneScreen() {
    return ThrowNotImplemented('scrollUpOneScreen');
  }

  async scrollDownOneScreen() {
    return ThrowNotImplemented('scrollDownOneScreen');
  }

  async clearInput() {
    return ThrowNotImplemented('clearInput');
  }

  mouse = {
    click: ThrowNotImplemented.bind(null, 'mouse.click'),
    wheel: ThrowNotImplemented.bind(null, 'mouse.wheel'),
    move: ThrowNotImplemented.bind(null, 'mouse.move'),
  };

  keyboard = {
    type: ThrowNotImplemented.bind(null, 'keyboard.type'),
    press: ThrowNotImplemented.bind(null, 'keyboard.press'),
  };
}
