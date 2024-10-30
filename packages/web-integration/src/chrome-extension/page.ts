/// <reference types="chrome" />

/*
  It is used to interact with the page tab from the chrome extension.
  The page must be active when interacting with it.
*/

import type { WebKeyInput } from '@/common/page';
import type { ElementInfo } from '@/extractor';
import type { AbstractPage } from '@/page';
import { resizeImgBase64 } from '@midscene/shared/browser/img';

// const ThrowNotImplemented: any = (methodName: string) => {
//   throw new Error(
//     `The method "${methodName}" is not implemented in this context.`,
//   );
// };

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

const lastTwoCallTime = [0, 0];
const callInterval = 1050;
async function getScreenshotBase64(windowId: number) {
  // check if this window is active
  const activeWindow = await chrome.windows.getAll({ populate: true });
  if (activeWindow.find((w) => w.id === windowId) === undefined) {
    throw new Error(`Window with id ${windowId} is not active`);
  }

  // avoid MAX_CAPTURE_VISIBLE_TAB_CALLS_PER_SECOND
  const now = Date.now();
  if (now - lastTwoCallTime[0] < callInterval) {
    const sleepTime = callInterval - (now - lastTwoCallTime[0]);
    console.warn(
      `Sleep for ${sleepTime}ms to avoid too frequent screenshot calls`,
    );
    await new Promise((resolve) => setTimeout(resolve, sleepTime));
  }
  const base64 = await chrome.tabs.captureVisibleTab(windowId, {
    format: 'jpeg',
    quality: 70,
  });
  lastTwoCallTime.shift();
  lastTwoCallTime.push(Date.now());
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

  private debuggerAttached = false;

  constructor(tabId: number, windowId: number) {
    this.tabId = tabId;
    this.windowId = windowId;

    //     chrome.debugger.attach({ tabId: tab.id }, '1.2', function () {
    //       chrome.debugger.sendCommand(
    //         { tabId: tab.id },
    //         'Network.enable',
    //         {},
    //         function () {
    //           if (chrome.runtime.lastError) {
    //             console.error(chrome.runtime.lastError);
    //           }
    //         }
    //       );
    //     });

    // chrome.action.onClicked.addListener(function (tab) {
    //   if (tab.url.startsWith('http')) {

    //   } else {
    //     console.log('Debugger can only be attached to HTTP/HTTPS pages.');
    //   }
    // });

    // chrome.debugger.onEvent.addListener(function (source, method, params) {
    //   if (method === 'Network.responseReceived') {
    //     console.log('Response received:', params.response);
    //     // Perform your desired action with the response data
    //   }
    // });
  }

  private async attachDebugger() {
    if (this.debuggerAttached) return;
    await chrome.debugger.attach({ tabId: this.tabId }, '1.3');
    this.debuggerAttached = true;
  }

  private async sendCommandToDebugger(command: string, params: any) {
    await this.attachDebugger();
    await chrome.debugger.sendCommand({ tabId: this.tabId }, command, params);
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
    // console.log('will call screenshotBase64');
    // const trace = new Error('i_am_here');
    // console.error(trace.stack);
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
    // send cmd+a then backspace
    const ifOSX = navigator.userAgent.includes('Macintosh');
    const metaKeyModifier = ifOSX ? 4 : 2;
    await this.sendCommandToDebugger('Input.dispatchKeyEvent', {
      type: 'keyDown',
      modifiers: metaKeyModifier,
      key: 'a',
      code: 'KeyA',
    });

    await this.sendCommandToDebugger('Input.dispatchKeyEvent', {
      type: 'keyUp',
      modifiers: metaKeyModifier,
      key: 'a',
      code: 'KeyA',
    });

    await this.sendCommandToDebugger('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Backspace',
      code: 'Backspace',
    });

    await this.sendCommandToDebugger('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Backspace',
      code: 'Backspace',
    });
  }

  mouse = {
    click: async (x: number, y: number) => {
      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
    },
    wheel: async (deltaX: number, deltaY: number) => {
      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        deltaX,
        deltaY,
      });
    },
    move: async (x: number, y: number) => {
      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
      });
    },
  };

  keyboard = {
    type: async (text: string) => {
      for (const char of text) {
        // Send char event
        await this.sendCommandToDebugger('Input.dispatchKeyEvent', {
          type: 'char',
          text: char,
          key: char,
          unmodifiedText: char,
        });

        // sleep 50ms
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
    press: async (key: WebKeyInput) => {
      await this.sendCommandToDebugger('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key: key,
        code: `Key${key.toUpperCase()}`,
      });
      await this.sendCommandToDebugger('Input.dispatchKeyEvent', {
        type: 'keyUp',
        key: key,
        code: `Key${key.toUpperCase()}`,
      });
    },
  };
}
