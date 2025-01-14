/// <reference types="chrome" />

/*
  It is used to interact with the page tab from the chrome extension.
  The page must be active when interacting with it.
*/

import type { WebKeyInput } from '@/common/page';
import type { ElementInfo } from '@/extractor';
import type { AbstractPage } from '@/page';
import type { Point, Size } from '@midscene/core';
import { ifInBrowser } from '@midscene/shared/utils';
import type { Protocol as CDPTypes } from 'devtools-protocol';
import { CdpKeyboard } from './cdpInput';
import {
  getHtmlElementScript,
  injectStopWaterFlowAnimation,
  injectWaterFlowAnimation,
} from './dynamic-scripts';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default class ChromeExtensionProxyPage implements AbstractPage {
  pageType = 'chrome-extension-proxy';

  public getTabId: () => number;

  private viewportSize?: Size;

  private debuggerAttached = false;

  private attachingDebugger: Promise<void> | null = null;

  constructor(getTabId: () => number) {
    this.getTabId = getTabId;
  }

  private async attachDebugger() {
    // If already attaching, wait for it to complete
    if (this.attachingDebugger) {
      await this.attachingDebugger;
      return;
    }

    // Create new attaching promise
    this.attachingDebugger = (async () => {
      const url = await this.url();
      if (url.startsWith('chrome://')) {
        throw new Error(
          'Cannot attach debugger to chrome:// pages, please use Midscene in a normal page with http://, https:// or file://',
        );
      }

      try {
        const currentTabId = this.getTabId();
        // check if debugger is already attached to the tab
        const targets = await chrome.debugger.getTargets();
        const target = targets.find(
          (target) => target.tabId === currentTabId && target.attached === true,
        );
        if (!target) {
          // await chrome.debugger.detach({ tabId: currentTabId });
          await chrome.debugger.attach({ tabId: currentTabId }, '1.3');
          this.debuggerAttached = true;
          // Prevent AI logic from being influenced by changes in page width and height due to the debugger banner appearing on attach.
          await sleep(340);
          // listen to the debugger detach event
          chrome.debugger.onEvent.addListener((source, method, params) => {
            console.log('debugger event', source, method, params);
            if (method === 'Debugger.detached') {
              this.debuggerAttached = false;
            }
          });
        }
      } finally {
        this.attachingDebugger = null;
      }
    })();

    await this.attachingDebugger;
  }

  private async enableWaterFlowAnimation(tabId: number) {
    const script = await injectWaterFlowAnimation();

    await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: script,
    });
  }

  private async disableWaterFlowAnimation(tabId: number) {
    const script = await injectStopWaterFlowAnimation();

    await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: script,
    });
  }

  private async detachDebugger() {
    // check if debugger is already attached to the tab
    const targets = await chrome.debugger.getTargets();
    const attendTabs = targets.filter(
      (target) =>
        target.attached === true &&
        !target.url.startsWith('chrome-extension://'),
    );
    if (attendTabs.length > 0) {
      for (const tab of attendTabs) {
        if (tab.tabId) {
          await this.disableWaterFlowAnimation(tab.tabId);
          chrome.debugger.detach({ tabId: tab.tabId });
        }
      }
      this.debuggerAttached = false;
    }
  }

  private async sendCommandToDebugger<ResponseType = any, RequestType = any>(
    command: string,
    params: RequestType,
  ): Promise<ResponseType> {
    await this.attachDebugger();
    const tabId = this.getTabId();
    this.enableWaterFlowAnimation(tabId);
    return (await chrome.debugger.sendCommand(
      { tabId },
      command,
      params as any,
    )) as ResponseType;
  }

  private async getPageContentByCDP() {
    const script = await getHtmlElementScript();

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
      const errorDescription =
        returnValue.exceptionDetails?.exception?.description || '';
      if (!errorDescription) {
        console.error('returnValue from cdp', returnValue);
      }
      throw new Error(
        `Failed to get page content from page, error: ${errorDescription}`,
      );
    }
    // console.log('returnValue', returnValue.result.value);
    return returnValue.result.value;
  }

  // current implementation is wait until domReadyState is complete
  public async waitUntilNetworkIdle() {
    const timeout = 10000;
    const startTime = Date.now();
    let lastReadyState = '';
    while (Date.now() - startTime < timeout) {
      const result = await this.sendCommandToDebugger('Runtime.evaluate', {
        expression: 'document.readyState',
      });
      lastReadyState = result.result.value;
      if (lastReadyState === 'complete') {
        await new Promise((resolve) => setTimeout(resolve, 300));
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 300));
    }
    throw new Error(
      `Failed to wait until network idle, last readyState: ${lastReadyState}`,
    );
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
    const url = await chrome.tabs.get(this.getTabId()).then((tab) => tab.url);
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
      await cdpKeyboard.type(text, { delay: 0 });
    },
    press: async (key: WebKeyInput) => {
      const cdpKeyboard = new CdpKeyboard({
        send: this.sendCommandToDebugger.bind(this),
      });
      await cdpKeyboard.press(key, { delay: 0 });
    },
  };

  async destroy(): Promise<void> {
    await this.detachDebugger();
  }
}
