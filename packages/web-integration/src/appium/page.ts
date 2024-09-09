import fs from 'node:fs';
import { resizeImg } from '@midscene/shared/img';
import { DOMParser } from '@xmldom/xmldom';
import type { KeyInput as PuppeteerKeyInput } from 'puppeteer';
import type { Browser } from 'webdriverio';
import { type ElementInfo, clientExtractTextWithPosition } from '../extractor';
import type { AbstractPage, MouseButton, screenshotOptions } from '../page';

type WebKeyInput = PuppeteerKeyInput;

function buttonToNumber(button: MouseButton): number {
  return button === 'left' ? 0 : button === 'middle' ? 1 : 2;
}

export class Page implements AbstractPage {
  private browser: Browser;
  pageType = 'appium';

  constructor(browser: Browser) {
    this.browser = browser;
  }

  async getElementInfos() {
    const pageSource = await this.browser.getPageSource();
    const { width, height } = await this.browser.getWindowSize();
    const parser = new DOMParser();
    const doc = parser.parseFromString(pageSource, 'text/xml');
    const infos = clientExtractTextWithPosition(doc).filter(
      (element) =>
        element.rect.height !== height &&
        element.rect.width !== width &&
        element.rect.left !== 0 &&
        element.rect.top !== 0 &&
        element.attributes.visible === 'true',
    );

    return infos;
  }

  async screenshot(options: screenshotOptions): Promise<void> {
    if (!options.path) {
      throw new Error('path is required for screenshot');
    }

    const { width, height } = await this.browser.getWindowSize();
    const screenshotBuffer = await this.browser.saveScreenshot(options.path);
    const resizedScreenshotBuffer = await resizeImg(screenshotBuffer, {
      width,
      height,
    });

    if (options.path) {
      fs.writeFileSync(options.path, resizedScreenshotBuffer);
    }
  }

  get mouse() {
    return {
      click: (x: number, y: number, options?: { button: MouseButton }) =>
        this.mouseClick(x, y, options?.button || 'left'),
      wheel: (deltaX: number, deltaY: number) =>
        this.mouseWheel(deltaX, deltaY),
      move: (x: number, y: number) => this.mouseMove(x, y),
    };
  }

  // Object that includes keyboard and mouse operations
  get keyboard() {
    return {
      type: (text: string) => this.keyboardType(text),
      press: (key: WebKeyInput) => this.keyboardPress(key),
    };
  }

  async clearInput(element: ElementInfo): Promise<void> {
    if (!element) {
      return;
    }

    const ele = await this.browser.$(element.locator);
    const blank = ' ';
    await this.keyboardType(blank);
    await ele.clearValue();
  }

  url(): string {
    const platformName = this.browser.capabilities.platformName?.toLowerCase();

    if (platformName === 'ios') {
      const bundleId = (this.browser.capabilities as { bundleId: string })
        .bundleId;
      return bundleId;
    }

    if (platformName === 'android') {
      const appActivity = (this.browser.capabilities as { appActivity: string })
        .appActivity;
      return appActivity;
    }

    return '';
  }

  // Scroll to top element
  async scrollUntilTop(): Promise<void> {
    const { height } = await this.browser.getWindowSize();

    await this.mouseWheel(0, height, 100);
  }

  // Scroll to bottom element
  async scrollUntilBottom(): Promise<void> {
    const { height } = await this.browser.getWindowSize();

    await this.mouseWheel(0, -height, 100);
  }

  // Scroll up one screen
  async scrollUpOneScreen(): Promise<void> {
    const { height } = await this.browser.getWindowSize();

    await this.mouseWheel(0, height, 1000);
  }

  // Scroll down one screen
  async scrollDownOneScreen(): Promise<void> {
    const { height } = await this.browser.getWindowSize();

    await this.mouseWheel(0, -height, 1000);
  }

  private async keyboardType(text: string): Promise<void> {
    const actions = [];

    for (const char of text) {
      actions.push({ type: 'keyDown', value: char });
      actions.push({ type: 'keyUp', value: char });
    }

    if (!actions.length) {
      return;
    }

    await this.browser.performActions([
      {
        type: 'key',
        id: 'keyboard',
        actions: actions,
      },
    ]);
  }

  private async keyboardPress(key: WebKeyInput): Promise<void> {
    await this.browser.performActions([
      {
        type: 'key',
        id: 'keyboard',
        actions: [
          { type: 'keyDown', value: key },
          { type: 'keyUp', value: key },
        ],
      },
    ]);
  }

  private async mouseClick(
    x: number,
    y: number,
    button: MouseButton = 'left',
  ): Promise<void> {
    await this.mouseMove(x, y);
    await this.browser.performActions([
      {
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', duration: 0, x, y },
          { type: 'pointerDown', button: buttonToNumber(button) },
          { type: 'pause', duration: 100 },
          { type: 'pointerUp', button: buttonToNumber(button) },
        ],
      },
    ]);
  }

  private async mouseMove(x: number, y: number): Promise<void> {
    await this.browser.performActions([
      {
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions: [{ type: 'pointerMove', duration: 0, x, y }],
      },
    ]);
  }

  private async mouseWheel(
    deltaX: number,
    deltaY: number,
    duration = 1000,
  ): Promise<void> {
    const n = 4;
    // Get the size of the window
    const windowSize = await this.browser.getWindowSize();

    // Set the starting point based on the sign of deltaX and deltaY
    const startX =
      deltaX < 0 ? (n - 1) * (windowSize.width / n) : windowSize.width / n;
    const startY =
      deltaY < 0 ? (n - 1) * (windowSize.height / n) : windowSize.height / n;

    // Calculate the maximum allowable offset for non-symmetry
    const maxNegativeDeltaX = startX; // Maximum offset on the left
    const maxPositiveDeltaX = (n - 1) * (windowSize.width / n); // Maximum offset on the right

    const maxNegativeDeltaY = startY; // Maximum offset on the top
    const maxPositiveDeltaY = (n - 1) * (windowSize.height / n); // Maximum offset on the bottom

    // Limit the absolute value of deltaX and deltaY within the maximum offset
    deltaX = Math.max(-maxNegativeDeltaX, Math.min(deltaX, maxPositiveDeltaX));
    deltaY = Math.max(-maxNegativeDeltaY, Math.min(deltaY, maxPositiveDeltaY));

    await this.browser.performActions([
      {
        type: 'pointer',
        id: 'finger1',
        parameters: { pointerType: 'touch' },
        actions: [
          { type: 'pointerMove', duration: 0, x: startX, y: startY },
          { type: 'pointerDown', button: 0 },
          { type: 'pause', duration },
          {
            type: 'pointerMove',
            duration,
            origin: 'pointer', // Use 'pointer' as the starting point
            x: deltaX, // X offset relative to the starting point
            y: deltaY, // Y offset relative to the starting point
          },
          { type: 'pointerUp', button: 0 },
        ],
      },
    ]);
  }
}
