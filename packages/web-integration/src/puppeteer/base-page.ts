import { readFileSync, writeFileSync } from 'node:fs';
import { resizeImg } from '@midscene/shared/img';
import type { Page as PlaywrightPage } from 'playwright';
import type { Page as PuppeteerPage } from 'puppeteer';
import type { WebKeyInput } from '../common/page';
import { getExtraReturnLogic } from '../common/utils';
import type { ElementInfo } from '../extractor';
import type { AbstractPage, screenshotOptions } from '../page';
import type { MouseButton } from '../page';

export class Page<
  AgentType extends 'puppeteer' | 'playwright',
  PageType extends PuppeteerPage | PlaywrightPage,
> implements AbstractPage
{
  private page: PageType;
  pageType: AgentType;

  private evaluate<R>(
    pageFunction: string | ((...args: any[]) => R | Promise<R>),
    arg?: any,
  ): Promise<R> {
    if (this.pageType === 'puppeteer') {
      return (this.page as PuppeteerPage).evaluate(pageFunction, arg);
    }
    return (this.page as PlaywrightPage).evaluate(pageFunction, arg);
  }

  constructor(page: PageType, pageType: AgentType) {
    this.page = page;
    this.pageType = pageType;
  }

  async getElementInfos() {
    const scripts = await getExtraReturnLogic();
    const captureElementSnapshot = await this.evaluate(scripts);
    return captureElementSnapshot as ElementInfo[];
  }

  async screenshot(options: screenshotOptions): Promise<void> {
    const { path } = options;
    if (!path) {
      throw new Error('path is required for screenshot');
    }

    // get viewport size from page
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

    await this.page.screenshot({
      path,
      type: 'jpeg',
      quality: 75,
    });

    let buf: Buffer;
    console.log(viewportSize);
    if (viewportSize.deviceScaleFactor > 1) {
      buf = (await resizeImg(readFileSync(path), {
        width: viewportSize.width,
        height: viewportSize.height,
      })) as Buffer;
      writeFileSync(path, buf);
    }

    // return await this.page.screenshot({
    //   path,
    //   type: 'jpeg',
    //   quality: 75,
    //   clip: {
    //     x: 0,
    //     y: 0,
    //     width: viewportSize.width,
    //     height: viewportSize.height,
    //     scale: 1 / viewportSize.deviceScaleFactor,
    //   },
    // });
  }

  url(): string {
    return this.page.url();
  }

  get mouse() {
    return {
      click: async (x: number, y: number, options?: { button: MouseButton }) =>
        this.page.mouse.click(x, y, { button: options?.button || 'left' }),
      wheel: async (deltaX: number, deltaY: number) => {
        if (this.pageType === 'puppeteer') {
          await (this.page as PuppeteerPage).mouse.wheel({ deltaX, deltaY });
        } else if (this.pageType === 'playwright') {
          await (this.page as PlaywrightPage).mouse.wheel(deltaX, deltaY);
        }
      },
      move: async (x: number, y: number) => this.page.mouse.move(x, y),
    };
  }

  get keyboard() {
    return {
      type: async (text: string) => this.page.keyboard.type(text),
      press: async (key: WebKeyInput) => this.page.keyboard.press(key),
      down: async (key: WebKeyInput) => this.page.keyboard.down(key),
      up: async (key: WebKeyInput) => this.page.keyboard.up(key),
    };
  }

  async clearInput(element: ElementInfo): Promise<void> {
    if (!element) {
      return;
    }

    await this.mouse.click(element.center[0], element.center[1]);

    const isMac = process.platform === 'darwin';
    if (isMac) {
      await this.page.keyboard.down('Meta');
      await this.page.keyboard.press('a');
      await this.page.keyboard.up('Meta');
    } else {
      await this.page.keyboard.down('Control');
      await this.page.keyboard.press('a');
      await this.page.keyboard.up('Control');
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
