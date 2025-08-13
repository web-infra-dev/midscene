import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { type Point, type Size, getAIConfig } from '@midscene/core';
import type { DeviceAction, PageType } from '@midscene/core';
import { getTmpFile, sleep } from '@midscene/core/utils';
import {
  MIDSCENE_ADB_PATH,
  MIDSCENE_ADB_REMOTE_HOST,
  MIDSCENE_ADB_REMOTE_PORT,
  MIDSCENE_ANDROID_IME_STRATEGY,
} from '@midscene/shared/env';
import type { ElementInfo } from '@midscene/shared/extractor';
import { isValidPNGImageBuffer, resizeImg } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { repeat } from '@midscene/shared/utils';
import type { AndroidDeviceInputOpt, AndroidDevicePage } from '@midscene/web';
import { commonWebActionsForWebPage } from '@midscene/web/utils';

import { ADB } from 'appium-adb';

// only for Android, because it's impossible to scroll to the bottom, so we need to set a default scroll times
const defaultScrollUntilTimes = 10;
const defaultFastScrollDuration = 100;
const defaultNormalScrollDuration = 1000;

export const debugPage = getDebug('android:device');
export type AndroidDeviceOpt = {
  androidAdbPath?: string;
  remoteAdbHost?: string;
  remoteAdbPort?: number;
  imeStrategy?: 'always-yadb' | 'yadb-for-non-ascii';
} & AndroidDeviceInputOpt;

export class AndroidDevice implements AndroidDevicePage {
  private deviceId: string;
  private yadbPushed = false;
  private devicePixelRatio = 1;
  private adb: ADB | null = null;
  private connectingAdb: Promise<ADB> | null = null;
  private destroyed = false;
  pageType: PageType = 'android';
  uri: string | undefined;
  options?: AndroidDeviceOpt;

  actionSpace(): DeviceAction[] {
    const commonActions = commonWebActionsForWebPage(this);
    commonActions.forEach((action) => {
      if (action.name === 'Input') {
        action.call = async (context, param) => {
          const { element } = context;
          if (element) {
            await this.clearInput(element as unknown as ElementInfo);

            if (!param || !param.value) {
              return;
            }
          }

          await this.keyboard.type(param.value, {
            autoDismissKeyboard: this.options?.autoDismissKeyboard,
          });
        };
      }
    });

    const allActions: DeviceAction[] = [
      ...commonWebActionsForWebPage(this),
      {
        name: 'AndroidBackButton',
        description: 'Trigger the system "back" operation on Android devices',
        location: false,
        call: async (context, param) => {
          await this.back();
        },
      },
      {
        name: 'AndroidHomeButton',
        description: 'Trigger the system "home" operation on Android devices',
        location: false,
        call: async (context, param) => {
          await this.home();
        },
      },
      {
        name: 'AndroidRecentAppsButton',
        description:
          'Trigger the system "recent apps" operation on Android devices',
        location: false,
        call: async (context, param) => {
          await this.recentApps();
        },
      },
      {
        name: 'AndroidLongPress',
        description:
          'Trigger a long press on the screen at specified coordinates on Android devices',
        paramSchema: '{ duration?: number }',
        paramDescription: 'The duration of the long press in milliseconds',
        location: 'required',
        whatToLocate: 'The element to be long pressed',
        call: async (context, param) => {
          const { element } = context;
          if (!element) {
            throw new Error(
              'AndroidLongPress requires an element to be located',
            );
          }
          const [x, y] = element.center;
          await this.longPress(x, y, param?.duration);
        },
      } as DeviceAction<{ duration?: number }>,
      {
        name: 'AndroidPull',
        description:
          'Trigger pull down to refresh or pull up actions on Android devices',
        paramSchema:
          '{ direction: "up" | "down", distance?: number, duration?: number }',
        paramDescription:
          'The direction to pull, the distance to pull (in pixels), and the duration of the pull (in milliseconds).',
        location: 'optional',
        whatToLocate: 'The element to be pulled',
        call: async (context, param) => {
          const { element } = context;
          const startPoint = element
            ? { left: element.center[0], top: element.center[1] }
            : undefined;
          if (!param || !param.direction) {
            throw new Error('AndroidPull requires a direction parameter');
          }
          if (param.direction === 'down') {
            await this.pullDown(startPoint, param.distance, param.duration);
          } else if (param.direction === 'up') {
            await this.pullUp(startPoint, param.distance, param.duration);
          } else {
            throw new Error(`Unknown pull direction: ${param.direction}`);
          }
        },
      } as DeviceAction<{
        direction: 'up' | 'down';
        distance?: number;
        duration?: number;
      }>,
    ];
    return allActions;
  }

