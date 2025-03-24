import fs from 'node:fs';
import path from 'node:path';
import type { Point, Size } from '@midscene/core';
import { getTmpFile } from '@midscene/core/utils';
import type { ElementInfo } from '@midscene/shared/extractor';
import { resizeImg } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/utils';
import { ADB } from 'appium-adb';
import type { KeyInput as PuppeteerKeyInput } from 'puppeteer';
import type { AbstractPage, MouseButton } from '../page';
type WebKeyInput = PuppeteerKeyInput;

const debugPage = getDebug('android');

export class Page implements AbstractPage {
  private deviceId: string;
  private screenSize: Size | null = null;
  private yadbPushed = false;
  private deviceRatio = 1;
  private adbPromise: Promise<ADB>;
  pageType = 'android';

  constructor({ deviceId }: { deviceId: string }) {
    this.deviceId = deviceId;

    // init ADB Promise
    this.adbPromise = this.initAdb();
  }

  private async initAdb(): Promise<ADB> {
    try {
      debugPage(`Initializing ADB with device ID: ${this.deviceId}`);
      const adb = await ADB.createADB({
        udid: this.deviceId,
        adbExecTimeout: 60000,
      });
      debugPage('ADB initialized successfully');
      return adb;
    } catch (error) {
      console.error(`Failed to initialize ADB: ${error}`);
      throw error;
    }
  }

  public async getAdb(): Promise<ADB> {
    return this.adbPromise;
  }

  private async execYadb(keyboardContent: string): Promise<void> {
    await this.pushYadb();

    const adb = await this.getAdb();

    await adb.shell(
      `app_process -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -keyboard "${keyboardContent}"`,
    );
  }

  async getElementsInfo(): Promise<ElementInfo[]> {
    return [];
  }

  async getElementsNodeTree(): Promise<any> {
    // Simplified implementation, returns an empty node tree
    return {
      node: null,
      children: [],
    };
  }

  async size(): Promise<Size> {
    if (this.screenSize) {
      return this.screenSize;
    }

    try {
      const adb = await this.getAdb();

      const screenSize = await adb.getScreenSize();
      // screenSize is a string like "width x height", or an object
      let width: number;
      let height: number;

      if (typeof screenSize === 'string') {
        // handle string format "width x height"
        const match = screenSize.match(/(\d+)x(\d+)/);
        if (!match || match.length < 3) {
          throw new Error(`Unable to parse screen size: ${screenSize}`);
        }
        width = Number.parseInt(match[1], 10);
        height = Number.parseInt(match[2], 10);
      } else if (typeof screenSize === 'object' && screenSize !== null) {
        // handle object format
        const sizeObj = screenSize as Record<string, any>;
        if ('width' in sizeObj && 'height' in sizeObj) {
          width = Number(sizeObj.width);
          height = Number(sizeObj.height);
        } else {
          throw new Error(
            `Invalid screen size object: ${JSON.stringify(screenSize)}`,
          );
        }
      } else {
        throw new Error(`Invalid screen size format: ${screenSize}`);
      }

      // Get device display density
      try {
        const densityNum = await adb.getScreenDensity();
        // Standard density is 160, calculate the ratio
        this.deviceRatio = Number(densityNum) / 160;
        debugPage(`Device display ratio: ${this.deviceRatio}`);
      } catch (error) {
        console.warn('Error getting device density:', error);
      }

      // calculate logical pixel size using reverseAdjustCoordinates function
      const { x: logicalWidth, y: logicalHeight } =
        this.reverseAdjustCoordinates(width, height);

      this.screenSize = {
        width: logicalWidth,
        height: logicalHeight,
      };

      return this.screenSize;
    } catch (error) {
      console.error('Error getting screen size:', error);
      throw error;
    }
  }

  /**
   * Convert logical coordinates to physical coordinates, handling device ratio
   * @param x Logical X coordinate
   * @param y Logical Y coordinate
   * @returns Physical coordinate point
   */
  private adjustCoordinates(x: number, y: number): { x: number; y: number } {
    const ratio = this.deviceRatio;
    return {
      x: Math.round(x * ratio),
      y: Math.round(y * ratio),
    };
  }

  /**
   * Convert physical coordinates to logical coordinates, handling device ratio
   * @param x Physical X coordinate
   * @param y Physical Y coordinate
   * @returns Logical coordinate point
   */
  private reverseAdjustCoordinates(
    x: number,
    y: number,
  ): { x: number; y: number } {
    const ratio = this.deviceRatio;
    return {
      x: Math.round(x / ratio),
      y: Math.round(y / ratio),
    };
  }

