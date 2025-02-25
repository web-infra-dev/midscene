/// <reference types="chrome" />

/*
  It is used to interact with the page tab from the chrome extension.
  The page must be active when interacting with it.
*/

import assert from 'node:assert';
import type { WebKeyInput } from '@/common/page';
import { limitOpenNewTabScript } from '@/common/ui-utils';
import type { AbstractPage, ChromePageDestroyOptions } from '@/page';
import type { ElementTreeNode, Point, Size } from '@midscene/core';
import type { ElementInfo } from '@midscene/shared/extractor';
import { treeToList } from '@midscene/shared/extractor';
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

declare const __VERSION__: string;

export default class ChromeExtensionProxyPage implements AbstractPage {
  pageType = 'chrome-extension-proxy';

  public forceSameTabNavigation: boolean;
  private version: string = __VERSION__;

  private viewportSize?: Size;

  private activeTabId: number | null = null;

  private tabIdOfDebuggerAttached: number | null = null;

  private attachingDebugger: Promise<void> | null = null;

  private destroyed = false;

  constructor(forceSameTabNavigation: boolean) {
    this.forceSameTabNavigation = forceSameTabNavigation;
  }

  public async getTabId() {
    if (this.activeTabId && !this.forceSameTabNavigation) {
      return this.activeTabId;
    }
    const tabId = await chrome.tabs
      .query({ active: true, currentWindow: true })
      .then((tabs) => tabs[0]?.id);
    this.activeTabId = tabId || 0;
    return this.activeTabId;
  }