  constructor(deviceId: string, options?: AndroidDeviceOpt) {
    assert(deviceId, 'deviceId is required for AndroidDevice');

    this.deviceId = deviceId;
    this.options = options;
  }

  public async connect(): Promise<ADB> {
    return this.getAdb();
  }

  public async getAdb(): Promise<ADB> {
    if (this.destroyed) {
      throw new Error(
        `AndroidDevice ${this.deviceId} has been destroyed and cannot execute ADB commands`,
      );
    }

    // if already has ADB instance, return it
    if (this.adb) {
      return this.createAdbProxy(this.adb);
    }

    // If already connecting, wait for connection to complete
    if (this.connectingAdb) {
      return this.connectingAdb.then((adb) => this.createAdbProxy(adb));
    }

    // Create new connection Promise
    this.connectingAdb = (async () => {
      let error: Error | null = null;
      debugPage(`Initializing ADB with device ID: ${this.deviceId}`);
      try {
        const androidAdbPath =
          this.options?.androidAdbPath || getAIConfig(MIDSCENE_ADB_PATH);
        const remoteAdbHost =
          this.options?.remoteAdbHost || getAIConfig(MIDSCENE_ADB_REMOTE_HOST);
        const remoteAdbPort =
          this.options?.remoteAdbPort || getAIConfig(MIDSCENE_ADB_REMOTE_PORT);

        this.adb = await new ADB({
          udid: this.deviceId,
          adbExecTimeout: 60000,
          executable: androidAdbPath
            ? { path: androidAdbPath, defaultArgs: [] }
            : undefined,
          remoteAdbHost: remoteAdbHost || undefined,
          remoteAdbPort: remoteAdbPort ? Number(remoteAdbPort) : undefined,
        });

        const size = await this.getScreenSize();
        console.log(`
DeviceId: ${this.deviceId}
ScreenSize:
${Object.keys(size)
  .filter((key) => size[key as keyof typeof size])
  .map(
    (key) =>
      `  ${key} size: ${size[key as keyof typeof size]}${key === 'override' && size[key as keyof typeof size] ? ' ✅' : ''}`,
  )
  .join('\n')}
`);
        debugPage('ADB initialized successfully');
        return this.adb;
      } catch (e) {
        debugPage(`Failed to initialize ADB: ${e}`);
        error = new Error(`Unable to connect to device ${this.deviceId}: ${e}`);
      } finally {
        this.connectingAdb = null;
      }

      if (error) {
        throw error;
      }

      throw new Error('ADB initialization failed unexpectedly');
    })();

    return this.connectingAdb;
  }

  private createAdbProxy(adb: ADB): ADB {
    // create ADB proxy object, intercept all method calls
    return new Proxy(adb, {
      get: (target, prop) => {
        const originalMethod = target[prop as keyof typeof target];

        // if the property is not a function, return the original value
        if (typeof originalMethod !== 'function') {
          return originalMethod;
        }

        // return the proxied method
        return async (...args: any[]) => {
          try {
            debugPage(`adb ${String(prop)} ${args.join(' ')}`);
            const result = await (
              originalMethod as (...args: any[]) => any
            ).apply(target, args);
            debugPage(`adb ${String(prop)} ${args.join(' ')} end`);
            return result;
          } catch (error: any) {
            const methodName = String(prop);
            const deviceId = this.deviceId;
            debugPage(
              `ADB error with device ${deviceId} when calling ${methodName}: ${error}`,
            );

            // throw the error again
            throw new Error(
              `ADB error with device ${deviceId} when calling ${methodName}, please check https://midscenejs.com/integrate-with-android.html#faq : ${error.message}`,
              {
                cause: error,
              },
            );
          }
        };
      },
    });
  }

