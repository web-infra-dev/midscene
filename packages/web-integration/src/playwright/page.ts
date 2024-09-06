import type { Page as Browser } from 'playwright';
import type { WebKeyInput } from '../common/page';
import { getExtraReturnLogic } from '../common/utils';
import type { ElementInfo } from '../extractor';
import type { AbstractPage, screenshotOptions } from '../page';
import type { MouseButton } from '../page';

export class Page implements AbstractPage {
  private browser: Browser;
  pageType = 'playwright';

  constructor(browser: Browser) {
    this.browser = browser;
  }

  async getElementInfos() {
    const captureElementSnapshot = await this.browser.evaluate(
      await getExtraReturnLogic(),
    );
    return captureElementSnapshot as ElementInfo[];
  }

  async screenshot(options: screenshotOptions = {}): Promise<Buffer> {
    const { path } = options;

    return this.browser.screenshot({
      path,
      type: 'png',
    });
  }

  url(): string {
    return this.browser.url();
  }

  get mouse() {
    return {
      click: async (x: number, y: number, options?: { button: MouseButton }) =>
        this.browser.mouse.click(x, y, { button: options?.button || 'left' }),
      wheel: async (deltaX: number, deltaY: number) =>
        this.browser.mouse.wheel(deltaX, deltaY),
      move: async (x: number, y: number) => this.browser.mouse.move(x, y),
    };
  }

  get keyboard() {
    return {
      type: async (text: string) => this.browser.keyboard.type(text),
      press: async (key: WebKeyInput) => this.browser.keyboard.press(key),
    };
  }

  async clearInput(element: ElementInfo): Promise<void> {
    if (!element) {
      return;
    }

    await this.mouse.click(element.center[0], element.center[1]);

    const isMac = process.platform === 'darwin';
    if (isMac) {
      await this.browser.keyboard.down('Meta');
      await this.browser.keyboard.press('a');
      await this.browser.keyboard.up('Meta');
    } else {
      await this.browser.keyboard.down('Control');
      await this.browser.keyboard.press('a');
      await this.browser.keyboard.up('Control');
    }
    await this.keyboard.press('Backspace');
  }

  scrollUntilTop(): Promise<void> {
    return this.browser.mouse.wheel(0, -9999999);
  }
  scrollUntilBottom(): Promise<void> {
    return this.browser.mouse.wheel(0, 9999999);
  }
  async scrollUpOneScreen(): Promise<void> {
    const innerHeight = await this.browser.evaluate(() => window.innerHeight);

    return this.browser.mouse.wheel(0, -innerHeight);
  }
  async scrollDownOneScreen(): Promise<void> {
    const innerHeight = await this.browser.evaluate(() => window.innerHeight);

    return this.browser.mouse.wheel(0, innerHeight);
  }
}