  async screenshotBase64(): Promise<string> {
    try {
      debugPage('screenshotBase64 begin');
      const { width, height } = await this.size();
      const adb = await this.getAdb();
      let screenshotBuffer;

      try {
        screenshotBuffer = await adb.takeScreenshot(null);
      } catch (error) {
        const screenshotPath = getTmpFile('png')!;

        // Take a screenshot and save it locally
        await adb.shell('screencap -p /sdcard/screenshot.png');
        await adb.pull('/sdcard/screenshot.png', screenshotPath);
        screenshotBuffer = await fs.promises.readFile(screenshotPath);
      }

      const resizedScreenshotBuffer = await resizeImg(screenshotBuffer, {
        width,
        height,
      });

      const result = `data:image/jpeg;base64,${resizedScreenshotBuffer.toString('base64')}`;
      debugPage('screenshotBase64 end');
      return result;
    } catch (error) {
      console.error('Error taking screenshot:', error);
      throw error;
    }
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

    try {
      await this.pushYadb();

      const adb = await this.getAdb();

      // Use the yadb tool to clear the input box
      await adb.shell(
        'app_process -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -keyboard "~CLEAR~"',
      );
    } catch (error) {
      console.error('Error clearing input:', error);
    }
  }

  async url(): Promise<string> {
    try {
      const adb = await this.getAdb();

      const { appPackage, appActivity } =
        await adb.getFocusedPackageAndActivity();
      return `${appPackage}/${appActivity}`;
    } catch (error) {
      console.error('Error getting URL:', error);
      return '';
    }
  }

  async scrollUntilTop(startingPoint?: Point): Promise<void> {
    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(0, 9999999, 100);
  }

  async scrollUntilBottom(startingPoint?: Point): Promise<void> {
    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(0, -9999999, 100);
  }

  async scrollUntilLeft(startingPoint?: Point): Promise<void> {
    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(9999999, 0, 100);
  }

  async scrollUntilRight(startingPoint?: Point): Promise<void> {
    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(-9999999, 0, 100);
  }

  async scrollUp(distance?: number, startingPoint?: Point): Promise<void> {
    const { height } = await this.size();
    const scrollDistance = distance || height * 0.7;

    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(0, scrollDistance, 1000);
  }

  async scrollDown(distance?: number, startingPoint?: Point): Promise<void> {
    const { height } = await this.size();
    const scrollDistance = distance || height * 0.7;

    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(0, -scrollDistance, 1000);
  }

  async scrollLeft(distance?: number, startingPoint?: Point): Promise<void> {
    const { width } = await this.size();
    const scrollDistance = distance || width * 0.7;

    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(scrollDistance, 0, 1000);
  }

  async scrollRight(distance?: number, startingPoint?: Point): Promise<void> {
    const { width } = await this.size();
    const scrollDistance = distance || width * 0.7;

    if (startingPoint) {
      await this.mouse.move(startingPoint.left, startingPoint.top);
    }

    await this.mouseWheel(-scrollDistance, 0, 1000);
  }

  private async pushYadb() {
    // Push the YADB tool to the device only once
    if (!this.yadbPushed) {
      const adb = await this.getAdb();

      const yadbBin = path.join(__dirname, '../../bin/yadb');
      await adb.push(yadbBin, '/data/local/tmp');
      this.yadbPushed = true;
    }
  }

  private async keyboardType(text: string): Promise<void> {
    if (!text) return;

    try {
      const adb = await this.getAdb();
      const isChinese = /[\p{Script=Han}\p{sc=Hani}]/u.test(text);

      // for pure ASCII characters, directly use inputText
      if (!isChinese) {
        await adb.inputText(text);
        return;
      }

      // for non-ASCII characters, use yadb
      await this.execYadb(text);
    } catch (error) {
      console.error('Error typing text:', error);
      throw error;
    }
  }