  public async launch(uri: string): Promise<AndroidDevice> {
    const adb = await this.getAdb();
    this.uri = uri;

    try {
      debugPage(`Launching app: ${uri}`);
      if (
        uri.startsWith('http://') ||
        uri.startsWith('https://') ||
        uri.includes('://')
      ) {
        // If it's a URI with scheme
        await adb.startUri(uri);
      } else if (uri.includes('/')) {
        // If it's in format like 'com.android/settings.Settings'
        const [appPackage, appActivity] = uri.split('/');
        await adb.startApp({
          pkg: appPackage,
          activity: appActivity,
        });
      } else {
        // Assume it's just a package name
        await adb.activateApp(uri);
      }
      debugPage(`Successfully launched: ${uri}`);
    } catch (error: any) {
      debugPage(`Error launching ${uri}: ${error}`);
      throw new Error(`Failed to launch ${uri}: ${error.message}`, {
        cause: error,
      });
    }

    return this;
  }

  private async execYadb(keyboardContent: string): Promise<void> {
    await this.ensureYadb();

    const adb = await this.getAdb();

    await adb.shell(
      `app_process -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -keyboard "${keyboardContent}"`,
    );
  }

  // @deprecated
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

  private async getScreenSize(): Promise<{
    override: string;
    physical: string;
    orientation: number; // 0=portrait, 1=landscape, 2=reverse portrait, 3=reverse landscape
  }> {
    const adb = await this.getAdb();
    const stdout = await adb.shell(['wm', 'size']);
    const size = {
      override: '',
      physical: '',
    };

    // First try to get Override size
    const overrideSize = new RegExp(/Override size: ([^\r?\n]+)*/g).exec(
      stdout,
    );
    if (overrideSize && overrideSize.length >= 2 && overrideSize[1]) {
      debugPage(`Using Override size: ${overrideSize[1].trim()}`);
      size.override = overrideSize[1].trim();
    }

    // If Override size doesn't exist, fallback to Physical size
    const physicalSize = new RegExp(/Physical size: ([^\r?\n]+)*/g).exec(
      stdout,
    );
    if (physicalSize && physicalSize.length >= 2) {
      debugPage(`Using Physical size: ${physicalSize[1].trim()}`);
      size.physical = physicalSize[1].trim();
    }

    let orientation = 0;
    try {
      const orientationStdout = await adb.shell(
        'dumpsys input | grep SurfaceOrientation',
      );
      const orientationMatch = orientationStdout.match(
        /SurfaceOrientation:\s*(\d)/,
      );
      if (!orientationMatch) {
        throw new Error('Failed to get orientation from input');
      }

      orientation = Number(orientationMatch[1]);

      debugPage(`Screen orientation: ${orientation}`);
    } catch (e) {
      debugPage('Failed to get orientation from input, try display');
      try {
        const orientationStdout = await adb.shell(
          'dumpsys display | grep mCurrentOrientation',
        );
        const orientationMatch = orientationStdout.match(
          /mCurrentOrientation=(\d)/,
        );
        if (!orientationMatch) {
          throw new Error('Failed to get orientation from display');
        }

        orientation = Number(orientationMatch[1]);

        debugPage(`Screen orientation (fallback): ${orientation}`);
      } catch (e2) {
        orientation = 0;
        debugPage('Failed to get orientation from display, default to 0');
      }
    }

    if (size.override || size.physical) {
      return { ...size, orientation };
    }

    throw new Error(`Failed to get screen size, output: ${stdout}`);
  }

  async size(): Promise<Size> {
    const adb = await this.getAdb();

    // Use custom getScreenSize method instead of adb.getScreenSize()
    const screenSize = await this.getScreenSize();
    // screenSize is a string like "width x height"

    // handle string format "width x height"
    const match = (screenSize.override || screenSize.physical).match(
      /(\d+)x(\d+)/,
    );
    if (!match || match.length < 3) {
      throw new Error(`Unable to parse screen size: ${screenSize}`);
    }

    const isLandscape =
      screenSize.orientation === 1 || screenSize.orientation === 3;
    const width = Number.parseInt(match[isLandscape ? 2 : 1], 10);
    const height = Number.parseInt(match[isLandscape ? 1 : 2], 10);

    // Get device display density
    const densityNum = await adb.getScreenDensity();
    // Standard density is 160, calculate the ratio
    this.devicePixelRatio = Number(densityNum) / 160;

    // calculate logical pixel size using reverseAdjustCoordinates function
    const { x: logicalWidth, y: logicalHeight } = this.reverseAdjustCoordinates(
      width,
      height,
    );

    return {
      width: logicalWidth,
      height: logicalHeight,
      dpr: this.devicePixelRatio,
    };
  }