  private async attachDebugger() {
    assert(!this.destroyed, 'Page is destroyed');

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
        const currentTabId = await this.getTabId();

        if (this.tabIdOfDebuggerAttached === currentTabId) {
          // already attached
          return;
        }
        if (
          this.tabIdOfDebuggerAttached &&
          this.tabIdOfDebuggerAttached !== currentTabId
        ) {
          // detach the previous tab
          console.log(
            'detach the previous tab',
            this.tabIdOfDebuggerAttached,
            '->',
            currentTabId,
          );
          try {
            await this.detachDebugger(this.tabIdOfDebuggerAttached);
          } catch (error) {
            console.error('Failed to detach debugger', error);
          }
        }

        // detach any debugger attached to the tab
        console.log('attaching debugger', currentTabId);
        await chrome.debugger.attach({ tabId: currentTabId }, '1.3');
        // wait util the debugger banner in Chrome appears
        await sleep(500);

        this.tabIdOfDebuggerAttached = currentTabId;

        await this.enableWaterFlowAnimation();
      } catch (error) {
        console.error('Failed to attach debugger', error);
      } finally {
        this.attachingDebugger = null;
      }
    })();

    await this.attachingDebugger;
  }

  private async showMousePointer(x: number, y: number) {
    // update mouse pointer while redirecting
    const pointerScript = `(() => {
      if(typeof window.midsceneWaterFlowAnimation !== 'undefined') {
        window.midsceneWaterFlowAnimation.enable();
        window.midsceneWaterFlowAnimation.showMousePointer(${x}, ${y});
      } else {
        console.log('midsceneWaterFlowAnimation is not defined');
      }
    })()`;

    await this.sendCommandToDebugger('Runtime.evaluate', {
      expression: `${pointerScript}`,
    });
  }

  private async hideMousePointer() {
    await this.sendCommandToDebugger('Runtime.evaluate', {
      expression: `(() => {
        if(typeof window.midsceneWaterFlowAnimation !== 'undefined') {
          window.midsceneWaterFlowAnimation.hideMousePointer();
        }
      })()`,
    });
  }

  private async detachDebugger(tabId?: number) {
    const tabIdToDetach = tabId || this.tabIdOfDebuggerAttached;
    console.log('detaching debugger', tabIdToDetach);
    if (!tabIdToDetach) {
      console.warn('No tab id to detach');
      return;
    }

    Promise.all([
      this.disableWaterFlowAnimation(tabIdToDetach),
      sleep(200), // wait for the animation to stop
      chrome.debugger.detach({ tabId: tabIdToDetach }),
    ]);

    this.tabIdOfDebuggerAttached = null;
  }

  private async enableWaterFlowAnimation() {
    // limit open page in new tab
    if (this.forceSameTabNavigation) {
      await chrome.debugger.sendCommand(
        { tabId: this.tabIdOfDebuggerAttached! },
        'Runtime.evaluate',
        {
          expression: limitOpenNewTabScript,
        },
      );
    }

    const script = await injectWaterFlowAnimation();
    // we will call this function in sendCommandToDebugger, so we have to use the chrome.debugger.sendCommand
    await chrome.debugger.sendCommand(
      { tabId: this.tabIdOfDebuggerAttached! },
      'Runtime.evaluate',
      {
        expression: script,
      },
    );
  }

  private async disableWaterFlowAnimation(tabId: number) {
    const script = await injectStopWaterFlowAnimation();

    await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
      expression: script,
    });
  }

  private async sendCommandToDebugger<ResponseType = any, RequestType = any>(
    command: string,
    params: RequestType,
  ): Promise<ResponseType> {
    await this.attachDebugger();

    assert(this.tabIdOfDebuggerAttached, 'Debugger is not attached');

    // wo don't have to await it
    this.enableWaterFlowAnimation();
    return (await chrome.debugger.sendCommand(
      { tabId: this.tabIdOfDebuggerAttached! },
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
        tree: (window as any).midscene_element_inspector.webExtractNodeTree(),
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
    return returnValue.result.value as {
      tree: ElementTreeNode<ElementInfo>;
      size: Size;
    };
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

  async getElementsInfo() {
    const tree = await this.getElementsNodeTree();
    return treeToList(tree);
  }

  async getElementsNodeTree() {
    await this.hideMousePointer();
    const content = await this.getPageContentByCDP();
    if (content?.size) {
      this.viewportSize = content.size;
    }

    return content?.tree || { node: null, children: [] };
  }

  async size() {
    if (this.viewportSize) return this.viewportSize;
    const content = await this.getPageContentByCDP();
    return content.size;
  }

  async screenshotBase64() {
    // screenshot by cdp
    await this.hideMousePointer();
    const base64 = await this.sendCommandToDebugger('Page.captureScreenshot', {
      format: 'jpeg',
      quality: 70,
    });
    return `data:image/jpeg;base64,${base64.data}`;
  }

  async url() {
    const tabId = await this.getTabId();
    const url = await chrome.tabs.get(tabId).then((tab) => tab.url);
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
      type: 'keyUp',
      commands: ['selectAll'],
    });

    await sleep(100);

    await this.keyboard.press({
      key: 'Backspace',
    });
  }

  private latestMouseX = 50;
  private latestMouseY = 50;

  mouse = {
    click: async (x: number, y: number) => {
      await this.showMousePointer(x, y);
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
      const finalX = startX || this.latestMouseX;
      const finalY = startY || this.latestMouseY;
      await this.showMousePointer(finalX, finalY);
      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: finalX,
        y: finalY,
        deltaX,
        deltaY,
      });
      this.latestMouseX = finalX;
      this.latestMouseY = finalY;
    },
    move: async (x: number, y: number) => {
      await this.showMousePointer(x, y);
      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x,
        y,
      });
      this.latestMouseX = x;
      this.latestMouseY = y;
    },
    drag: async (
      from: { x: number; y: number },
      to: { x: number; y: number },
    ) => {
      await this.mouse.move(from.x, from.y);
      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: from.x,
        y: from.y,
        button: 'left',
        clickCount: 1,
      });
      await this.mouse.move(to.x, to.y);
      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: to.x,
        y: to.y,
        button: 'left',
        clickCount: 1,
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
    press: async (
      action:
        | { key: WebKeyInput; command?: string }
        | { key: WebKeyInput; command?: string }[],
    ) => {
      const cdpKeyboard = new CdpKeyboard({
        send: this.sendCommandToDebugger.bind(this),
      });
      const keys = Array.isArray(action) ? action : [action];
      for (const k of keys) {
        const commands = k.command ? [k.command] : [];
        await cdpKeyboard.down(k.key, { commands });
      }
      for (const k of [...keys].reverse()) {
        await cdpKeyboard.up(k.key);
      }
    },
  };

  async destroy(): Promise<void> {
    this.activeTabId = null;
    await this.detachDebugger();
    this.destroyed = true;
  }
}
