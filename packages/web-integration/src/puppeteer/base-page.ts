import type { WebPageAgentOpt } from '@/web-element';
import type {
  DeviceAction,
  ElementCacheFeature,
  ElementTreeNode,
  Point,
  Rect,
  Size,
} from '@midscene/core';
import type { AbstractInterface } from '@midscene/core/device';
import { sleep } from '@midscene/core/utils';
import {
  DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY,
  DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT,
} from '@midscene/shared/constants';
import type { ElementInfo } from '@midscene/shared/extractor';
import { treeToList } from '@midscene/shared/extractor';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { type DebugFunction, getDebug } from '@midscene/shared/logger';
import {
  getElementInfosScriptContent,
  getExtraReturnLogic,
} from '@midscene/shared/node';
import { assert } from '@midscene/shared/utils';
import type { Page as PlaywrightPage } from 'playwright';
import type { CDPSession, Protocol, Page as PuppeteerPage } from 'puppeteer';
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

export const debugPage = getDebug('web:page');

export class Page<
  AgentType extends 'puppeteer' | 'playwright',
  InterfaceType extends PuppeteerPage | PlaywrightPage,
> implements AbstractInterface
{
  underlyingPage: InterfaceType;
  protected waitForNavigationTimeout: number;
  protected waitForNetworkIdleTimeout: number;
  private viewportSize?: Size;
  private onBeforeInvokeAction?: AbstractInterface['beforeInvokeAction'];
  private onAfterInvokeAction?: AbstractInterface['afterInvokeAction'];
  private customActions?: DeviceAction<any>[];
  private enableTouchEventsInActionSpace: boolean;
  private puppeteerFileChooserSession?: CDPSession;
  private puppeteerFileChooserHandler?: (
    event: Protocol.Page.FileChooserOpenedEvent,
  ) => Promise<void>;
  interfaceType: AgentType;

  actionSpace(): DeviceAction[] {
    const defaultActions = commonWebActionsForWebPage(
      this,
      this.enableTouchEventsInActionSpace,
    );
    const customActions = this.customActions || [];
    return [...defaultActions, ...customActions];
  }

  private async evaluate<R>(
    pageFunction: string | ((...args: any[]) => R | Promise<R>),
    arg?: any,
  ): Promise<R> {
    let result: R;
    debugPage('evaluate function begin');
    if (this.interfaceType === 'puppeteer') {
      result = await (this.underlyingPage as PuppeteerPage).evaluate(
        pageFunction,
        arg,
      );
    } else {
      result = await (this.underlyingPage as PlaywrightPage).evaluate(
        pageFunction,
        arg,
      );
    }
    debugPage('evaluate function end');
    return result;
  }

  constructor(
    underlyingPage: InterfaceType,
    interfaceType: AgentType,
    opts?: WebPageAgentOpt,
  ) {
    this.underlyingPage = underlyingPage;
    this.interfaceType = interfaceType;
    this.waitForNavigationTimeout =
      opts?.waitForNavigationTimeout ?? DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT;
    this.waitForNetworkIdleTimeout =
      opts?.waitForNetworkIdleTimeout ?? DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT;
    this.onBeforeInvokeAction = opts?.beforeInvokeAction;
    this.onAfterInvokeAction = opts?.afterInvokeAction;
    this.customActions = opts?.customActions;
    this.enableTouchEventsInActionSpace =
      opts?.enableTouchEventsInActionSpace ?? false;
  }

  async evaluateJavaScript<T = any>(script: string): Promise<T> {
    return this.evaluate(script);
  }

  async waitForNavigation() {
    if (this.waitForNavigationTimeout === 0) {
      debugPage('waitForNavigation timeout is 0, skip waiting');
      return;
    }

    // issue: https://github.com/puppeteer/puppeteer/issues/3323
    if (
      this.interfaceType === 'puppeteer' ||
      this.interfaceType === 'playwright'
    ) {
      debugPage('waitForNavigation begin');
      debugPage(`waitForNavigation timeout: ${this.waitForNavigationTimeout}`);
      try {
        await (this.underlyingPage as PuppeteerPage).waitForSelector('html', {
          timeout: this.waitForNavigationTimeout,
        });
      } catch (error) {
        // Ignore timeout error, continue execution
        console.warn(
          '[midscene:warning] Waiting for the "navigation" has timed out, but Midscene will continue execution. Please check https://midscenejs.com/faq.html#customize-the-network-timeout for more information on customizing the network timeout',
        );
      }
      debugPage('waitForNavigation end');
    }
  }

  async waitForNetworkIdle(): Promise<void> {
    if (this.interfaceType === 'puppeteer') {
      if (this.waitForNetworkIdleTimeout === 0) {
        debugPage('waitForNetworkIdle timeout is 0, skip waiting');
        return;
      }

      try {
        await (this.underlyingPage as PuppeteerPage).waitForNetworkIdle({
          idleTime: 200,
          concurrency: DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY,
          timeout: this.waitForNetworkIdleTimeout,
        });
      } catch (error) {
        // Ignore timeout error, continue execution
        console.warn(
          '[midscene:warning] Waiting for the "network idle" has timed out, but Midscene will continue execution. Please check https://midscenejs.com/faq.html#customize-the-network-timeout for more information on customizing the network timeout',
        );
      }
    } else {
      // TODO: implement playwright waitForNetworkIdle
    }
  }

  // @deprecated
  async getElementsInfo() {
    // const scripts = await getExtraReturnLogic();
    // const captureElementSnapshot = await this.evaluate(scripts);
    // return captureElementSnapshot as ElementInfo[];
    await this.waitForNavigation();
    debugPage('getElementsInfo begin');
    const tree = await this.getElementsNodeTree();
    debugPage('getElementsInfo end');
    return treeToList(tree);
  }

  private async getXpathsByPoint(point: Point, isOrderSensitive: boolean) {
    const elementInfosScriptContent = getElementInfosScriptContent();

    return this.evaluateJavaScript(
      `${elementInfosScriptContent}midscene_element_inspector.getXpathsByPoint({left: ${point.left}, top: ${point.top}}, ${isOrderSensitive})`,
    );
  }

  private async getElementInfoByXpath(xpath: string) {
    const elementInfosScriptContent = getElementInfosScriptContent();

    return this.evaluateJavaScript(
      `${elementInfosScriptContent}midscene_element_inspector.getElementInfoByXpath(${JSON.stringify(xpath)})`,
    );
  }

  async cacheFeatureForPoint(
    center: [number, number],
    options?: CacheFeatureOptions,
  ): Promise<ElementCacheFeature> {
    const point: Point = { left: center[0], top: center[1] };

    try {
      const isOrderSensitive = await judgeOrderSensitive(options, debugPage);
      const xpaths = await this.getXpathsByPoint(point, isOrderSensitive);
      const sanitized = sanitizeXpaths(xpaths);
      if (!sanitized.length) {
        debugPage('cacheFeatureForPoint: no xpath found at point %o', center);
      }
      return { xpaths: sanitized };
    } catch (error) {
      debugPage('cacheFeatureForPoint failed: %s', error);
      return { xpaths: [] };
    }
  }

  async rectMatchesCacheFeature(feature: ElementCacheFeature): Promise<Rect> {
    const xpaths = sanitizeXpaths((feature as WebElementCacheFeature).xpaths);
    debugPage('rectMatchesCacheFeature: trying %d xpath(s)', xpaths.length);

    for (const xpath of xpaths) {
      try {
        debugPage('rectMatchesCacheFeature: evaluating xpath: %s', xpath);
        const elementInfo = await this.getElementInfoByXpath(xpath);
        if (elementInfo?.rect) {
          debugPage(
            'rectMatchesCacheFeature: found element, rect: %o',
            elementInfo.rect,
          );
          return buildRectFromElementInfo(elementInfo, this.viewportSize?.dpr);
        }
        debugPage(
          'rectMatchesCacheFeature: element found but no rect (elementInfo: %o)',
          elementInfo,
        );
      } catch (error) {
        debugPage(
          'rectMatchesCacheFeature failed for xpath %s: %s',
          xpath,
          error,
        );
      }
    }

    throw new Error(
      `No matching element rect found for the provided cache feature (tried ${xpaths.length} xpath(s): ${xpaths.join(', ')})`,
    );
  }

  async getElementsNodeTree() {
    // ref: packages/web-integration/src/playwright/ai-fixture.ts popup logic
    // During test execution, a new page might be opened through a connection, and the page remains confined to the same page instance.
    // The page may go through opening, closing, and reopening; if the page is closed, evaluate may return undefined, which can lead to errors.
    await this.waitForNavigation();
    const scripts = await getExtraReturnLogic(true);
    assert(scripts, 'scripts should be set before writing report in browser');
    const startTime = Date.now();
    const captureElementSnapshot = await this.evaluate(scripts);
    const endTime = Date.now();
    debugPage(`getElementsNodeTree end, cost: ${endTime - startTime}ms`);
    return captureElementSnapshot as ElementTreeNode<ElementInfo>;
  }

  async size(): Promise<Size> {
    if (this.viewportSize) return this.viewportSize;
    const sizeInfo: Size = await this.evaluate(() => {
      return {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
        dpr: window.devicePixelRatio,
      };
    });
    this.viewportSize = sizeInfo;
    return sizeInfo;
  }

  async screenshotBase64(): Promise<string> {
    const imgType = 'jpeg';
    const quality = 90;
    await this.waitForNavigation();
    const startTime = Date.now();
    debugPage('screenshotBase64 begin');

    let base64: string;
    if (this.interfaceType === 'puppeteer') {
      const result = await (this.underlyingPage as PuppeteerPage).screenshot({
        type: imgType,
        quality,
        encoding: 'base64',
      });
      base64 = createImgBase64ByFormat(imgType, result);
    } else if (this.interfaceType === 'playwright') {
      const buffer = await (this.underlyingPage as PlaywrightPage).screenshot({
        type: imgType,
        quality,
        timeout: 10 * 1000,
      });
      base64 = createImgBase64ByFormat(imgType, buffer.toString('base64'));
    } else {
      throw new Error('Unsupported page type for screenshot');
    }
    const endTime = Date.now();
    debugPage(`screenshotBase64 end, cost: ${endTime - startTime}ms`);
    return base64;
  }

  async url(): Promise<string> {
    return this.underlyingPage.url();
  }

  describe(): string {
    const url = this.underlyingPage.url();
    return url || '';
  }

  get mouse() {
    return {
      click: async (
        x: number,
        y: number,
        options?: { button?: MouseButton; count?: number },
      ) => {
        await this.mouse.move(x, y);
        const { button = 'left', count = 1 } = options || {};
        debugPage(`mouse click ${x}, ${y}, ${button}, ${count}`);

        if (count === 2 && this.interfaceType === 'playwright') {
          await (this.underlyingPage as PlaywrightPage).mouse.dblclick(x, y, {
            button,
          });
        } else if (this.interfaceType === 'puppeteer') {
          const page = this.underlyingPage as PuppeteerPage;
          if (button === 'left' && count === 1) {
            await page.mouse.click(x, y);
          } else {
            await page.mouse.click(x, y, { button, count });
          }
        } else if (this.interfaceType === 'playwright') {
          await (this.underlyingPage as PlaywrightPage).mouse.click(x, y, {
            button,
            clickCount: count,
          });
        }
      },
      wheel: async (deltaX: number, deltaY: number) => {
        debugPage(`mouse wheel ${deltaX}, ${deltaY}`);
        if (this.interfaceType === 'puppeteer') {
          await (this.underlyingPage as PuppeteerPage).mouse.wheel({
            deltaX,
            deltaY,
          });
        } else if (this.interfaceType === 'playwright') {
          await (this.underlyingPage as PlaywrightPage).mouse.wheel(
            deltaX,
            deltaY,
          );
        }
      },
      move: async (x: number, y: number) => {
        this.everMoved = true;
        debugPage(`mouse move to ${x}, ${y}`);
        return this.underlyingPage.mouse.move(x, y);
      },
      drag: async (
        from: { x: number; y: number },
        to: { x: number; y: number },
      ) => {
        debugPage(
          `begin mouse drag from ${from.x}, ${from.y} to ${to.x}, ${to.y}`,
        );
        await (this.underlyingPage as PlaywrightPage).mouse.move(
          from.x,
          from.y,
        );
        await sleep(200);
        await (this.underlyingPage as PlaywrightPage).mouse.down();
        await sleep(300);
        await (this.underlyingPage as PlaywrightPage).mouse.move(to.x, to.y, {
          steps: 20,
        });
        await sleep(500);
        await (this.underlyingPage as PlaywrightPage).mouse.up();
        await sleep(200);
        debugPage(
          `end mouse drag from ${from.x}, ${from.y} to ${to.x}, ${to.y}`,
        );
      },
    };
  }

  get keyboard() {
    return {
      type: async (text: string) => {
        debugPage(`keyboard type ${text}`);
        return this.underlyingPage.keyboard.type(text, { delay: 80 });
      },
      press: async (
        action:
          | { key: KeyInput; command?: string }
          | { key: KeyInput; command?: string }[],
      ) => {
        const keys = Array.isArray(action) ? action : [action];
        debugPage('keyboard press', keys);
        for (const k of keys) {
          const commands = k.command ? [k.command] : [];
          await this.underlyingPage.keyboard.down(k.key, { commands });
        }
        for (const k of [...keys].reverse()) {
          await this.underlyingPage.keyboard.up(k.key);
        }
      },
      down: async (key: KeyInput) => {
        debugPage(`keyboard down ${key}`);
        return this.underlyingPage.keyboard.down(key);
      },
      up: async (key: KeyInput) => {
        debugPage(`keyboard up ${key}`);
        return this.underlyingPage.keyboard.up(key);
      },
    };
  }

  async clearInput(element?: ElementInfo): Promise<void> {
    const backspace = async () => {
      await sleep(100);
      await this.keyboard.press([{ key: 'Backspace' }]);
    };

    const isMac = process.platform === 'darwin';
    debugPage('clearInput begin');
    if (isMac) {
      if (this.interfaceType === 'puppeteer') {
        // https://github.com/segment-boneyard/nightmare/issues/810#issuecomment-452669866
        element &&
          (await this.mouse.click(element.center[0], element.center[1], {
            count: 3,
          }));
        await backspace();
      }

      element && (await this.mouse.click(element.center[0], element.center[1]));
      await this.underlyingPage.keyboard.down('Meta');
      await this.underlyingPage.keyboard.press('a');
      await this.underlyingPage.keyboard.up('Meta');
      await backspace();
    } else {
      element && (await this.mouse.click(element.center[0], element.center[1]));
      await this.underlyingPage.keyboard.down('Control');
      await this.underlyingPage.keyboard.press('a');
      await this.underlyingPage.keyboard.up('Control');
      await backspace();
    }
    debugPage('clearInput end');
  }

  private everMoved = false;
  private async moveToPointBeforeScroll(point?: Point): Promise<void> {
    if (point) {
      await this.mouse.move(point.left, point.top);
    } else if (!this.everMoved) {
      // If the mouse has never moved, move it to the center of the page
      const size = await this.size();
      const targetX = Math.floor(size.width / 2);
      const targetY = Math.floor(size.height / 2);
      await this.mouse.move(targetX, targetY);
    }
  }

  async scrollUntilTop(startingPoint?: Point): Promise<void> {
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(0, -9999999);
  }

  async scrollUntilBottom(startingPoint?: Point): Promise<void> {
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(0, 9999999);
  }

  async scrollUntilLeft(startingPoint?: Point): Promise<void> {
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(-9999999, 0);
  }

  async scrollUntilRight(startingPoint?: Point): Promise<void> {
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(9999999, 0);
  }

  async scrollUp(distance?: number, startingPoint?: Point): Promise<void> {
    const innerHeight = await this.evaluate(() => window.innerHeight);
    const scrollDistance = distance || innerHeight * 0.7;
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(0, -scrollDistance);
  }

  async scrollDown(distance?: number, startingPoint?: Point): Promise<void> {
    const innerHeight = await this.evaluate(() => window.innerHeight);
    const scrollDistance = distance || innerHeight * 0.7;
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(0, scrollDistance);
  }

  async scrollLeft(distance?: number, startingPoint?: Point): Promise<void> {
    const innerWidth = await this.evaluate(() => window.innerWidth);
    const scrollDistance = distance || innerWidth * 0.7;
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(-scrollDistance, 0);
  }

  async scrollRight(distance?: number, startingPoint?: Point): Promise<void> {
    const innerWidth = await this.evaluate(() => window.innerWidth);
    const scrollDistance = distance || innerWidth * 0.7;
    await this.moveToPointBeforeScroll(startingPoint);
    return this.mouse.wheel(scrollDistance, 0);
  }

  async navigate(url: string): Promise<void> {
    debugPage(`navigate to ${url}`);
    if (this.interfaceType === 'puppeteer') {
      await (this.underlyingPage as PuppeteerPage).goto(url);
    } else if (this.interfaceType === 'playwright') {
      await (this.underlyingPage as PlaywrightPage).goto(url);
    } else {
      throw new Error('Unsupported page type for navigate');
    }
  }

  async reload(): Promise<void> {
    debugPage('reload page');
    if (this.interfaceType === 'puppeteer') {
      await (this.underlyingPage as PuppeteerPage).reload();
    } else if (this.interfaceType === 'playwright') {
      await (this.underlyingPage as PlaywrightPage).reload();
    } else {
      throw new Error('Unsupported page type for reload');
    }
  }

  async goBack(): Promise<void> {
    debugPage('go back');
    if (this.interfaceType === 'puppeteer') {
      await (this.underlyingPage as PuppeteerPage).goBack();
    } else if (this.interfaceType === 'playwright') {
      await (this.underlyingPage as PlaywrightPage).goBack();
    } else {
      throw new Error('Unsupported page type for go back');
    }
  }

  async beforeInvokeAction(name: string, param: any): Promise<void> {
    if (this.onBeforeInvokeAction) {
      await this.onBeforeInvokeAction(name, param);
    }
  }

  async afterInvokeAction(name: string, param: any): Promise<void> {
    await this.waitForNavigation();
    await this.waitForNetworkIdle();
    if (this.onAfterInvokeAction) {
      await this.onAfterInvokeAction(name, param);
    }
  }

  async destroy(): Promise<void> {}

  async swipe(
    from: { x: number; y: number },
    to: { x: number; y: number },
    duration?: number,
  ) {
    const LONG_PRESS_THRESHOLD = 500;
    const MIN_PRESS_THRESHOLD = 150;
    duration = duration || 100;
    if (duration < MIN_PRESS_THRESHOLD) {
      duration = MIN_PRESS_THRESHOLD;
    }
    if (duration > LONG_PRESS_THRESHOLD) {
      duration = LONG_PRESS_THRESHOLD;
    }
    debugPage(
      `mouse swipe from ${from.x}, ${from.y} to ${to.x}, ${to.y} with duration ${duration}ms`,
    );

    if (this.interfaceType === 'puppeteer') {
      const page = this.underlyingPage as PuppeteerPage;
      await page.mouse.move(from.x, from.y);
      await page.mouse.down({ button: 'left' });

      const steps = 30;
      const delay = duration / steps;
      for (let i = 1; i <= steps; i++) {
        const x = from.x + (to.x - from.x) * (i / steps);
        const y = from.y + (to.y - from.y) * (i / steps);
        await page.mouse.move(x, y);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      await page.mouse.up({ button: 'left' });
    } else if (this.interfaceType === 'playwright') {
      const page = this.underlyingPage as PlaywrightPage;
      await page.mouse.move(from.x, from.y);
      await page.mouse.down();

      const steps = 30;
      const delay = duration / steps;
      for (let i = 1; i <= steps; i++) {
        const x = from.x + (to.x - from.x) * (i / steps);
        const y = from.y + (to.y - from.y) * (i / steps);
        await page.mouse.move(x, y);
        await page.waitForTimeout(delay);
      }

      await page.mouse.up({ button: 'left' });
    }
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
    debugPage(`mouse longPress at ${x}, ${y} for ${duration}ms`);
    if (this.interfaceType === 'puppeteer') {
      const page = this.underlyingPage as PuppeteerPage;
      await page.mouse.move(x, y);
      await page.mouse.down({ button: 'left' });
      await new Promise((res) => setTimeout(res, duration));
      await page.mouse.up({ button: 'left' });
    } else if (this.interfaceType === 'playwright') {
      const page = this.underlyingPage as PlaywrightPage;
      await page.mouse.move(x, y);
      await page.mouse.down({ button: 'left' });
      await page.waitForTimeout(duration);
      await page.mouse.up({ button: 'left' });
    }
  }

  private async ensurePuppeteerFileChooserSession(
    page: PuppeteerPage,
  ): Promise<CDPSession> {
    if (this.puppeteerFileChooserSession) {
      return this.puppeteerFileChooserSession;
    }
    const session = await page.target().createCDPSession();
    await session.send('Page.enable');
    await session.send('DOM.enable');
    await session.send('Page.setInterceptFileChooserDialog', { enabled: true });
    this.puppeteerFileChooserSession = session;
    return session;
  }

  async registerFileChooserListener(
    handler: (
      chooser: import('@midscene/core/device').FileChooserHandler,
    ) => Promise<void>,
  ): Promise<{ dispose: () => void; getError: () => Error | undefined }> {
    if (this.interfaceType !== 'puppeteer') {
      throw new Error(
        'registerFileChooserListener is only supported in Puppeteer',
      );
    }

    const page = this.underlyingPage as PuppeteerPage;
    const session = await this.ensurePuppeteerFileChooserSession(page);
    if (this.puppeteerFileChooserHandler) {
      session.off('Page.fileChooserOpened', this.puppeteerFileChooserHandler);
    }

    let capturedError: Error | undefined;

    this.puppeteerFileChooserHandler = async (event) => {
      if (event.backendNodeId === undefined) {
        debugPage('puppeteer file chooser opened without backendNodeId, skip');
        return;
      }
      try {
        await handler({
          accept: async (files: string[]) => {
            // Get node information to check attributes
            const { node } = await session.send('DOM.describeNode', {
              backendNodeId: event.backendNodeId,
            });
            // attributes is a flat array: ['attr1', 'value1', 'attr2', 'value2', ...]

            // Check if input has webkitdirectory attribute (Puppeteer doesn't support directory upload)
            const hasWebkitDirectory =
              node.attributes?.includes('webkitdirectory') ||
              node.attributes?.includes('directory');
            if (hasWebkitDirectory) {
              throw new Error(
                'Directory upload (webkitdirectory) is not supported in Puppeteer. Please use Playwright instead, which supports directory upload since version 1.45.',
              );
            }

            // Check if input supports multiple files
            if (files.length > 1) {
              const hasMultiple = node.attributes?.includes('multiple');
              if (!hasMultiple) {
                throw new Error(
                  'Non-multiple file input can only accept single file',
                );
              }
            }
            await session.send('DOM.setFileInputFiles', {
              files,
              backendNodeId: event.backendNodeId,
            });
          },
        });
      } catch (error) {
        capturedError = error as Error;
      }
    };
    session.on('Page.fileChooserOpened', this.puppeteerFileChooserHandler);
    return {
      dispose: () => {
        if (this.puppeteerFileChooserHandler) {
          session.off(
            'Page.fileChooserOpened',
            this.puppeteerFileChooserHandler,
          );
        }
        void session.detach();
        this.puppeteerFileChooserHandler = undefined;
        if (this.puppeteerFileChooserSession === session) {
          this.puppeteerFileChooserSession = undefined;
        }
      },
      getError: () => capturedError,
    };
  }
}

export function forceClosePopup(
  page: PuppeteerPage | PlaywrightPage,
  debugProfile: DebugFunction,
) {
  page.on('popup', async (popup) => {
    if (!popup) {
      console.warn('got a popup event, but the popup is not ready yet, skip');
      return;
    }
    const url = await (popup as PuppeteerPage).url();
    console.log(`Popup opened: ${url}`);
    if (!(popup as PuppeteerPage).isClosed()) {
      try {
        await (popup as PuppeteerPage).close(); // Close the newly opened TAB
      } catch (error) {
        debugProfile(`failed to close popup ${url}, error: ${error}`);
      }
    } else {
      debugProfile(`popup is already closed, skip close ${url}`);
    }

    if (!page.isClosed()) {
      try {
        await page.goto(url);
      } catch (error) {
        debugProfile(`failed to goto ${url}, error: ${error}`);
      }
    } else {
      debugProfile(`page is already closed, skip goto ${url}`);
    }
  });
}

/**
 * Force Chrome to render select elements using base-select appearance instead of OS-native rendering.
 * This makes select elements visible in screenshots captured by Playwright/Puppeteer.
 *
 * Reference: https://developer.chrome.com/blog/a-customizable-select
 *
 * Adds a style tag with CSS rules to make all select elements use base-select appearance.
 */
export function forceChromeSelectRendering(
  page: PuppeteerPage | PlaywrightPage,
): void {
  // Force Chrome to render select elements using base-select appearance
  // Reference: https://developer.chrome.com/blog/a-customizable-select
  const styleContent = `
/* Add by Midscene because of forceChromeSelectRendering is enabled*/
select {
  &, &::picker(select) {
    appearance: base-select !important;
  }
}`;
  const styleId = 'midscene-force-select-rendering';

  const injectStyle = async () => {
    try {
      await (page as PuppeteerPage & PlaywrightPage).evaluate(
        (id, content) => {
          if (document.getElementById(id)) return;
          const style = document.createElement('style');
          style.id = id;
          style.textContent = content;
          document.head.appendChild(style);
        },
        styleId,
        styleContent,
      );
      debugPage(
        'Midscene - Added base-select appearance style for select elements because of forceChromeSelectRendering is enabled',
      );
    } catch (err) {
      console.log(
        'Midscene - Failed to add base-select appearance style:',
        err,
      );
    }
  };

  // Inject immediately for the current document
  void injectStyle();

  // Ensure the style is reapplied on future navigations/new documents
  (page as PuppeteerPage & PlaywrightPage).on('load', () => {
    void injectStyle();
  });
}
