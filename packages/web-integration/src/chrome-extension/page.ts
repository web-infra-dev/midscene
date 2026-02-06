/// <reference types="chrome" />

/*
  It is used to interact with the page tab from the chrome extension.
  The page must be active when interacting with it.
*/

import { limitOpenNewTabScript } from '@/web-element';
import type {
  ElementCacheFeature,
  ElementTreeNode,
  Point,
  Rect,
  Size,
} from '@midscene/core';
import type { AbstractInterface, DeviceAction } from '@midscene/core/device';
import type { ElementInfo } from '@midscene/shared/extractor';
import { treeToList } from '@midscene/shared/extractor';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { assert } from '@midscene/shared/utils';
import type { Protocol as CDPTypes } from 'devtools-protocol';
import {
  type CacheFeatureOptions,
  type WebElementCacheFeature,
  buildRectFromElementInfo,
  judgeOrderSensitive,
  sanitizeXpaths,
} from '../common/cache-helper';
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

const debug = getDebug('web:chrome-extension:page');

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default class ChromeExtensionProxyPage implements AbstractInterface {
  interfaceType = 'chrome-extension-proxy';

  public forceSameTabNavigation: boolean;

  private viewportSize?: Size;

  private activeTabId: number | null = null;

  private destroyed = false;

  private isMobileEmulation: boolean | null = null;

  public _continueWhenFailedToAttachDebugger = false;

  constructor(forceSameTabNavigation: boolean) {
    this.forceSameTabNavigation = forceSameTabNavigation;
  }

  actionSpace(): DeviceAction[] {
    return commonWebActionsForWebPage(this);
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

  /**
   * Ensure debugger is attached to the current tab.
   * Uses lazy attach pattern - only attaches when needed.
   */
  private async ensureDebuggerAttached() {
    assert(!this.destroyed, 'Page is destroyed');

    const url = await this.url();
    if (url.startsWith('chrome://')) {
      throw new Error(
        'Cannot attach debugger to chrome:// pages, please use Midscene in a normal page with http://, https:// or file://',
      );
    }

    const tabId = await this.getTabIdOrConnectToCurrentTab();

    try {
      await chrome.debugger.attach({ tabId }, '1.3');
      console.log('Debugger attached to tab:', tabId);
    } catch (error) {
      const errorMsg = (error as Error)?.message || '';
      // Already attached is OK, we can continue
      if (errorMsg.includes('Another debugger is already attached')) {
        console.log('Debugger already attached to tab:', tabId);
        return;
      }

      if (this._continueWhenFailedToAttachDebugger) {
        console.warn(
          'Failed to attach debugger, but continuing due to _continueWhenFailedToAttachDebugger flag',
          error,
        );
        return;
      }

      throw error;
    }

    // Wait for debugger banner in Chrome to appear
    await sleep(500);

    // Enable water flow animation
    await this.enableWaterFlowAnimation();
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

  /**
   * Public method to detach debugger without destroying the page instance.
   * Useful for error recovery scenarios where we want to remove the debugger banner
   * without completely destroying the page.
   */
  public async detachDebugger(tabId?: number) {
    const tabIdToDetach = tabId || (await this.getTabIdOrConnectToCurrentTab());
    console.log('detaching debugger from tab:', tabIdToDetach);

    try {
      await this.disableWaterFlowAnimation(tabIdToDetach);
      await sleep(200); // wait for the animation to stop
    } catch (error) {
      console.warn('Failed to disable water flow animation', error);
    }

    try {
      await chrome.debugger.detach({ tabId: tabIdToDetach });
      console.log('Debugger detached successfully from tab:', tabIdToDetach);
    } catch (error) {
      // Tab might be closed or debugger already detached - this is OK
      console.warn(
        'Failed to detach debugger (may already be detached):',
        error,
      );
    }
  }

  private async enableWaterFlowAnimation() {
    const tabId = await this.getTabIdOrConnectToCurrentTab();

    // limit open page in new tab
    if (this.forceSameTabNavigation) {
      await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
        expression: limitOpenNewTabScript,
      });
    }

    const script = await injectWaterFlowAnimation();
    // we will call this function in sendCommandToDebugger, so we have to use the chrome.debugger.sendCommand
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

  /**
   * Send a command to the debugger with automatic attach and retry on detachment.
   * Uses lazy attach pattern - will automatically attach if not already attached.
   */
  private async sendCommandToDebugger<ResponseType = any, RequestType = any>(
    command: string,
    params: RequestType,
    retryCount = 0,
  ): Promise<ResponseType> {
    const MAX_RETRIES = 2;
    const tabId = await this.getTabIdOrConnectToCurrentTab();

    try {
      // Try to send command directly first
      const result = (await chrome.debugger.sendCommand(
        { tabId },
        command,
        params as any,
      )) as ResponseType;

      // Enable water flow animation after successful command (don't await)
      this.enableWaterFlowAnimation().catch((err) => {
        console.warn('Failed to enable water flow animation:', err);
      });

      return result;
    } catch (error) {
      // If command failed, check if it's because debugger is not attached
      const errorMsg = (error as Error)?.message || '';
      const isDetachError =
        errorMsg.includes('Debugger is not attached') ||
        errorMsg.includes('Cannot access a Target') ||
        errorMsg.includes('No target with given id');

      if (isDetachError && retryCount < MAX_RETRIES) {
        console.log(
          `Debugger not attached for command "${command}", attempting to attach (retry ${retryCount + 1}/${MAX_RETRIES})`,
        );

        // Try to attach and retry
        await this.ensureDebuggerAttached();

        return this.sendCommandToDebugger<ResponseType, RequestType>(
          command,
          params,
          retryCount + 1,
        );
      }

      // Not a detach error or out of retries
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

  async cacheFeatureForPoint(
    center: [number, number],
    options?: CacheFeatureOptions,
  ): Promise<ElementCacheFeature> {
    const point: Point = { left: center[0], top: center[1] };

    try {
      const isOrderSensitive = await judgeOrderSensitive(options, debug);
      const xpaths = await this.getXpathsByPoint(point, isOrderSensitive);
      return { xpaths: sanitizeXpaths(xpaths) };
    } catch (error) {
      debug('cacheFeatureForPoint failed: %O', error);
      return { xpaths: [] };
    }
  }

  async rectMatchesCacheFeature(feature: ElementCacheFeature): Promise<Rect> {
    const xpaths = sanitizeXpaths((feature as WebElementCacheFeature).xpaths);

    for (const xpath of xpaths) {
      try {
        const elementInfo = await this.getElementInfoByXpath(xpath);
        if (elementInfo?.rect) {
          return buildRectFromElementInfo(elementInfo, this.viewportSize?.dpr);
        }
      } catch (error) {
        debug('rectMatchesCacheFeature failed for xpath %s: %O', xpath, error);
      }
    }

    throw new Error(
      `No matching element rect found for cache feature (tried ${xpaths.length} xpath(s))`,
    );
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

    const result = await this.sendCommandToDebugger('Runtime.evaluate', {
      expression:
        '({width: document.documentElement.clientWidth, height: document.documentElement.clientHeight, dpr: window.devicePixelRatio})',
      returnByValue: true,
    });

    const sizeInfo: Size = result.result.value;
    console.log('sizeInfo', sizeInfo);

    this.viewportSize = sizeInfo;
    return sizeInfo;
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
    await chrome.tabs.update(tabId, { url });
    // Wait for navigation to complete
    // Note: debugger will auto-reattach on next command if detached during navigation
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
    this.destroyed = true;
    this.activeTabId = null;
    await this.detachDebugger();
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
