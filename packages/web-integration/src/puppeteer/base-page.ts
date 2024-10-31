import { readFileSync, writeFileSync } from 'node:fs';
import { getTmpFile } from '@midscene/core/utils';
import { base64Encoded, resizeImg } from '@midscene/shared/img';
import type { Page as PlaywrightPage } from 'playwright';
import type { Page as PuppeteerPage } from 'puppeteer';
import type { WebKeyInput } from '../common/page';
import { getExtraReturnLogic } from '../common/utils';
import type { ElementInfo } from '../extractor';
import type { AbstractPage } from '../page';
import type { MouseButton } from '../page';

export class Page<
  AgentType extends 'puppeteer' | 'playwright',
  PageType extends PuppeteerPage | PlaywrightPage,
> implements AbstractPage
{
  private underlyingPage: PageType;
  pageType: AgentType;

  private evaluate<R>(
    pageFunction: string | ((...args: any[]) => R | Promise<R>),
    arg?: any,
  ): Promise<R> {
    if (this.pageType === 'puppeteer') {
      return (this.underlyingPage as PuppeteerPage).evaluate(pageFunction, arg);
    }
    return (this.underlyingPage as PlaywrightPage).evaluate(pageFunction, arg);
  }

  constructor(underlyingPage: PageType, pageType: AgentType) {
    this.underlyingPage = underlyingPage;
    this.pageType = pageType;
  }

  async getElementInfos() {
    const scripts = await getExtraReturnLogic();
    const captureElementSnapshot = await this.evaluate(scripts);
    return captureElementSnapshot as ElementInfo[];
  }

  async screenshotBase64(): Promise<string> {
    // get viewport size from underlyingPage
    const viewportSize: {
      width: number;
      height: number;
      deviceScaleFactor: number;
    } = await this.evaluate(() => {
      return {
        width: document.documentElement.clientWidth,
        height: document.documentElement.clientHeight,
        deviceScaleFactor: window.devicePixelRatio,
      };
    });

    const path = getTmpFile('png')!;

    await this.underlyingPage.screenshot({
      path,
      type: 'png',
    });
    let buf: Buffer;
    if (viewportSize.deviceScaleFactor > 1) {
      buf = await resizeImg(readFileSync(path), {
        width: viewportSize.width,
        height: viewportSize.height,
      });
      writeFileSync(path, buf);
    }

    return base64Encoded(path, true);
  }

  url(): string {
    return this.underlyingPage.url();
  }

  get mouse() {
    return {
      click: async (x: number, y: number, options?: { button: MouseButton }) =>
        this.underlyingPage.mouse.click(x, y, {
          button: options?.button || 'left',
        }),
      wheel: async (deltaX: number, deltaY: number) => {
        if (this.pageType === 'puppeteer') {
          await (this.underlyingPage as PuppeteerPage).mouse.wheel({
            deltaX,
            deltaY,
          });
        } else if (this.pageType === 'playwright') {
          await (this.underlyingPage as PlaywrightPage).mouse.wheel(
            deltaX,
            deltaY,
          );
        }
      },
      move: async (x: number, y: number) =>
        this.underlyingPage.mouse.move(x, y),
    };
  }

  get keyboard() {
    return {
      type: async (text: string) => this.underlyingPage.keyboard.type(text),
      press: async (key: WebKeyInput) =>
        this.underlyingPage.keyboard.press(key),
      down: async (key: WebKeyInput) => this.underlyingPage.keyboard.down(key),
      up: async (key: WebKeyInput) => this.underlyingPage.keyboard.up(key),
    };
  }

  async clearInput(element: ElementInfo): Promise<void> {
    if (!element) {
      return;
    }

    await this.mouse.click(element.center[0], element.center[1]);

    const isMac = process.platform === 'darwin';
    if (isMac) {
      await this.underlyingPage.keyboard.down('Meta');
      await this.underlyingPage.keyboard.press('a');
      await this.underlyingPage.keyboard.up('Meta');
    } else {
      await this.underlyingPage.keyboard.down('Control');
      await this.underlyingPage.keyboard.press('a');
      await this.underlyingPage.keyboard.up('Control');
    }
    await this.keyboard.press('Backspace');
  }

  scrollUntilTop(): Promise<void> {
    return this.mouse.wheel(0, -9999999);
  }
  scrollUntilBottom(): Promise<void> {
    return this.mouse.wheel(0, 9999999);
  }

  async scrollUpOneScreen(): Promise<void> {
    const innerHeight = await this.evaluate(() => window.innerHeight);
    const distance = innerHeight * 0.7;
    await this.mouse.wheel(0, -distance);
  }
  async scrollDownOneScreen(): Promise<void> {
    const innerHeight = await this.evaluate(() => window.innerHeight);
    const distance = innerHeight * 0.7;
    await this.mouse.wheel(0, distance);
  }
}
