/// <reference types="chrome" />

/*
  It is used to interact with the page tab from the chrome extension.
  The page must be active when interacting with it.
*/

import type { WebKeyInput } from '@/common/page';
import type { ElementInfo } from '@/extractor';
import type { AbstractPage } from '@/page';
import { resizeImgBase64 } from '@midscene/shared/browser/img';

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

async function getScreenshotBase64(windowId: number) {
  // check if this window is active
  const activeWindow = await chrome.windows.getAll({ populate: true });
  if (activeWindow.find((w) => w.id === windowId) === undefined) {
    throw new Error(`Window with id ${windowId} is not active`);
  }

  const base64 = await chrome.tabs.captureVisibleTab(windowId, {
    format: 'jpeg',
    quality: 70,
  });
  return base64;
}

async function getScreenInfoOfTab(tabId: number): Promise<{
  dpr: number;
  width: number;
  height: number;
}> {
  const returnValue = await chrome.scripting.executeScript({
    target: { tabId, allFrames: false },
    func: () => {
      return {
        dpr: window.devicePixelRatio,
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
      };
    },
  });
  console.log('returnValue of getScreenInfoOfTab', returnValue);
  return returnValue[0].result!;
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
    const base64 = await getScreenshotBase64(this.windowId);
    const screenInfo = await getScreenInfoOfTab(this.tabId);
    if (screenInfo.dpr > 1) {
      return (await resizeImgBase64(base64, {
        width: screenInfo.width,
        height: screenInfo.height,
      })) as string;
    }
    return base64;
  }

  url() {
    // TODO: get url from chrome extension
    return 'url_in_chrome_extension';
    // return this.uiContext.url;
    //
  }

  async scrollUntilTop() {
    await chrome.scripting.executeScript({
      target: { tabId: this.tabId, allFrames: true },
      func: () => {
        window.scrollTo(0, 0);
      },
    });
  }

  async scrollUntilBottom() {
    await chrome.scripting.executeScript({
      target: { tabId: this.tabId, allFrames: true },
      func: () => {
        window.scrollTo(0, document.body.scrollHeight);
      },
    });
  }

  async scrollUpOneScreen() {
    await chrome.scripting.executeScript({
      target: { tabId: this.tabId, allFrames: true },
      func: () => {
        window.scrollBy(0, -window.innerHeight * 0.7);
      },
    });
  }

  async scrollDownOneScreen() {
    await chrome.scripting.executeScript({
      target: { tabId: this.tabId, allFrames: true },
      func: () => {
        window.scrollBy(0, window.innerHeight * 0.7);
      },
    });
  }

  async clearInput() {
    await chrome.scripting.executeScript({
      target: { tabId: this.tabId, allFrames: true },
      func: () => {
        const activeElement = window.document.activeElement;
        if (activeElement && 'value' in activeElement) {
          (activeElement as HTMLInputElement).value = '';
        }
      },
    });
  }

  mouse = {
    click: async (x: number, y: number) => {
      chrome.scripting.executeScript({
        target: { tabId: this.tabId, allFrames: true },
        func: (x: number, y: number) => {
          const event = new MouseEvent('click', {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
          });
          // find the element at (x, y)
          const element = document.elementFromPoint(x, y);
          console.log('element', element);
          if (element) {
            element.dispatchEvent(event);
          } else {
            document.body.dispatchEvent(event);
          }
        },
        args: [x, y],
      });
    },
    wheel: async (deltaX: number, deltaY: number) => {
      await chrome.scripting.executeScript({
        target: { tabId: this.tabId, allFrames: true },
        func: (deltaX: number, deltaY: number) => {
          window.scrollBy(deltaX, deltaY);
        },
        args: [deltaX, deltaY],
      });
    },
    move: async (x: number, y: number) => {
      // hover on the element at (x, y)
      throw new Error('mouse.move is not implemented in chrome extension');
    },
  };

  keyboard = {
    type: async (text: string) => {
      await chrome.scripting.executeScript({
        target: { tabId: this.tabId, allFrames: true },
        func: (text: string) => {
          const activeElement = window.document.activeElement;
          if (activeElement && 'value' in activeElement) {
            (activeElement as HTMLInputElement).value += text;
          } else {
            throw new Error('No active element found to type text');
          }
        },
        args: [text],
      });
    },
    press: async (key: WebKeyInput) => {
      await chrome.scripting.executeScript({
        target: { tabId: this.tabId, allFrames: true },
        func: (key: string) => {
          const activeElement = window.document.activeElement;
          if (activeElement) {
            activeElement.dispatchEvent(
              new KeyboardEvent('keydown', {
                bubbles: true,
                cancelable: true,
                key,
              }),
            );
          } else {
            throw new Error('No active element found to press key');
          }
        },
        args: [key],
      });
    },
  };
}