  private adjustCoordinates(x: number, y: number): { x: number; y: number } {
    const ratio = this.devicePixelRatio;
    return {
      x: Math.round(x * ratio),
      y: Math.round(y * ratio),
    };
  }

  private reverseAdjustCoordinates(
    x: number,
    y: number,
  ): { x: number; y: number } {
    const ratio = this.devicePixelRatio;
    return {
      x: Math.round(x / ratio),
      y: Math.round(y / ratio),
    };
  }

  async screenshotBase64(): Promise<string> {
    debugPage('screenshotBase64 begin');
    const { width, height } = await this.size();
    const adb = await this.getAdb();
    let screenshotBuffer;
    const androidScreenshotPath = `/data/local/tmp/midscene_screenshot_${randomUUID()}.png`;

    try {
      debugPage('Taking screenshot via adb.takeScreenshot');
      screenshotBuffer = await adb.takeScreenshot(null);
      debugPage('adb.takeScreenshot completed');

      // make sure screenshotBuffer is not null
      if (!screenshotBuffer) {
        throw new Error(
          'Failed to capture screenshot: screenshotBuffer is null',
        );
      }

      // check if the buffer is a valid PNG image, it might be a error string
      if (!isValidPNGImageBuffer(screenshotBuffer)) {
        debugPage('Invalid image buffer detected: not a valid image format');
        throw new Error(
          'Screenshot buffer has invalid format: could not find valid image signature',
        );
      }
    } catch (error) {
      const screenshotPath = getTmpFile('png')!;

      try {
        debugPage('Fallback: taking screenshot via shell screencap');
        try {
          // Take a screenshot and save it locally
          await adb.shell(`screencap -p ${androidScreenshotPath}`);
          debugPage('adb.shell screencap completed');
        } catch (error) {
          debugPage('screencap failed, using forceScreenshot');
          await this.forceScreenshot(androidScreenshotPath);
          debugPage('forceScreenshot completed');
        }

        debugPage('Pulling screenshot file from device');
        await adb.pull(androidScreenshotPath, screenshotPath);
        debugPage('adb.pull completed');
        screenshotBuffer = await fs.promises.readFile(screenshotPath);
      } finally {
        await adb.shell(`rm -f ${androidScreenshotPath}`);
      }
    }

    debugPage('Resizing screenshot image');
    const resizedScreenshotBuffer = await resizeImg(screenshotBuffer, {
      width,
      height,
    });
    debugPage('Image resize completed');

    debugPage('Converting to base64');
    const result = `data:image/jpeg;base64,${resizedScreenshotBuffer.toString('base64')}`;
    debugPage('screenshotBase64 end');
    return result;
  }

  get mouse() {
    return {
      click: (x: number, y: number) => this.mouseClick(x, y),
      wheel: (deltaX: number, deltaY: number, duration?: number) =>
        this.mouseWheel(deltaX, deltaY, duration),
      move: (x: number, y: number) => this.mouseMove(x, y),
      drag: (
        from: { x: number; y: number },
        to: { x: number; y: number },
        duration?: number,
      ) => this.mouseDrag(from, to, duration),
    };
  }

  get keyboard() {
    return {
      type: (text: string, options?: AndroidDeviceInputOpt) =>
        this.keyboardType(text, options),
      press: (
        action:
          | { key: string; command?: string }
          | { key: string; command?: string }[],
      ) => this.keyboardPressAction(action),
    };
  }

  async clearInput(element: ElementInfo): Promise<void> {
    if (!element) {
      return;
    }

    await this.ensureYadb();

    const adb = await this.getAdb();

    await this.mouse.click(element.center[0], element.center[1]);

    // Use the yadb tool to clear the input box
    await adb.shell(
      'app_process -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -keyboard "~CLEAR~"',
    );

    if (await adb.isSoftKeyboardPresent()) {
      return;
    }

    await this.mouse.click(element.center[0], element.center[1]);
  }

  private async forceScreenshot(path: string): Promise<void> {
    // screenshot which is forbidden by app
    await this.ensureYadb();

    const adb = await this.getAdb();

    await adb.shell(
      `app_process -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -screenshot ${path}`,
    );
  }

  async url(): Promise<string> {
    return '';
  }

