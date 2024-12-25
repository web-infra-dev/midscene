/// <reference types="chrome" />

/*
  It is used to interact with the page tab from the chrome extension.
  The page must be active when interacting with it.
*/

import fs from 'node:fs';
import type { WebKeyInput } from '@/common/page';
import type { ElementInfo } from '@/extractor';
import type { AbstractPage } from '@/page';
import type { Point, Rect, Size } from '@midscene/core';
import { ifInBrowser } from '@midscene/shared/utils';
import type { Protocol as CDPTypes } from 'devtools-protocol';
import { CdpKeyboard } from './cdpInput';

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
    // console.log('returnValue', returnValue.result.value);
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

  async scrollUntilTop(startingPoint?: Point) {
    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }
    return this.mouse.wheel(0, -9999999);
  }

  async scrollUntilBottom(startingPoint?: Point) {
    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }
    return this.mouse.wheel(0, 9999999);
  }

  async scrollUntilLeft(startingPoint?: Point) {
    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }
    return this.mouse.wheel(-9999999, 0);
  }

  async scrollUntilRight(startingPoint?: Point) {
    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }
    return this.mouse.wheel(9999999, 0);
  }

  async scrollUp(distance?: number, startingPoint?: Point) {
    const { height } = await this.size();
    const scrollDistance = distance || height * 0.7;
    return this.mouse.wheel(
      0,
      -scrollDistance,
      startingPoint?.left,
      startingPoint?.top,
    );
  }

  async scrollDown(distance?: number, startingPoint?: Point) {
    const { height } = await this.size();
    const scrollDistance = distance || height * 0.7;
    return this.mouse.wheel(
      0,
      scrollDistance,
      startingPoint?.left,
      startingPoint?.top,
    );
  }

  async scrollLeft(distance?: number, startingPoint?: Point) {
    const { width } = await this.size();
    const scrollDistance = distance || width * 0.7;
    return this.mouse.wheel(
      -scrollDistance,
      0,
      startingPoint?.left,
      startingPoint?.top,
    );
  }

  async scrollRight(distance?: number, startingPoint?: Point) {
    const { width } = await this.size();
    const scrollDistance = distance || width * 0.7;
    return this.mouse.wheel(
      scrollDistance,
      0,
      startingPoint?.left,
      startingPoint?.top,
    );
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
    wheel: async (
      deltaX: number,
      deltaY: number,
      startX?: number,
      startY?: number,
    ) => {
      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: startX || 10,
        y: startY || 10,
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
      const cdpKeyboard = new CdpKeyboard({
        send: this.sendCommandToDebugger.bind(this),
      });
      await cdpKeyboard.type(text);
    },
    press: async (key: WebKeyInput) => {
      const cdpKeyboard = new CdpKeyboard({
        send: this.sendCommandToDebugger.bind(this),
      });
      await cdpKeyboard.press(key);
    },
  };

  async destroy(): Promise<void> {
    await this.detachDebugger();
  }
}
