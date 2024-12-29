/// <reference types="chrome" />

/*
  It is used to interact with the page tab from the chrome extension.
  The page must be active when interacting with it.
*/

import fs from 'node:fs';
import type { WebKeyInput } from '@/common/page';
import type { ElementInfo } from '@/extractor';
import type { AbstractPage } from '@/page';
import type { Point, Size } from '@midscene/core';
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

export default class ChromeExtensionProxyPage implements AbstractPage {
  pageType = 'chrome-extension-proxy';

  public tabId: number;

  private viewportSize?: Size;

  private debuggerAttached = false;

  private attachingDebugger: Promise<void> | null = null;

  constructor(tabId: number) {
    this.tabId = tabId;
  }

  private async attachDebugger() {
    if (this.debuggerAttached) return;

    // If already attaching, wait for it to complete
    if (this.attachingDebugger) {
      await this.attachingDebugger;
      return;
    }

    // Create new attaching promise
    this.attachingDebugger = (async () => {
      try {
        await chrome.debugger.attach({ tabId: this.tabId }, '1.3');
        this.debuggerAttached = true;

        // listen to the debugger detach event
        chrome.debugger.onEvent.addListener((source, method, params) => {
          console.log('debugger event', source, method, params);
          if (method === 'Debugger.detached') {
            this.debuggerAttached = false;
          }
        });
      } finally {
        this.attachingDebugger = null;
      }
    })();

    await this.attachingDebugger;
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
    // screenshot by cdp
    const base64 = await this.sendCommandToDebugger('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 70,
    });
    return `data:image/jpeg;base64,${base64.data}`;
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