  async scrollUntilTop(startPoint?: Point): Promise<void> {
    if (startPoint) {
      const { height } = await this.size();
      const start = { x: startPoint.left, y: startPoint.top };
      const end = { x: start.x, y: height };

      await repeat(defaultScrollUntilTimes, () =>
        this.mouseDrag(start, end, defaultFastScrollDuration),
      );
      await sleep(1000);
      return;
    }

    await repeat(defaultScrollUntilTimes, () =>
      this.mouseWheel(0, -9999999, defaultFastScrollDuration),
    );
    await sleep(1000);
  }

  async scrollUntilBottom(startPoint?: Point): Promise<void> {
    if (startPoint) {
      const start = { x: startPoint.left, y: startPoint.top };
      const end = { x: start.x, y: 0 };

      await repeat(defaultScrollUntilTimes, () =>
        this.mouseDrag(start, end, defaultFastScrollDuration),
      );
      await sleep(1000);
      return;
    }

    await repeat(defaultScrollUntilTimes, () =>
      this.mouseWheel(0, 9999999, defaultFastScrollDuration),
    );
    await sleep(1000);
  }

  async scrollUntilLeft(startPoint?: Point): Promise<void> {
    if (startPoint) {
      const { width } = await this.size();
      const start = { x: startPoint.left, y: startPoint.top };
      const end = { x: width, y: start.y };

      await repeat(defaultScrollUntilTimes, () =>
        this.mouseDrag(start, end, defaultFastScrollDuration),
      );
      await sleep(1000);
      return;
    }

    await repeat(defaultScrollUntilTimes, () =>
      this.mouseWheel(-9999999, 0, defaultFastScrollDuration),
    );
    await sleep(1000);
  }

  async scrollUntilRight(startPoint?: Point): Promise<void> {
    if (startPoint) {
      const start = { x: startPoint.left, y: startPoint.top };
      const end = { x: 0, y: start.y };

      await repeat(defaultScrollUntilTimes, () =>
        this.mouseDrag(start, end, defaultFastScrollDuration),
      );
      await sleep(1000);
      return;
    }

    await repeat(defaultScrollUntilTimes, () =>
      this.mouseWheel(9999999, 0, defaultFastScrollDuration),
    );
    await sleep(1000);
  }

  async scrollUp(distance?: number, startPoint?: Point): Promise<void> {
    const { height } = await this.size();
    const scrollDistance = distance || height;

    if (startPoint) {
      const start = { x: startPoint.left, y: startPoint.top };
      const endY = Math.min(height, start.y + scrollDistance);
      const end = { x: start.x, y: endY };
      await this.mouseDrag(start, end);
      return;
    }

    await this.mouseWheel(0, -scrollDistance);
  }

  async scrollDown(distance?: number, startPoint?: Point): Promise<void> {
    const { height } = await this.size();
    const scrollDistance = distance || height;

    if (startPoint) {
      const start = { x: startPoint.left, y: startPoint.top };
      const endY = Math.max(0, start.y - scrollDistance);
      const end = { x: start.x, y: endY };
      await this.mouseDrag(start, end);
      return;
    }

    await this.mouseWheel(0, scrollDistance);
  }

  async scrollLeft(distance?: number, startPoint?: Point): Promise<void> {
    const { width } = await this.size();
    const scrollDistance = distance || width;

    if (startPoint) {
      const start = { x: startPoint.left, y: startPoint.top };
      const endX = Math.min(width, start.x + scrollDistance);
      const end = { x: endX, y: start.y };
      await this.mouseDrag(start, end);
      return;
    }

    await this.mouseWheel(-scrollDistance, 0);
  }

  async scrollRight(distance?: number, startPoint?: Point): Promise<void> {
    const { width } = await this.size();
    const scrollDistance = distance || width;

    if (startPoint) {
      const start = { x: startPoint.left, y: startPoint.top };
      const endX = Math.max(0, start.x - scrollDistance);
      const end = { x: endX, y: start.y };
      await this.mouseDrag(start, end);
      return;
    }

    await this.mouseWheel(scrollDistance, 0);
  }

  private async ensureYadb() {
    // Push the YADB tool to the device only once
    if (!this.yadbPushed) {
      const adb = await this.getAdb();
      // Use a more reliable path resolution method
      const androidPkgJson = createRequire(import.meta.url).resolve(
        '@midscene/android/package.json',
      );
      const yadbBin = path.join(path.dirname(androidPkgJson), 'bin', 'yadb');
      await adb.push(yadbBin, '/data/local/tmp');
      this.yadbPushed = true;
    }
  }