  private async keyboardPress(key: WebKeyInput): Promise<void> {
    // Map web keys to Android key codes (numbers)
    const keyCodeMap: Record<string, number> = {
      Enter: 66,
      Backspace: 67,
      Tab: 61,
      ArrowUp: 19,
      ArrowDown: 20,
      ArrowLeft: 21,
      ArrowRight: 22,
      Escape: 111,
      Home: 3,
      End: 123,
    };

    const adb = await this.getAdb();

    const keyCode = keyCodeMap[key];
    if (keyCode !== undefined) {
      await adb.keyevent(keyCode);
    } else {
      // for keys not in the mapping table, try to get its ASCII code (if it's a single character)
      if (key.length === 1) {
        const asciiCode = key.toUpperCase().charCodeAt(0);
        // Android key codes, A-Z is 29-54
        if (asciiCode >= 65 && asciiCode <= 90) {
          await adb.keyevent(asciiCode - 36); // 65-36=29 (A's key code)
        }
      }
    }
  }

  private async keyboardPressAction(
    action:
      | { key: WebKeyInput; command?: string }
      | { key: WebKeyInput; command?: string }[],
  ): Promise<void> {
    if (Array.isArray(action)) {
      for (const act of action) {
        await this.keyboardPress(act.key);
      }
    } else {
      await this.keyboardPress(action.key);
    }
  }

  private async mouseClick(
    x: number,
    y: number,
    button: MouseButton = 'left',
  ): Promise<void> {
    try {
      // ADB only supports left mouse button clicks
      if (button !== 'left') {
        console.warn(
          `ADB only supports left mouse button clicks. Ignored request for ${button} button.`,
        );
      }

      await this.mouseMove(x, y);

      const adb = await this.getAdb();

      // Use adjusted coordinates
      const { x: adjustedX, y: adjustedY } = this.adjustCoordinates(x, y);
      await adb.shell(`input tap ${adjustedX} ${adjustedY}`);
    } catch (error) {
      console.error('Error clicking:', error);
    }
  }

  private async mouseMove(x: number, y: number): Promise<void> {
    // ADB doesn't have direct cursor movement functionality, but we can record the position for subsequent operations
    // This is a no-op, as ADB doesn't support direct mouse movement
    return Promise.resolve();
  }

  private async mouseDrag(
    from: { x: number; y: number },
    to: { x: number; y: number },
  ): Promise<void> {
    try {
      const adb = await this.getAdb();

      // Use adjusted coordinates
      const { x: fromX, y: fromY } = this.adjustCoordinates(from.x, from.y);
      const { x: toX, y: toY } = this.adjustCoordinates(to.x, to.y);

      await adb.shell(`input swipe ${fromX} ${fromY} ${toX} ${toY} 300`);
    } catch (error) {
      console.error('Error dragging:', error);
    }
  }

  private async mouseWheel(
    deltaX: number,
    deltaY: number,
    duration = 1000,
  ): Promise<void> {
    try {
      const { width, height } = await this.size();

      // Calculate the starting and ending points of the swipe
      const n = 4; // Divide the screen into n equal parts

      // Set the starting point based on the swipe direction
      const startX = deltaX < 0 ? (n - 1) * (width / n) : width / n;
      const startY = deltaY < 0 ? (n - 1) * (height / n) : height / n;

      // Calculate the maximum swipeable range
      const maxNegativeDeltaX = startX;
      const maxPositiveDeltaX = (n - 1) * (width / n);
      const maxNegativeDeltaY = startY;
      const maxPositiveDeltaY = (n - 1) * (height / n);

      // Limit the swipe distance
      deltaX = Math.max(
        -maxNegativeDeltaX,
        Math.min(deltaX, maxPositiveDeltaX),
      );
      deltaY = Math.max(
        -maxNegativeDeltaY,
        Math.min(deltaY, maxPositiveDeltaY),
      );

      // Calculate the end coordinates
      const endX = startX + deltaX;
      const endY = startY + deltaY;

      // Adjust coordinates to fit device ratio
      const { x: adjustedStartX, y: adjustedStartY } = this.adjustCoordinates(
        startX,
        startY,
      );
      const { x: adjustedEndX, y: adjustedEndY } = this.adjustCoordinates(
        endX,
        endY,
      );

      const adb = await this.getAdb();

      // Execute the swipe operation
      await adb.shell(
        `input swipe ${adjustedStartX} ${adjustedStartY} ${adjustedEndX} ${adjustedEndY} ${duration}`,
      );
    } catch (error) {
      console.error('Error scrolling:', error);
    }
  }

  async destroy(): Promise<void> {
    // Clean up temporary files
    try {
      const adb = await this.getAdb();

      await adb.shell('rm -f /sdcard/screenshot.png');
      await adb.shell('rm -f /sdcard/window_dump.xml');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}
