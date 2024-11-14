/// <reference types="chrome" />

/*
  It is used to interact with the page tab from the chrome extension.
  The page must be active when interacting with it.
*/

import fs from 'node:fs';
import type { WebKeyInput } from '@/common/page';
import type { ElementInfo } from '@/extractor';
import type { AbstractPage } from '@/page';
import type { Rect, Size } from '@midscene/core/.';
import { ifInBrowser } from '@midscene/shared/utils';
import type { Protocol as CDPTypes } from 'devtools-protocol';

// remember to include this file into extension's package
const scriptFileToRetrieve = './lib/htmlElement.js';
let scriptFileContentCache: string | null = null;
const scriptFileContent = async () => {
  if (scriptFileContentCache) return scriptFileContentCache;
  if (ifInBrowser) {
    const script = await fetch('/lib/htmlElement.js');
    scriptFileContentCache = await script.text();
    return scriptFileContentCache;
  }
  return fs.readFileSync(scriptFileToRetrieve, 'utf8');
};

const lastTwoCallTime = [0, 0];
const callInterval = 1050;
async function getScreenshotBase64FromWindowId(windowId: number) {
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

export default class ChromeExtensionProxyPage implements AbstractPage {
  pageType = 'chrome-extension-proxy';

  private tabId: number;

  private windowId: number;

  private viewportSize?: Size;

  private debuggerAttached = false;

  constructor(tabId: number, windowId: number) {
    this.tabId = tabId;
    this.windowId = windowId;
  }

  private async attachDebugger() {
    if (this.debuggerAttached) return;

    await chrome.debugger.attach({ tabId: this.tabId }, '1.3');
    this.debuggerAttached = true;

    // listen to the debugger detach event
    chrome.debugger.onEvent.addListener((source, method, params) => {
      console.log('debugger event', source, method, params);
      if (method === 'Debugger.detached') {
        this.debuggerAttached = false;
      }
    });
  }

  private async detachDebugger() {
    if (!this.debuggerAttached) return;
    await chrome.debugger.detach({ tabId: this.tabId });
    this.debuggerAttached = false;
  }

  private async sendCommandToDebugger<ResponseType = any, RequestType = any>(
    command: string,
    params: RequestType,
  ): Promise<ResponseType> {
    await this.attachDebugger();
    return (await chrome.debugger.sendCommand(
      { tabId: this.tabId },
      command,
      params as any,
    )) as ResponseType;
  }

  private async getPageContentByCDP() {
    const script = await scriptFileContent();

    // check tab url
    const url = await chrome.tabs.get(this.tabId).then((tab) => tab.url);
    await this.sendCommandToDebugger<
      CDPTypes.Runtime.EvaluateResponse,
      CDPTypes.Runtime.EvaluateRequest
    >('Runtime.evaluate', {
      expression: script,
    });

    const expression = () => {
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
    };
    const returnValue = await this.sendCommandToDebugger<
      CDPTypes.Runtime.EvaluateResponse,
      CDPTypes.Runtime.EvaluateRequest
    >('Runtime.evaluate', {
      expression: `(${expression.toString()})()`,
      returnByValue: true,
    });

    if (!returnValue.result.value) {
      throw new Error('Failed to get page content from page');
    }
    return returnValue.result.value;
  }

  private async rectOfNodeId(nodeId: number): Promise<Rect | null> {
    try {
      const { model } =
        await this.sendCommandToDebugger<CDPTypes.DOM.GetBoxModelResponse>(
          'DOM.getBoxModel',
          { nodeId },
        );
      return {
        left: model.border[0],
        top: model.border[1],
        width: model.border[2] - model.border[0],
        height: model.border[5] - model.border[1],
      };
    } catch (error) {
      console.error('Error getting box model for nodeId', nodeId, error);
      return null;
    }
  }

  async getElementInfos() {
    const content = await this.getPageContentByCDP();
    if (content?.size) {
      this.viewportSize = content.size;
    }

    return content?.context || [];
  }

  async size() {
    if (this.viewportSize) return this.viewportSize;
    const content = await this.getPageContentByCDP();
    return content.size;
  }

  async screenshotBase64() {
    const base64 = await getScreenshotBase64FromWindowId(this.windowId);
    return base64;
  }

  async url() {
    const url = await chrome.tabs.get(this.tabId).then((tab) => tab.url);
    return url || '';
  }

  async scrollUntilTop() {
    return this.mouse.wheel(0, -9999999);
  }

  async scrollUntilBottom() {
    return this.mouse.wheel(0, 9999999);
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

  async clearInput(element: ElementInfo) {
    if (!element) {
      console.warn('No element to clear input');
      return;
    }

    await this.mouse.click(element.center[0], element.center[1]);

    await this.sendCommandToDebugger('Input.dispatchKeyEvent', {
      type: 'keyDown',
      commands: ['selectAll'],
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
        x: 10,
        y: 10,
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
        await this.sendCommandToDebugger('Input.insertText', {
          text: char,
        });

        // sleep 50ms
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    },
    press: async (key: WebKeyInput) => {
      await this.sendCommandToDebugger('Input.dispatchKeyEvent', {
        type: 'rawKeyDown',
        code: key,
        key: key,
      });

      // Dispatch 'char' event
      await this.sendCommandToDebugger('Input.dispatchKeyEvent', {
        type: 'char',
        code: key,
        key: key,
      });

      // Dispatch 'keyUp' event
      await this.sendCommandToDebugger('Input.dispatchKeyEvent', {
        type: 'keyUp',
        code: key,
        key: key,
      });
    },
  };

  async destroy(): Promise<void> {
    await this.detachDebugger();
  }
}

// backup: some implementation by chrome extension API instead of CDP
// async function getPageContentOfTab(tabId: number): Promise<{
//   context: ElementInfo[];
//   size: { width: number; height: number; dpr: number };
// }> {
//   await chrome.scripting.executeScript({
//     target: {
//       tabId,
//       allFrames: true,
//     },
//     files: [scriptFileToRetrieve],
//   });

//   // call and retrieve the result
//   const returnValue = await chrome.scripting.executeScript({
//     target: { tabId, allFrames: true },
//     func: () => {
//       return {
//         context: (
//           window as any
//         ).midscene_element_inspector.webExtractTextWithPosition(),
//         size: {
//           width: document.documentElement.clientWidth,
//           height: document.documentElement.clientHeight,
//           dpr: window.devicePixelRatio,
//         },
//       };
//     },
//   });

//   console.log('returnValue', returnValue);
//   if (!returnValue[0].result) {
//     throw new Error(`Failed to get active page content of tabId: ${tabId}`);
//   }

//   return returnValue[0].result;
// }

// async function getSizeInfoOfTab(tabId: number): Promise<{
//   dpr: number;
//   width: number;
//   height: number;
// }> {
//   const returnValue = await chrome.scripting.executeScript({
//     target: { tabId, allFrames: false },
//     func: () => {
//       return {
//         dpr: window.devicePixelRatio,
//         width: document.documentElement.clientWidth,
//         height: document.documentElement.clientHeight,
//       };
//     },
//   });
//   // console.log('returnValue of getScreenInfoOfTab', returnValue);
//   return returnValue[0].result!;
// }