  private async keyboardType(
    text: string,
    options?: AndroidDeviceInputOpt,
  ): Promise<void> {
    if (!text) return;
    const adb = await this.getAdb();
    const isChinese = /[\p{Script=Han}\p{sc=Hani}]/u.test(text);
    const IME_STRATEGY =
      (this.options?.imeStrategy ||
        getAIConfig(MIDSCENE_ANDROID_IME_STRATEGY)) ??
      'always-yadb';
    const isAutoDismissKeyboard =
      options?.autoDismissKeyboard ?? this.options?.autoDismissKeyboard ?? true;

    if (
      IME_STRATEGY === 'always-yadb' ||
      (IME_STRATEGY === 'yadb-for-non-ascii' && isChinese)
    ) {
      await this.execYadb(text);
    } else {
      // for pure ASCII characters, directly use inputText
      await adb.inputText(text);
    }

    if (isAutoDismissKeyboard === true) {
      await this.hideKeyboard(options);
    }
  }

  private async keyboardPress(key: string): Promise<void> {
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
      | { key: string; command?: string }
      | { key: string; command?: string }[],
  ): Promise<void> {
    if (Array.isArray(action)) {
      for (const act of action) {
        await this.keyboardPress(act.key);
      }
    } else {
      await this.keyboardPress(action.key);
    }
  }

  private async mouseClick(x: number, y: number): Promise<void> {
    const adb = await this.getAdb();

    // Use adjusted coordinates
    const { x: adjustedX, y: adjustedY } = this.adjustCoordinates(x, y);
    await adb.shell(
      `input swipe ${adjustedX} ${adjustedY} ${adjustedX} ${adjustedY} 150`,
    );
  }

  private async mouseMove(x: number, y: number): Promise<void> {
    // ADB doesn't have direct cursor movement functionality, but we can record the position for subsequent operations
    // This is a no-op, as ADB doesn't support direct mouse movement
    return Promise.resolve();
  }

  private async mouseDrag(
    from: { x: number; y: number },
    to: { x: number; y: number },
    duration?: number,
  ): Promise<void> {
    const adb = await this.getAdb();

    // Use adjusted coordinates
    const { x: fromX, y: fromY } = this.adjustCoordinates(from.x, from.y);
    const { x: toX, y: toY } = this.adjustCoordinates(to.x, to.y);

    // Ensure duration has a default value
    const swipeDuration = duration ?? 300;

    await adb.shell(
      `input swipe ${fromX} ${fromY} ${toX} ${toY} ${swipeDuration}`,
    );
  }

  private async mouseWheel(
    deltaX: number,
    deltaY: number,
    duration?: number,
  ): Promise<void> {
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
    deltaX = Math.max(-maxNegativeDeltaX, Math.min(deltaX, maxPositiveDeltaX));
    deltaY = Math.max(-maxNegativeDeltaY, Math.min(deltaY, maxPositiveDeltaY));

    // Calculate the end coordinates
    // Note: For swipe, we need to reverse the delta direction
    // because positive deltaY should scroll up (show top content),
    // which requires swiping from bottom to top (decreasing Y)
    const endX = startX - deltaX;
    const endY = startY - deltaY;

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

    // Ensure duration has a default value
    const swipeDuration = duration ?? defaultNormalScrollDuration;

    // Execute the swipe operation
    await adb.shell(
      `input swipe ${adjustedStartX} ${adjustedStartY} ${adjustedEndX} ${adjustedEndY} ${swipeDuration}`,
    );
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;

    try {
      if (this.adb) {
        this.adb = null;
      }
    } catch (error) {
      console.error('Error during cleanup:', error);
    }

    this.connectingAdb = null;
    this.yadbPushed = false;
  }

  async back(): Promise<void> {
    const adb = await this.getAdb();
    await adb.shell('input keyevent 4');
  }

  async home(): Promise<void> {
    const adb = await this.getAdb();
    await adb.shell('input keyevent 3');
  }

  async recentApps(): Promise<void> {
    const adb = await this.getAdb();
    await adb.shell('input keyevent 187');
  }

