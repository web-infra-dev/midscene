import fs from 'node:fs';
import type { Point, Size } from '@midscene/core';
import { getTmpFile } from '@midscene/core/utils';
import {
  type ElementInfo,
  clientExtractTextWithPosition,
} from '@midscene/shared/extractor';
import { base64Encoded, resizeImg } from '@midscene/shared/img';
import { DOMParser } from '@xmldom/xmldom';
import type { KeyInput as PuppeteerKeyInput } from 'puppeteer';
import type { Browser } from 'webdriverio';
import type { AbstractPage, MouseButton } from '../page';

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

  async getElementsInfo() {
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

  async getElementsNodeTree(): Promise<any> {
    throw new Error('Not implemented');
  }

  async size(): Promise<Size> {
    return this.browser.getWindowSize();
  }

  async screenshotBase64(): Promise<string> {
    const { width, height } = await this.size();
    const path = getTmpFile('png')!;
    const screenshotBuffer = await this.browser.saveScreenshot(path);
    const resizedScreenshotBuffer = await resizeImg(screenshotBuffer, {
      width,
      height,
    });
    fs.writeFileSync(path, resizedScreenshotBuffer);

    return base64Encoded(path);
  }

  get mouse() {
    return {
      click: (x: number, y: number, options?: { button: MouseButton }) =>
        this.mouseClick(x, y, options?.button || 'left'),
      wheel: (deltaX: number, deltaY: number) =>
        this.mouseWheel(deltaX, deltaY),
      move: (x: number, y: number) => this.mouseMove(x, y),
      drag: (from: { x: number; y: number }, to: { x: number; y: number }) =>
        this.mouseDrag(from, to),
    };
  }

  // Object that includes keyboard and mouse operations
  get keyboard() {
    return {
      type: (text: string) => this.keyboardType(text),
      press: (
        action:
          | { key: WebKeyInput; command?: string }
          | { key: WebKeyInput; command?: string }[],
      ) => this.keyboardPressAction(action),
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
  async scrollUntilTop(startingPoint?: Point): Promise<void> {
    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(0, -9999999, 100);
  }

  // Scroll to bottom element
  async scrollUntilBottom(startingPoint?: Point): Promise<void> {
    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(0, 9999999, 100);
  }

  async scrollUntilLeft(startingPoint?: Point): Promise<void> {
    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(-9999999, 0, 100);
  }

  async scrollUntilRight(startingPoint?: Point): Promise<void> {
    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(9999999, 0, 100);
  }

  // Scroll up one screen
  async scrollUp(distance?: number, startingPoint?: Point): Promise<void> {
    const { height } = await this.browser.getWindowSize();
    const scrollDistance = distance || height * 0.7;

    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(0, -scrollDistance, 1000);
  }

  // Scroll down one screen
  async scrollDown(distance?: number, startingPoint?: Point): Promise<void> {
    const { height } = await this.browser.getWindowSize();
    const scrollDistance = distance || height * 0.7;

    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(0, scrollDistance, 1000);
  }

  async scrollLeft(distance?: number, startingPoint?: Point): Promise<void> {
    const { width } = await this.browser.getWindowSize();
    const scrollDistance = distance || width * 0.7;

    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(-scrollDistance, 0, 1000);
  }

  async scrollRight(distance?: number, startingPoint?: Point): Promise<void> {
    const { width } = await this.browser.getWindowSize();
    const scrollDistance = distance || width * 0.7;

    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(scrollDistance, 0, 1000);
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

  private async keyboardPressAction(
    action:
      | { key: WebKeyInput; command?: string }
      | { key: WebKeyInput; command?: string }[],
  ): Promise<void> {
    if (Array.isArray(action)) {
      for (const act of action) {
        await this.browser.performActions([
          {
            type: 'key',
            id: 'keyboard',
            actions: [
              { type: 'keyDown', value: act.key },
              { type: 'keyUp', value: act.key },
            ],
          },
        ]);
      }
    } else {
      await this.browser.performActions([
        {
          type: 'key',
          id: 'keyboard',
          actions: [
            { type: 'keyDown', value: action.key },
            { type: 'keyUp', value: action.key },
          ],
        },
      ]);
    }
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

  private async mouseDrag(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Promise<void> {
    await this.browser.performActions([
      {
        type: 'pointer',
        id: 'mouse',
        parameters: { pointerType: 'mouse' },
        actions: [
          { type: 'pointerMove', duration: 0, x: from.x, y: from.y },
          { type: 'pointerDown', button: 0 },
          { type: 'pointerMove', duration: 500, x: to.x, y: to.y },
          { type: 'pointerUp', button: 0 },
        ],
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

  async destroy(): Promise<void> {
    //
  }
}
