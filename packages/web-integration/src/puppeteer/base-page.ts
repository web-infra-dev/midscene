import { type WebPageAgentOpt, WebPageContextParser } from '@/web-element';
import type {
  DeviceAction,
  ElementTreeNode,
  Point,
  Size,
  UIContext,
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
import type { Page as PuppeteerPage } from 'puppeteer';
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

  interfaceType: AgentType;

  actionSpace(): DeviceAction[] {
    return commonWebActionsForWebPage(this);
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
          '[midscene:warning] Waiting for the navigation has timed out, but Midscene will continue execution. Please check https://midscenejs.com/faq.html#customize-the-network-timeout for more information on customizing the network timeout',
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

      await (this.underlyingPage as PuppeteerPage).waitForNetworkIdle({
        idleTime: 200,
        concurrency: DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY,
        timeout: this.waitForNetworkIdleTimeout,
      });
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

  async getXpathsById(id: string) {
    const elementInfosScriptContent = getElementInfosScriptContent();

    return this.evaluateJavaScript(
      `${elementInfosScriptContent}midscene_element_inspector.getXpathsById('${id}')`,
    );
  }

  async getXpathsByPoint(point: Point, isOrderSensitive: boolean) {
    const elementInfosScriptContent = getElementInfosScriptContent();

    return this.evaluateJavaScript(
      `${elementInfosScriptContent}midscene_element_inspector.getXpathsByPoint({left: ${point.left}, top: ${point.top}}, ${isOrderSensitive})`,
    );
  }

  async getElementInfoByXpath(xpath: string) {
    const elementInfosScriptContent = getElementInfosScriptContent();

    return this.evaluateJavaScript(
      `${elementInfosScriptContent}midscene_element_inspector.getElementInfoByXpath('${xpath}')`,
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
        debugPage(`mouse click ${x}, ${y}`);
        this.underlyingPage.mouse.click(x, y, {
          button: options?.button || 'left',
          count: options?.count || 1,
        });
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
        await (this.underlyingPage as PlaywrightPage).mouse.move(to.x, to.y);
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
        this.underlyingPage.keyboard.down(key);
      },
      up: async (key: KeyInput) => {
        debugPage(`keyboard up ${key}`);
        this.underlyingPage.keyboard.up(key);
      },
    };
  }

  async clearInput(element: ElementInfo): Promise<void> {
    if (!element) {
      console.warn('No element to clear input');
      return;
    }

    const backspace = async () => {
      await sleep(100);
      await this.keyboard.press([{ key: 'Backspace' }]);
    };

    const isMac = process.platform === 'darwin';
    debugPage('clearInput begin');
    if (isMac) {
      if (this.interfaceType === 'puppeteer') {
        // https://github.com/segment-boneyard/nightmare/issues/810#issuecomment-452669866
        await this.mouse.click(element.center[0], element.center[1], {
          count: 3,
        });
        await backspace();
      }

      await this.mouse.click(element.center[0], element.center[1]);
      await this.underlyingPage.keyboard.down('Meta');
      await this.underlyingPage.keyboard.press('a');
      await this.underlyingPage.keyboard.up('Meta');
      await backspace();
    } else {
      await this.mouse.click(element.center[0], element.center[1]);
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

  async beforeInvokeAction(name: string, param: any): Promise<void> {
    await this.waitForNavigation();
    await this.waitForNetworkIdle();
    if (this.onBeforeInvokeAction) {
      await this.onBeforeInvokeAction(name, param);
    }
  }

  async afterInvokeAction(name: string, param: any): Promise<void> {
    if (this.onAfterInvokeAction) {
      await this.onAfterInvokeAction(name, param);
    }
  }

  async destroy(): Promise<void> {}

  async getContext(): Promise<UIContext> {
    return await WebPageContextParser(this, {});
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