  async longPress(x: number, y: number, duration = 1000): Promise<void> {
    const adb = await this.getAdb();

    // Use adjusted coordinates
    const { x: adjustedX, y: adjustedY } = this.adjustCoordinates(x, y);
    await adb.shell(
      `input swipe ${adjustedX} ${adjustedY} ${adjustedX} ${adjustedY} ${duration}`,
    );
  }

  async pullDown(
    startPoint?: Point,
    distance?: number,
    duration = 800,
  ): Promise<void> {
    const { width, height } = await this.size();

    // Default start point is near top of screen (but not too close to edge)
    const start = startPoint
      ? { x: startPoint.left, y: startPoint.top }
      : { x: width / 2, y: height * 0.15 };

    // Default distance is larger to ensure refresh is triggered
    const pullDistance = distance || height * 0.5;
    const end = { x: start.x, y: start.y + pullDistance };

    // Use custom drag with specified duration for better pull-to-refresh detection
    await this.pullDrag(start, end, duration);
    await sleep(200); // Give more time for refresh to start
  }

  private async pullDrag(
    from: { x: number; y: number },
    to: { x: number; y: number },
    duration: number,
  ): Promise<void> {
    const adb = await this.getAdb();

    // Use adjusted coordinates
    const { x: fromX, y: fromY } = this.adjustCoordinates(from.x, from.y);
    const { x: toX, y: toY } = this.adjustCoordinates(to.x, to.y);

    // Use the specified duration for better pull gesture recognition
    await adb.shell(`input swipe ${fromX} ${fromY} ${toX} ${toY} ${duration}`);
  }

  async pullUp(
    startPoint?: Point,
    distance?: number,
    duration = 600,
  ): Promise<void> {
    const { width, height } = await this.size();

    // Default start point is bottom center of screen
    const start = startPoint
      ? { x: startPoint.left, y: startPoint.top }
      : { x: width / 2, y: height * 0.85 };

    // Default distance is 1/3 of screen height
    const pullDistance = distance || height * 0.4;
    const end = { x: start.x, y: start.y - pullDistance };

    // Use pullDrag for consistent pull gesture handling
    await this.pullDrag(start, end, duration);
    await sleep(100);
  }

  async getXpathsById(id: string): Promise<string[]> {
    throw new Error('Not implemented');
  }

  async getXpathsByPoint(
    point: Point,
    isOrderSensitive: boolean,
  ): Promise<string[]> {
    throw new Error('Not implemented');
  }

  async getElementInfoByXpath(xpath: string): Promise<ElementInfo> {
    throw new Error('Not implemented');
  }

  async hideKeyboard(
    options?: AndroidDeviceInputOpt,
    timeoutMs = 1000,
  ): Promise<boolean> {
    const adb = await this.getAdb();
    const keyboardDismissStrategy =
      options?.keyboardDismissStrategy ??
      this.options?.keyboardDismissStrategy ??
      'esc-first';

    // Check if keyboard is shown
    const keyboardStatus = await adb.isSoftKeyboardPresent();
    const isKeyboardShown =
      typeof keyboardStatus === 'boolean'
        ? keyboardStatus
        : keyboardStatus?.isKeyboardShown;

    if (!isKeyboardShown) {
      debugPage('Keyboard has no UI; no closing necessary');
      return false;
    }

    // Determine key codes order based on strategy
    const keyCodes =
      keyboardDismissStrategy === 'back-first'
        ? [4, 111] // KEYCODE_BACK, KEYCODE_ESCAPE
        : [111, 4]; // KEYCODE_ESCAPE, KEYCODE_BACK

    // Try each key code with waiting
    for (const keyCode of keyCodes) {
      await adb.keyevent(keyCode);

      // Wait for keyboard to be hidden with timeout
      const startTime = Date.now();
      const intervalMs = 100;

      while (Date.now() - startTime < timeoutMs) {
        await sleep(intervalMs);

        const currentStatus = await adb.isSoftKeyboardPresent();
        const isStillShown =
          typeof currentStatus === 'boolean'
            ? currentStatus
            : currentStatus?.isKeyboardShown;

        if (!isStillShown) {
          debugPage(`Keyboard hidden successfully with keycode ${keyCode}`);
          return true;
        }
      }

      debugPage(
        `Keyboard still shown after keycode ${keyCode}, trying next key`,
      );
    }

    console.warn(
      'Warning: Failed to hide the software keyboard after trying both ESC and BACK keys',
    );
    return false;
  }
}
