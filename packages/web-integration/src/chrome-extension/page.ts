/// <reference types="chrome" />

/*
  It is used to interact with the page tab from the chrome extension.
  The page must be active when interacting with it.
*/

import { limitOpenNewTabScript } from '@/web-element';
import type { ElementTreeNode, Point, Size, UIContext } from '@midscene/core';
import type { AbstractInterface, DeviceAction } from '@midscene/core/device';
import type { ElementInfo } from '@midscene/shared/extractor';
import { treeToList } from '@midscene/shared/extractor';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { assert } from '@midscene/shared/utils';
import type { Protocol as CDPTypes } from 'devtools-protocol';
import { WebPageContextParser } from '../web-element';
import {
  type KeyInput,
  type MouseButton,
  commonWebActionsForWebPage,
} from '../web-page';
import { CdpKeyboard } from './cdpInput';
import {
  getHtmlElementScript,
  injectStopWaterFlowAnimation,
  injectWaterFlowAnimation,
} from './dynamic-scripts';

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default class ChromeExtensionProxyPage implements AbstractInterface {
  interfaceType = 'chrome-extension-proxy';

  public forceSameTabNavigation: boolean;

  private viewportSize?: Size;

  private activeTabId: number | null = null;

  private tabIdOfDebuggerAttached: number | null = null;

  private attachingDebugger: Promise<void> | null = null;

  private destroyed = false;

  private isMobileEmulation: boolean | null = null;

  public _continueWhenFailedToAttachDebugger = false;

  private isDebuggerAttached = false;

  private debuggerDetachReason: string | null = null;

  private pendingReattach = false;

  private tabUpdateListener:
    | ((
        tabId: number,
        changeInfo: chrome.tabs.TabChangeInfo,
        _tab: chrome.tabs.Tab,
      ) => void)
    | null = null;

  private debuggerDetachListener:
    | ((source: chrome.debugger.Debuggee, reason: string) => void)
    | null = null;

  constructor(forceSameTabNavigation: boolean) {
    this.forceSameTabNavigation = forceSameTabNavigation;
    this.setupDebuggerEventListeners();
  }

  actionSpace(): DeviceAction[] {
    return commonWebActionsForWebPage(this);
  }

  private setupDebuggerEventListeners() {
    // Listen for debugger detachment
    this.debuggerDetachListener = (source, reason) => {
      if (source.tabId === this.tabIdOfDebuggerAttached) {
        console.log(
          'Debugger detached due to:',
          reason,
          'from tab:',
          source.tabId,
        );
        this.debuggerDetachReason = reason;
        this.isDebuggerAttached = false;
        this.tabIdOfDebuggerAttached = null;

        // If detached due to target_closed (cross-origin navigation), mark for reattach
        if (reason === 'target_closed' && !this.destroyed) {
          console.log('Marking for reattachment after target_closed');
          this.pendingReattach = true;
        }
      }
    };

    chrome.debugger.onDetach.addListener(this.debuggerDetachListener);

    // Listen for tab updates to handle navigation completion
    this.tabUpdateListener = (tabId, changeInfo, _tab) => {
      if (
        tabId === this.activeTabId &&
        tabId === this.tabIdOfDebuggerAttached &&
        changeInfo.status === 'complete' &&
        this.pendingReattach &&
        !this.destroyed
      ) {
        console.log('Tab navigation completed, reattaching debugger');
        this.pendingReattach = false;

        // Reattach with a small delay to ensure page is ready
        setTimeout(() => {
          if (!this.destroyed && !this.isDebuggerAttached) {
            this.attachDebugger().catch((error) => {
              console.error('Failed to auto-reattach debugger:', error);
            });
          }
        }, 500);
      }
    };

    chrome.tabs.onUpdated.addListener(this.tabUpdateListener);
  }

  private removeDebuggerEventListeners() {
    if (this.debuggerDetachListener) {
      chrome.debugger.onDetach.removeListener(this.debuggerDetachListener);
      this.debuggerDetachListener = null;
    }
    if (this.tabUpdateListener) {
      chrome.tabs.onUpdated.removeListener(this.tabUpdateListener);
      this.tabUpdateListener = null;
    }
  }

  public async setActiveTabId(tabId: number) {
    if (this.activeTabId) {
      throw new Error(
        `Active tab id is already set, which is ${this.activeTabId}, cannot set it to ${tabId}`,
      );
    }
    await chrome.tabs.update(tabId, { active: true });
    this.activeTabId = tabId;
  }

  public async getActiveTabId() {
    return this.activeTabId;
  }

  /**
   * Get a list of current tabs
   * @returns {Promise<Array<{id: number, title: string, url: string}>>}
   */
  public async getBrowserTabList(): Promise<
    { id: string; title: string; url: string; currentActiveTab: boolean }[]
  > {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs
      .map((tab) => ({
        id: `${tab.id}`,
        title: tab.title,
        url: tab.url,
        currentActiveTab: tab.active,
      }))
      .filter((tab) => tab.id && tab.title && tab.url) as {
      id: string;
      title: string;
      url: string;
      currentActiveTab: boolean;
    }[];
  }

  public async getTabIdOrConnectToCurrentTab() {
    if (this.activeTabId) {
      // alway keep on the connected tab
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
      let error: Error | null = null;
      if (url.startsWith('chrome://')) {
        throw new Error(
          'Cannot attach debugger to chrome:// pages, please use Midscene in a normal page with http://, https:// or file://',
        );
      }

      try {
        const currentTabId = await this.getTabIdOrConnectToCurrentTab();

        // Check if debugger is actually attached (not just relying on cached state)
        if (
          this.tabIdOfDebuggerAttached === currentTabId &&
          this.isDebuggerAttached
        ) {
          // Verify the debugger is still attached
          try {
            await chrome.debugger.sendCommand(
              { tabId: currentTabId },
              'Runtime.evaluate',
              { expression: '1+1', returnByValue: true },
            );
            // If we get here, debugger is still attached
            return;
          } catch (e) {
            // Debugger was detached, update state
            console.log('Debugger appears detached, will reattach');
            this.isDebuggerAttached = false;
            this.tabIdOfDebuggerAttached = null;
          }
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
        try {
          await chrome.debugger.attach({ tabId: currentTabId }, '1.3');
          this.isDebuggerAttached = true;
          this.debuggerDetachReason = null;
          this.pendingReattach = false;
        } catch (e) {
          if (this._continueWhenFailedToAttachDebugger) {
            console.warn(
              'Failed to attach debugger, but the script will continue as if the debugger is attached since the _continueWhenFailedToAttachDebugger is true',
              e,
            );
          } else {
            throw e;
          }
        }

        // wait util the debugger banner in Chrome appears
        await sleep(500);

        this.tabIdOfDebuggerAttached = currentTabId;

        await this.enableWaterFlowAnimation();
      } catch (e) {
        console.error('Failed to attach debugger', e);
        this.isDebuggerAttached = false;
        error = e as Error;
      } finally {
        this.attachingDebugger = null;
      }
      if (error) {
        throw error;
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

    try {
      await this.disableWaterFlowAnimation(tabIdToDetach);
      await sleep(200); // wait for the animation to stop
    } catch (error) {
      console.warn('Failed to disable water flow animation', error);
    }

    try {
      await chrome.debugger.detach({ tabId: tabIdToDetach });
    } catch (error) {
      // maybe tab is closed ?
      console.warn('Failed to detach debugger', error);
    }
    this.tabIdOfDebuggerAttached = null;
    this.isDebuggerAttached = false;
    this.debuggerDetachReason = null;
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
    retryCount = 0,
  ): Promise<ResponseType> {
    const MAX_RETRIES = 2;

    await this.attachDebugger();

    assert(this.tabIdOfDebuggerAttached, 'Debugger is not attached');

    // wo don't have to await it
    this.enableWaterFlowAnimation();

    try {
      return (await chrome.debugger.sendCommand(
        { tabId: this.tabIdOfDebuggerAttached! },
        command,
        params as any,
      )) as ResponseType;
    } catch (error) {
      const errorMessage = (error as Error)?.message || String(error);

      // Check if debugger was detached
      if (
        errorMessage.includes('Debugger is not attached') ||
        errorMessage.includes('Cannot access') ||
        errorMessage.includes('No target with given id')
      ) {
        console.warn(
          `Debugger command failed (${command}):`,
          errorMessage,
          `Retry: ${retryCount}/${MAX_RETRIES}`,
        );

        // Reset state and retry
        this.isDebuggerAttached = false;
        this.tabIdOfDebuggerAttached = null;

        if (retryCount < MAX_RETRIES) {
          // Wait a bit and retry
          await sleep(500);
          return this.sendCommandToDebugger<ResponseType, RequestType>(
            command,
            params,
            retryCount + 1,
          );
        }
      }

      throw error;
    }
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
      const tree = (
        window as any
      ).midscene_element_inspector.webExtractNodeTree();

      return {
        tree,
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

    return returnValue.result.value as {
      tree: ElementTreeNode<ElementInfo>;
      size: Size;
    };
  }

  public async evaluateJavaScript(script: string) {
    return this.sendCommandToDebugger('Runtime.evaluate', {
      expression: script,
      awaitPromise: true,
    });
  }

  async beforeInvokeAction(): Promise<void> {
    // current implementation is wait until domReadyState is complete
    try {
      await this.waitUntilNetworkIdle();
    } catch (error) {
      // console.warn('Failed to wait until network idle', error);
    }
  }

  private async waitUntilNetworkIdle() {
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

  // @deprecated
  async getElementsInfo() {
    const tree = await this.getElementsNodeTree();
    return treeToList(tree);
  }

  async getXpathsByPoint(point: Point, isOrderSensitive = false) {
    const script = await getHtmlElementScript();

    await this.sendCommandToDebugger<
      CDPTypes.Runtime.EvaluateResponse,
      CDPTypes.Runtime.EvaluateRequest
    >('Runtime.evaluate', {
      expression: script,
    });

    const result = await this.sendCommandToDebugger('Runtime.evaluate', {
      expression: `window.midscene_element_inspector.getXpathsByPoint({left: ${point.left}, top: ${point.top}}, ${isOrderSensitive})`,
      returnByValue: true,
    });
    return result.result.value;
  }

  async getElementInfoByXpath(xpath: string) {
    const script = await getHtmlElementScript();

    // check tab url
    await this.sendCommandToDebugger<
      CDPTypes.Runtime.EvaluateResponse,
      CDPTypes.Runtime.EvaluateRequest
    >('Runtime.evaluate', {
      expression: script,
    });
    const result = await this.sendCommandToDebugger('Runtime.evaluate', {
      expression: `window.midscene_element_inspector.getElementInfoByXpath(${JSON.stringify(xpath)})`,
      returnByValue: true,
    });
    return result.result.value;
  }

  async getElementsNodeTree() {
    await this.hideMousePointer();
    const content = await this.getPageContentByCDP();
    if (content?.size) {
      this.viewportSize = content.size;
    }

    return content?.tree || { node: null, children: [] };
  }

  async getContext(): Promise<UIContext> {
    return await WebPageContextParser(this, {});
  }

  async size() {
    if (this.viewportSize) return this.viewportSize;
    const content = await this.getPageContentByCDP();
    return content.size;
  }

  async screenshotBase64() {
    // screenshot by cdp
    await this.hideMousePointer();
    const format = 'jpeg';
    const base64 = await this.sendCommandToDebugger('Page.captureScreenshot', {
      format,
      quality: 90,
    });
    return createImgBase64ByFormat(format, base64.data);
  }

  async url() {
    const tabId = await this.getTabIdOrConnectToCurrentTab();
    const url = await chrome.tabs.get(tabId).then((tab) => tab.url);
    return url || '';
  }

  async navigate(url: string): Promise<void> {
    const tabId = await this.getTabIdOrConnectToCurrentTab();

    // Mark that we expect the debugger to potentially detach during navigation
    const wasAttached = this.isDebuggerAttached;

    // If debugger was attached, mark for potential reattachment
    // The tab update listener will handle the actual reattachment
    if (wasAttached) {
      this.pendingReattach = true;
    }

    await chrome.tabs.update(tabId, { url });
    // Wait for navigation to complete
    await this.waitUntilNetworkIdle();
  }

  async reload(): Promise<void> {
    const tabId = await this.getTabIdOrConnectToCurrentTab();
    await chrome.tabs.reload(tabId);
    // Wait for reload to complete
    await this.waitUntilNetworkIdle();
  }

  async goBack(): Promise<void> {
    const tabId = await this.getTabIdOrConnectToCurrentTab();
    await chrome.tabs.goBack(tabId);
    // Wait for navigation to complete
    await this.waitUntilNetworkIdle();
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

  private latestMouseX = 100;
  private latestMouseY = 100;

  mouse = {
    click: async (
      x: number,
      y: number,
      options?: { button?: MouseButton; count?: number },
    ) => {
      const { button = 'left', count = 1 } = options || {};
      await this.mouse.move(x, y);
      // detect if the page is in mobile emulation mode
      if (this.isMobileEmulation === null) {
        const result = await this.sendCommandToDebugger('Runtime.evaluate', {
          expression: `(() => {
            return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
          })()`,
          returnByValue: true,
        });
        this.isMobileEmulation = result?.result?.value;
      }

      if (this.isMobileEmulation && button === 'left') {
        // in mobile emulation mode, directly inject click event
        const touchPoints = [{ x: Math.round(x), y: Math.round(y) }];
        await this.sendCommandToDebugger('Input.dispatchTouchEvent', {
          type: 'touchStart',
          touchPoints,
          modifiers: 0,
        });

        await this.sendCommandToDebugger('Input.dispatchTouchEvent', {
          type: 'touchEnd',
          touchPoints: [],
          modifiers: 0,
        });
      } else {
        // standard mousePressed + mouseReleased
        for (let i = 0; i < count; i++) {
          await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
            type: 'mousePressed',
            x,
            y,
            button,
            clickCount: 1,
          });
          await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
            type: 'mouseReleased',
            x,
            y,
            button,
            clickCount: 1,
          });
          await sleep(50);
        }
      }
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

      await sleep(200);
      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: from.x,
        y: from.y,
        button: 'left',
        clickCount: 1,
      });

      await sleep(300);

      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mouseMoved',
        x: to.x,
        y: to.y,
      });

      await sleep(500);

      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: to.x,
        y: to.y,
        button: 'left',
        clickCount: 1,
      });

      await sleep(200);

      await this.mouse.move(to.x, to.y);
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
        | { key: KeyInput; command?: string }
        | { key: KeyInput; command?: string }[],
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
    this.pendingReattach = false;
    this.removeDebuggerEventListeners();
    await this.detachDebugger();
    this.destroyed = true;
  }

  async longPress(x: number, y: number, duration?: number) {
    duration = duration || 500;
    const LONG_PRESS_THRESHOLD = 600;
    const MIN_PRESS_THRESHOLD = 300;
    if (duration > LONG_PRESS_THRESHOLD) {
      duration = LONG_PRESS_THRESHOLD;
    }
    if (duration < MIN_PRESS_THRESHOLD) {
      duration = MIN_PRESS_THRESHOLD;
    }
    await this.mouse.move(x, y);

    if (this.isMobileEmulation === null) {
      const result = await this.sendCommandToDebugger('Runtime.evaluate', {
        expression: `(() => {
          return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        })()`,
        returnByValue: true,
      });
      this.isMobileEmulation = result?.result?.value;
    }

    if (this.isMobileEmulation) {
      const touchPoints = [{ x: Math.round(x), y: Math.round(y) }];
      await this.sendCommandToDebugger('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints,
        modifiers: 0,
      });
      await new Promise((res) => setTimeout(res, duration));
      await this.sendCommandToDebugger('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
        modifiers: 0,
      });
    } else {
      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
      await new Promise((res) => setTimeout(res, duration));
      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x,
        y,
        button: 'left',
        clickCount: 1,
      });
    }
    this.latestMouseX = x;
    this.latestMouseY = y;
  }

  async swipe(
    from: { x: number; y: number },
    to: { x: number; y: number },
    duration?: number,
  ) {
    const LONG_PRESS_THRESHOLD = 500;
    const MIN_PRESS_THRESHOLD = 150;
    duration = duration || 300;
    if (duration < MIN_PRESS_THRESHOLD) {
      duration = MIN_PRESS_THRESHOLD;
    }
    if (duration > LONG_PRESS_THRESHOLD) {
      duration = LONG_PRESS_THRESHOLD;
    }

    if (this.isMobileEmulation === null) {
      const result = await this.sendCommandToDebugger('Runtime.evaluate', {
        expression: `(() => {
          return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
        })()`,
        returnByValue: true,
      });
      this.isMobileEmulation = result?.result?.value;
    }

    const steps = 30;
    const delay = duration / steps;

    if (this.isMobileEmulation) {
      await this.sendCommandToDebugger('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x: Math.round(from.x), y: Math.round(from.y) }],
        modifiers: 0,
      });

      for (let i = 1; i <= steps; i++) {
        const x = from.x + (to.x - from.x) * (i / steps);
        const y = from.y + (to.y - from.y) * (i / steps);
        await this.sendCommandToDebugger('Input.dispatchTouchEvent', {
          type: 'touchMove',
          touchPoints: [{ x: Math.round(x), y: Math.round(y) }],
          modifiers: 0,
        });
        await new Promise((res) => setTimeout(res, delay));
      }

      await this.sendCommandToDebugger('Input.dispatchTouchEvent', {
        type: 'touchEnd',
        touchPoints: [],
        modifiers: 0,
      });
    } else {
      await this.mouse.move(from.x, from.y);
      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: from.x,
        y: from.y,
        button: 'left',
        clickCount: 1,
      });

      for (let i = 1; i <= steps; i++) {
        const x = from.x + (to.x - from.x) * (i / steps);
        const y = from.y + (to.y - from.y) * (i / steps);
        await this.mouse.move(x, y);
        await new Promise((res) => setTimeout(res, delay));
      }

      await this.sendCommandToDebugger('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: to.x,
        y: to.y,
        button: 'left',
        clickCount: 1,
      });
    }

    this.latestMouseX = to.x;
    this.latestMouseY = to.y;
  }
}
