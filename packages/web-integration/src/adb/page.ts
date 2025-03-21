import { exec } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Point, Size } from '@midscene/core';
import { getTmpFile } from '@midscene/core/utils';
import type { ElementInfo } from '@midscene/shared/extractor';
import { base64Encoded, resizeImg } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/utils';
import type { KeyInput as PuppeteerKeyInput } from 'puppeteer';
import type { AbstractPage, MouseButton } from '../page';

type WebKeyInput = PuppeteerKeyInput;

const execPromise = promisify(exec);
const debugPage = getDebug('android:page');

export class Page implements AbstractPage {
  private deviceId: string;
  private tmpDir: string;
  private screenSize: Size | null = null;
  private yadbPushed = false;
  pageType = 'adb';

  constructor(deviceId: string) {
    this.deviceId = deviceId;
    this.tmpDir = path.join(process.cwd(), 'tmp');

    // Ensure the temporary directory exists
    if (!fs.existsSync(this.tmpDir)) {
      fs.mkdirSync(this.tmpDir, { recursive: true });
    }
  }

  private async execAdb(command: string): Promise<string> {
    try {
      debugPage(`execAdb begin command: ${command}`);
      const { stdout } = await execPromise(
        `adb -s ${this.deviceId} ${command}`,
      );
      debugPage(`execAdb end command: ${command}`);
      return stdout.trim();
    } catch (error) {
      console.error(`ADB command error: ${error}`);
      throw error;
    }
  }
  private async execYadb(keyboardContent: string): Promise<void> {
    const escapedContent = keyboardContent.replace(/(['"\\ ])/g, '\\$1');

    await this.pushYadb();
    await this.execAdb(
      `shell app_process -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -keyboard "${escapedContent}"`,
    );
  }

  async getElementsInfo(): Promise<ElementInfo[]> {
    return [];
  }

  async getElementsNodeTree(): Promise<any> {
    debugPage('getElementsNodeTree begin');
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
      const output = await this.execAdb('shell wm size');
      const match = output.match(/(\d+)x(\d+)/);

      if (match && match.length === 3) {
        this.screenSize = {
          width: Number.parseInt(match[1], 10),
          height: Number.parseInt(match[2], 10),
        };
        return this.screenSize;
      }
      throw new Error('Unable to parse screen size');
    } catch (error) {
      console.error('Error getting screen size:', error);
      // 默认分辨率
      return { width: 1080, height: 1920 };
    }
  }

  async screenshotBase64(): Promise<string> {
    try {
      debugPage('screenshotBase64 begin');
      const { width, height } = await this.size();
      const screenshotPath = getTmpFile('png')!;

      // Take a screenshot and save it locally
      await this.execAdb('shell screencap -p /sdcard/screenshot.png');
      await this.execAdb(`pull /sdcard/screenshot.png ${screenshotPath}`);

      // Read the screenshot and resize it
      const screenshotBuffer = fs.readFileSync(screenshotPath);
      const resizedScreenshotBuffer = await resizeImg(screenshotBuffer, {
        width,
        height,
      });
      fs.writeFileSync(screenshotPath, resizedScreenshotBuffer);

      const result = base64Encoded(screenshotPath);
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
      // Use the yadb tool to clear the input box
      await this.execAdb(
        'shell app_process -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -keyboard "~CLEAR~"',
      );
    } catch (error) {
      console.error('Error clearing input:', error);
    }
  }

  async url(): Promise<string> {
    try {
      // Get the current application package name and activity
      const result = await this.execAdb(
        'shell dumpsys window | grep mCurrentFocus',
      );
      return result;
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
      const yadbBin = path.join(__dirname, '../../bin/yadb');
      await this.execAdb(`push ${yadbBin} /data/local/tmp`);
      this.yadbPushed = true;
    }
  }

  private async keyboardType(text: string): Promise<void> {
    if (!text) return;

    try {
      await this.pushYadb();
      await this.execYadb(text);
    } catch (error) {
      console.error('Error typing text:', error);
      throw error;
    }
  }

  private async keyboardPress(key: WebKeyInput): Promise<void> {
    // Map web keys to Android key codes
    const keyCodeMap: Record<string, string> = {
      Enter: 'KEYCODE_ENTER',
      Backspace: 'KEYCODE_DEL',
      Tab: 'KEYCODE_TAB',
      ArrowUp: 'KEYCODE_DPAD_UP',
      ArrowDown: 'KEYCODE_DPAD_DOWN',
      ArrowLeft: 'KEYCODE_DPAD_LEFT',
      ArrowRight: 'KEYCODE_DPAD_RIGHT',
      Escape: 'KEYCODE_ESCAPE',
      Home: 'KEYCODE_HOME',
      End: 'KEYCODE_MOVE_END',
    };

    const keyCode = keyCodeMap[key] || `KEYCODE_${key.toUpperCase()}`;
    await this.execAdb(`shell input keyevent ${keyCode}`);
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
      await this.execAdb(`shell input tap ${Math.round(x)} ${Math.round(y)}`);
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
      await this.execAdb(
        `shell input swipe ${Math.round(from.x)} ${Math.round(from.y)} ${Math.round(to.x)} ${Math.round(to.y)} 300`,
      );
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

      // Execute the swipe operation
      await this.execAdb(
        `shell input swipe ${Math.round(startX)} ${Math.round(startY)} ${Math.round(endX)} ${Math.round(endY)} ${duration}`,
      );
    } catch (error) {
      console.error('Error scrolling:', error);
    }
  }

  async destroy(): Promise<void> {
    // Clean up temporary files
    try {
      await this.execAdb('shell rm -f /sdcard/screenshot.png');
      await this.execAdb('shell rm -f /sdcard/window_dump.xml');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}
