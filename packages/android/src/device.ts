import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import {
  type DeviceAction,
  type InterfaceType,
  type Point,
  type Size,
  getMidsceneLocationSchema,
  z,
} from '@midscene/core';
import {
  type AbstractInterface,
  type ActionTapParam,
  defineAction,
  defineActionDoubleClick,
  defineActionDragAndDrop,
  defineActionKeyboardPress,
  defineActionScroll,
  defineActionTap,
} from '@midscene/core/device';
import { getTmpFile, sleep } from '@midscene/core/utils';
import {
  MIDSCENE_ADB_PATH,
  MIDSCENE_ADB_REMOTE_HOST,
  MIDSCENE_ADB_REMOTE_PORT,
  MIDSCENE_ANDROID_IME_STRATEGY,
  globalConfigManager,
} from '@midscene/shared/env';
import type { ElementInfo } from '@midscene/shared/extractor';
import {
  createImgBase64ByFormat,
  isValidPNGImageBuffer,
  resizeAndConvertImgBuffer,
} from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { repeat } from '@midscene/shared/utils';

import { ADB } from 'appium-adb';

// only for Android, because it's impossible to scroll to the bottom, so we need to set a default scroll times
const defaultScrollUntilTimes = 10;
const defaultFastScrollDuration = 100;
const defaultNormalScrollDuration = 1000;

const debugDevice = getDebug('android:device');

export type AndroidDeviceInputOpt = {
  autoDismissKeyboard?: boolean;
  keyboardDismissStrategy?: 'esc-first' | 'back-first';
};

export type AndroidDeviceOpt = {
  androidAdbPath?: string;
  remoteAdbHost?: string;
  remoteAdbPort?: number;
  imeStrategy?: 'always-yadb' | 'yadb-for-non-ascii';
  displayId?: number;
  usePhysicalDisplayIdForScreenshot?: boolean;
  usePhysicalDisplayIdForDisplayLookup?: boolean;
} & AndroidDeviceInputOpt;

export class AndroidDevice implements AbstractInterface {
  private deviceId: string;
  private yadbPushed = false;
  private devicePixelRatio = 1;
  private adb: ADB | null = null;
  private connectingAdb: Promise<ADB> | null = null;
  private destroyed = false;
  private description: string | undefined;
  interfaceType: InterfaceType = 'android';
  uri: string | undefined;
  options?: AndroidDeviceOpt;

  actionSpace(): DeviceAction<any>[] {
    return [
      defineActionTap(async (param: ActionTapParam) => {
        const element = param.locate;
        assert(element, 'Element not found, cannot tap');
        await this.mouseClick(element.center[0], element.center[1]);
      }),
      defineActionDoubleClick(async (param) => {
        const element = param.locate;
        assert(element, 'Element not found, cannot double click');
        await this.mouseDoubleClick(element.center[0], element.center[1]);
      }),
      defineAction({
        name: 'Input',
        description: 'Input text into the input field',
        interfaceAlias: 'aiInput',
        paramSchema: z.object({
          value: z
            .string()
            .describe(
              'The final that should be filled in the input box. No matter what modifications are required, just provide the final value to replace the existing input value. Giving a blank string means clear the input field.',
            ),
          autoDismissKeyboard: z
            .boolean()
            .optional()
            .describe(
              'If true, the keyboard will be dismissed after the input is completed. Do not set it unless the user asks you to do so.',
            ),
          locate: getMidsceneLocationSchema().describe(
            'The input field to be filled',
          ),
        }),
        call: async (param) => {
          const element = param.locate;
          if (element) {
            await this.clearInput(element as unknown as ElementInfo);

            if (!param || !param.value) {
              return;
            }
          }

          const autoDismissKeyboard =
            param.autoDismissKeyboard ?? this.options?.autoDismissKeyboard;
          await this.keyboardType(param.value, {
            autoDismissKeyboard,
          });
        },
      }),
      defineActionScroll(async (param) => {
        const element = param.locate;
        const startingPoint = element
          ? {
              left: element.center[0],
              top: element.center[1],
            }
          : undefined;
        const scrollToEventName = param?.scrollType;
        if (scrollToEventName === 'untilTop') {
          await this.scrollUntilTop(startingPoint);
        } else if (scrollToEventName === 'untilBottom') {
          await this.scrollUntilBottom(startingPoint);
        } else if (scrollToEventName === 'untilRight') {
          await this.scrollUntilRight(startingPoint);
        } else if (scrollToEventName === 'untilLeft') {
          await this.scrollUntilLeft(startingPoint);
        } else if (scrollToEventName === 'once' || !scrollToEventName) {
          if (param?.direction === 'down' || !param || !param.direction) {
            await this.scrollDown(param?.distance || undefined, startingPoint);
          } else if (param.direction === 'up') {
            await this.scrollUp(param.distance || undefined, startingPoint);
          } else if (param.direction === 'left') {
            await this.scrollLeft(param.distance || undefined, startingPoint);
          } else if (param.direction === 'right') {
            await this.scrollRight(param.distance || undefined, startingPoint);
          } else {
            throw new Error(`Unknown scroll direction: ${param.direction}`);
          }
          // until mouse event is done
          await sleep(500);
        } else {
          throw new Error(
            `Unknown scroll event type: ${scrollToEventName}, param: ${JSON.stringify(
              param,
            )}`,
          );
        }
      }),
      defineActionDragAndDrop(async (param) => {
        const from = param.from;
        const to = param.to;
        assert(from, 'missing "from" param for drag and drop');
        assert(to, 'missing "to" param for drag and drop');
        await this.mouseDrag(
          {
            x: from.center[0],
            y: from.center[1],
          },
          {
            x: to.center[0],
            y: to.center[1],
          },
        );
      }),
      defineActionKeyboardPress(async (param) => {
        const key = param.keyName;
        await this.keyboardPress(key);
      }),
      defineAction({
        name: 'AndroidBackButton',
        description: 'Trigger the system "back" operation on Android devices',
        paramSchema: z.object({}),
        call: async () => {
          await this.back();
        },
      }),
      defineAction({
        name: 'AndroidHomeButton',
        description: 'Trigger the system "home" operation on Android devices',
        paramSchema: z.object({}),
        call: async () => {
          await this.home();
        },
      }),
      defineAction({
        name: 'AndroidRecentAppsButton',
        description:
          'Trigger the system "recent apps" operation on Android devices',
        paramSchema: z.object({}),
        call: async () => {
          await this.recentApps();
        },
      }),
      defineAction({
        name: 'AndroidLongPress',
        description:
          'Trigger a long press on the screen at specified coordinates on Android devices',
        paramSchema: z.object({
          duration: z
            .number()
            .optional()
            .describe('The duration of the long press in milliseconds'),
          locate: getMidsceneLocationSchema().describe(
            'The element to be long pressed',
          ),
        }),
        call: async (param) => {
          const element = param.locate;
          if (!element) {
            throw new Error(
              'AndroidLongPress requires an element to be located',
            );
          }
          const [x, y] = element.center;
          await this.longPress(x, y, param?.duration);
        },
      }),
      defineAction({
        name: 'AndroidPull',
        description: 'Trigger pull down to refresh or pull up actions',
        paramSchema: z.object({
          direction: z.enum(['up', 'down']).describe('The direction to pull'),
          distance: z
            .number()
            .optional()
            .describe('The distance to pull (in pixels)'),
          duration: z
            .number()
            .optional()
            .describe('The duration of the pull (in milliseconds)'),
          locate: getMidsceneLocationSchema()
            .optional()
            .describe('The element to start the pull from (optional)'),
        }),
        call: async (param) => {
          const element = param.locate;
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
      }),
    ];
  }

  constructor(deviceId: string, options?: AndroidDeviceOpt) {
    assert(deviceId, 'deviceId is required for AndroidDevice');

    this.deviceId = deviceId;
    this.options = options;
  }

  describe(): string {
    return this.description || `DeviceId: ${this.deviceId}`;
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
      debugDevice(`Initializing ADB with device ID: ${this.deviceId}`);
      try {
        const androidAdbPath =
          this.options?.androidAdbPath ||
          globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_PATH);
        const remoteAdbHost =
          this.options?.remoteAdbHost ||
          globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_REMOTE_HOST);
        const remoteAdbPort =
          this.options?.remoteAdbPort ||
          globalConfigManager.getEnvConfigValue(MIDSCENE_ADB_REMOTE_PORT);

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
        this.description = `
DeviceId: ${this.deviceId}
ScreenSize:
${Object.keys(size)
  .filter((key) => size[key as keyof typeof size])
  .map(
    (key) =>
      `  ${key} size: ${size[key as keyof typeof size]}${key === 'override' && size[key as keyof typeof size] ? ' ✅' : ''}`,
  )
  .join('\n')}
`;
        debugDevice('ADB initialized successfully', this.description);
        return this.adb;
      } catch (e) {
        debugDevice(`Failed to initialize ADB: ${e}`);
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
            debugDevice(`adb ${String(prop)} ${args.join(' ')}`);
            const result = await (
              originalMethod as (...args: any[]) => any
            ).apply(target, args);
            debugDevice(`adb ${String(prop)} ${args.join(' ')} end`);
            return result;
          } catch (error: any) {
            const methodName = String(prop);
            const deviceId = this.deviceId;
            debugDevice(
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
      debugDevice(`Launching app: ${uri}`);
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
      debugDevice(`Successfully launched: ${uri}`);
    } catch (error: any) {
      debugDevice(`Error launching ${uri}: ${error}`);
      throw new Error(`Failed to launch ${uri}: ${error.message}`, {
        cause: error,
      });
    }

    return this;
  }

  async execYadb(keyboardContent: string): Promise<void> {
    await this.ensureYadb();

    const adb = await this.getAdb();

    await adb.shell(
      `app_process${this.getDisplayArg()} -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -keyboard "${keyboardContent}"`,
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

  async getScreenSize(): Promise<{
    override: string;
    physical: string;
    orientation: number; // 0=portrait, 1=landscape, 2=reverse portrait, 3=reverse landscape
  }> {
    const adb = await this.getAdb();

    // If we have an displayId, try to get size from display info
    if (typeof this.options?.displayId === 'number') {
      try {
        const stdout = await adb.shell('dumpsys display');

        if (this.options?.usePhysicalDisplayIdForDisplayLookup) {
          const physicalDisplayId = await this.getPhysicalDisplayId();
          if (physicalDisplayId) {
            // Use regex to find the line containing the target display's uniqueId
            const lineRegex = new RegExp(
              `^.*uniqueId \"local:${physicalDisplayId}\".*$
`,
              'm',
            );
            const lineMatch = stdout.match(lineRegex);

            if (lineMatch) {
              const targetLine = lineMatch[0];
              // Extract real size and rotation from the found line
              const realMatch = targetLine.match(/real (\d+) x (\d+)/);
              const rotationMatch = targetLine.match(/rotation (\d+)/);

              if (realMatch && rotationMatch) {
                const width = Number(realMatch[1]);
                const height = Number(realMatch[2]);
                const rotation = Number(rotationMatch[1]);
                const sizeStr = `${width}x${height}`;

                debugDevice(
                  `Using display info for long ID ${physicalDisplayId}: ${sizeStr}, rotation: ${rotation}`,
                );

                return {
                  override: sizeStr,
                  physical: sizeStr,
                  orientation: rotation,
                };
              }
            }
          }
        } else {
          // Use regex to find the DisplayViewport containing the target display's displayId
          const viewportRegex = new RegExp(
            `DisplayViewport{[^}]*displayId=${this.options.displayId}[^}]*}`,
            'g',
          );
          const match = stdout.match(viewportRegex);
          if (match) {
            const targetLine = match[0];
            const physicalFrameMatch = targetLine.match(
              /physicalFrame=Rect\(\d+, \d+ - (\d+), (\d+)\)/,
            );
            const orientationMatch = targetLine.match(/orientation=(\d+)/);
            if (physicalFrameMatch && orientationMatch) {
              const width = Number(physicalFrameMatch[1]);
              const height = Number(physicalFrameMatch[2]);
              const rotation = Number(orientationMatch[1]);
              const sizeStr = `${width}x${height}`;

              debugDevice(
                `Using display info for display ID ${this.options.displayId}: ${sizeStr}, rotation: ${rotation}`,
              );

              return {
                override: sizeStr,
                physical: sizeStr,
                orientation: rotation,
              };
            }
          }
        }

        debugDevice(
          `Could not find display info for displayId ${this.options.displayId}`,
        );
      } catch (e) {
        debugDevice(
          `Failed to get size from display info for display ${this.options.displayId}: ${e}`,
        );
      }
    }

    // Fallback to wm size (global screen size)
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
      debugDevice(`Using Override size: ${overrideSize[1].trim()}`);
      size.override = overrideSize[1].trim();
    }

    // If Override size doesn't exist, fallback to Physical size
    const physicalSize = new RegExp(/Physical size: ([^\r?\n]+)*/g).exec(
      stdout,
    );
    if (physicalSize && physicalSize.length >= 2) {
      debugDevice(`Using Physical size: ${physicalSize[1].trim()}`);
      size.physical = physicalSize[1].trim();
    }

    const orientation = await this.getDisplayOrientation();

    if (size.override || size.physical) {
      return { ...size, orientation };
    }

    throw new Error(`Failed to get screen size, output: ${stdout}`);
  }

  async getDisplayDensity(): Promise<number> {
    const adb = await this.getAdb();

    // If we have an displayId, try to get density from display info
    if (typeof this.options?.displayId === 'number') {
      try {
        const stdout = await adb.shell('dumpsys display');
        if (this.options?.usePhysicalDisplayIdForDisplayLookup) {
          const physicalDisplayId = await this.getPhysicalDisplayId();
          if (physicalDisplayId) {
            // Use regex to find the line containing the target display's uniqueId
            const lineRegex = new RegExp(
              `^.*uniqueId \"local:${physicalDisplayId}\".*$
`,
              'm',
            );
            const lineMatch = stdout.match(lineRegex);

            if (lineMatch) {
              const targetLine = lineMatch[0];
              const densityMatch = targetLine.match(/density (\d+)/);
              if (densityMatch) {
                const density = Number(densityMatch[1]);
                debugDevice(
                  `Using display density for physical ID ${physicalDisplayId}: ${density}`,
                );
                return density;
              }
            }
          }
        } else {
          const displayDeviceRegex = new RegExp(
            `DisplayDevice:[\\s\\S]*?mDisplayId=${this.options.displayId}[\\s\\S]*?DisplayInfo{[^}]*density (\\d+)`,
            'm',
          );
          const deviceBlockMatch = stdout.match(displayDeviceRegex);
          if (deviceBlockMatch) {
            const density = Number(deviceBlockMatch[1]);
            debugDevice(
              `Using display density for display ID ${this.options.displayId}: ${density}`,
            );
            return density;
          }
        }
      } catch (e) {
        debugDevice(`Failed to get density from display info: ${e}`);
      }
    }

    // Fallback to global screen density
    const density = await adb.getScreenDensity();
    return density ?? 160; // Default to standard Android density if null
  }

  async getDisplayOrientation(): Promise<number> {
    const adb = await this.getAdb();
    let orientation = 0;

    try {
      const orientationStdout = await adb.shell(
        `dumpsys${this.getDisplayArg()} input | grep SurfaceOrientation`,
      );
      const orientationMatch = orientationStdout.match(
        /SurfaceOrientation:\s*(\d)/,
      );
      if (!orientationMatch) {
        throw new Error('Failed to get orientation from input');
      }

      orientation = Number(orientationMatch[1]);
      debugDevice(`Screen orientation: ${orientation}`);
    } catch (e) {
      debugDevice('Failed to get orientation from input, try display');
      try {
        const orientationStdout = await adb.shell(
          `dumpsys${this.getDisplayArg()} display | grep mCurrentOrientation`,
        );
        const orientationMatch = orientationStdout.match(
          /mCurrentOrientation=(\d)/,
        );
        if (!orientationMatch) {
          throw new Error('Failed to get orientation from display');
        }

        orientation = Number(orientationMatch[1]);
        debugDevice(`Screen orientation (fallback): ${orientation}`);
      } catch (e2) {
        orientation = 0;
        debugDevice('Failed to get orientation from display, default to 0');
      }
    }

    return orientation;
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

    // Get device display density using custom method
    const densityNum = await this.getDisplayDensity();
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
    debugDevice('screenshotBase64 begin');
    const { width, height } = await this.size();
    const adb = await this.getAdb();
    let screenshotBuffer;
    const androidScreenshotPath = `/data/local/tmp/midscene_screenshot_${randomUUID()}.png`;
    const useShellScreencap = typeof this.options?.displayId === 'number';

    try {
      if (useShellScreencap) {
        // appium-adb's takeScreenshot does not support specifying a display.
        // Throw an error to jump directly to the shell-based screencap logic.
        throw new Error(
          `Display ${this.options?.displayId} requires shell screencap`,
        );
      }
      debugDevice('Taking screenshot via adb.takeScreenshot');
      screenshotBuffer = await adb.takeScreenshot(null);
      debugDevice('adb.takeScreenshot completed');

      // make sure screenshotBuffer is not null
      if (!screenshotBuffer) {
        throw new Error(
          'Failed to capture screenshot: screenshotBuffer is null',
        );
      }

      // check if the buffer is a valid PNG image, it might be a error string
      if (!isValidPNGImageBuffer(screenshotBuffer)) {
        debugDevice('Invalid image buffer detected: not a valid image format');
        throw new Error(
          'Screenshot buffer has invalid format: could not find valid image signature',
        );
      }
    } catch (error) {
      debugDevice(
        `Taking screenshot via adb.takeScreenshot failed or was skipped: ${error}`,
      );
      const screenshotPath = getTmpFile('png')!;

      try {
        debugDevice('Fallback: taking screenshot via shell screencap');
        const displayId = this.options?.usePhysicalDisplayIdForScreenshot
          ? await this.getPhysicalDisplayId()
          : this.options?.displayId;
        const displayArg = displayId ? `-d ${displayId}` : '';
        try {
          // Take a screenshot and save it locally
          await adb.shell(
            `screencap -p ${displayArg} ${androidScreenshotPath}`.trim(),
          );
          debugDevice('adb.shell screencap completed');
        } catch (screencapError) {
          debugDevice('screencap failed, using forceScreenshot');
          await this.forceScreenshot(androidScreenshotPath);
          debugDevice('forceScreenshot completed');
        }

        debugDevice('Pulling screenshot file from device');
        await adb.pull(androidScreenshotPath, screenshotPath);
        debugDevice(`adb.pull completed, local path: ${screenshotPath}`);
        screenshotBuffer = await fs.promises.readFile(screenshotPath);
      } finally {
        await adb.shell(`rm ${androidScreenshotPath}`);
      }
    }

    debugDevice('Resizing screenshot image');
    const { buffer, format } = await resizeAndConvertImgBuffer(
      // both "adb.takeScreenshot" and "shell screencap" result are png format
      'png',
      screenshotBuffer,
      {
        width,
        height,
      },
    );
    debugDevice('Image resize completed');

    debugDevice('Converting to base64');
    const result = createImgBase64ByFormat(format, buffer.toString('base64'));
    debugDevice('screenshotBase64 end');
    return result;
  }

  async clearInput(element: ElementInfo): Promise<void> {
    if (!element) {
      return;
    }

    await this.ensureYadb();

    const adb = await this.getAdb();

    await this.mouseClick(element.center[0], element.center[1]);

    // Use the yadb tool to clear the input box
    await adb.shell(
      `app_process${this.getDisplayArg()} -Djava.class.path=/data/local/tmp/yadb /data/local/tmp com.ysbing.yadb.Main -keyboard "~CLEAR~"`,
    );

    if (await adb.isSoftKeyboardPresent()) {
      return;
    }

    await this.mouseClick(element.center[0], element.center[1]);
  }

  async forceScreenshot(path: string): Promise<void> {
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
      this.scroll(0, -9999999, defaultFastScrollDuration),
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
      this.scroll(0, 9999999, defaultFastScrollDuration),
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
      this.scroll(-9999999, 0, defaultFastScrollDuration),
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
      this.scroll(9999999, 0, defaultFastScrollDuration),
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

    await this.scroll(0, -scrollDistance);
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

    await this.scroll(0, scrollDistance);
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

    await this.scroll(-scrollDistance, 0);
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

    await this.scroll(scrollDistance, 0);
  }

  async ensureYadb() {
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

  async keyboardType(
    text: string,
    options?: AndroidDeviceInputOpt,
  ): Promise<void> {
    if (!text) return;
    const adb = await this.getAdb();
    const isChinese = /[\p{Script=Han}\p{sc=Hani}]/u.test(text);
    const IME_STRATEGY =
      (this.options?.imeStrategy ||
        globalConfigManager.getEnvConfigValue(MIDSCENE_ANDROID_IME_STRATEGY)) ??
      'always-yadb';
    const shouldAutoDismissKeyboard =
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

    if (shouldAutoDismissKeyboard === true) {
      await this.hideKeyboard(options);
    }
  }

  private normalizeKeyName(key: string): string {
    // Handle case-insensitive key mapping
    const keyMap: Record<string, string> = {
      // Basic keys
      enter: 'Enter',
      backspace: 'Backspace',
      tab: 'Tab',
      escape: 'Escape',
      esc: 'Escape', // Common abbreviation
      home: 'Home',
      end: 'End',
      // Arrow keys
      arrowup: 'ArrowUp',
      arrowdown: 'ArrowDown',
      arrowleft: 'ArrowLeft',
      arrowright: 'ArrowRight',
      up: 'ArrowUp', // Common shortcuts
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
    };

    const lowerKey = key.toLowerCase();
    return keyMap[lowerKey] || key; // Return original key if no mapping found
  }

  async keyboardPress(key: string): Promise<void> {
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

    // Normalize key to handle case-insensitive matching
    const normalizedKey = this.normalizeKeyName(key);
    const keyCode = keyCodeMap[normalizedKey];
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

  async mouseClick(x: number, y: number): Promise<void> {
    const adb = await this.getAdb();

    // Use adjusted coordinates
    const { x: adjustedX, y: adjustedY } = this.adjustCoordinates(x, y);
    await adb.shell(
      `input${this.getDisplayArg()} swipe ${adjustedX} ${adjustedY} ${adjustedX} ${adjustedY} 150`,
    );
  }

  async mouseDoubleClick(x: number, y: number): Promise<void> {
    const adb = await this.getAdb();
    const { x: adjustedX, y: adjustedY } = this.adjustCoordinates(x, y);

    // Use input tap for double-click as it generates proper touch events
    // that Android can recognize as a double-click gesture
    const tapCommand = `input${this.getDisplayArg()} tap ${adjustedX} ${adjustedY}`;
    await adb.shell(tapCommand);
    // Short delay between taps for double-click recognition
    await sleep(50);
    await adb.shell(tapCommand);
  }

  async mouseMove(x: number, y: number): Promise<void> {
    // ADB doesn't have direct cursor movement functionality, but we can record the position for subsequent operations
    // This is a no-op, as ADB doesn't support direct mouse movement
    return Promise.resolve();
  }

  async mouseDrag(
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
      `input${this.getDisplayArg()} swipe ${fromX} ${fromY} ${toX} ${toY} ${swipeDuration}`,
    );
  }

  async scroll(
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
      `input${this.getDisplayArg()} swipe ${adjustedStartX} ${adjustedStartY} ${adjustedEndX} ${adjustedEndY} ${swipeDuration}`,
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
    await adb.shell(`input${this.getDisplayArg()} keyevent 4`);
  }

  async home(): Promise<void> {
    const adb = await this.getAdb();
    await adb.shell(`input${this.getDisplayArg()} keyevent 3`);
  }

  async recentApps(): Promise<void> {
    const adb = await this.getAdb();
    await adb.shell(`input${this.getDisplayArg()} keyevent 187`);
  }

  async longPress(x: number, y: number, duration = 1000): Promise<void> {
    const adb = await this.getAdb();

    // Use adjusted coordinates
    const { x: adjustedX, y: adjustedY } = this.adjustCoordinates(x, y);
    await adb.shell(
      `input${this.getDisplayArg()} swipe ${adjustedX} ${adjustedY} ${adjustedX} ${adjustedY} ${duration}`,
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

  async pullDrag(
    from: { x: number; y: number },
    to: { x: number; y: number },
    duration: number,
  ): Promise<void> {
    const adb = await this.getAdb();

    // Use adjusted coordinates
    const { x: fromX, y: fromY } = this.adjustCoordinates(from.x, from.y);
    const { x: toX, y: toY } = this.adjustCoordinates(to.x, to.y);

    // Use the specified duration for better pull gesture recognition
    await adb.shell(
      `input${this.getDisplayArg()} swipe ${fromX} ${fromY} ${toX} ${toY} ${duration}`,
    );
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

  private getDisplayArg(): string {
    return typeof this.options?.displayId === 'number'
      ? ` -d ${this.options.displayId}`
      : '';
  }

  async getPhysicalDisplayId(): Promise<string | null> {
    if (typeof this.options?.displayId !== 'number') {
      return null;
    }

    const adb = await this.getAdb();
    try {
      const stdout = await adb.shell(
        `dumpsys SurfaceFlinger --display-id ${this.options.displayId}`,
      );

      // Parse the output to extract the physical display ID
      // Look for a pattern like "Display 123456789 (HWC display N):" where N matches our display ID
      const regex = new RegExp(
        `Display (\\d+) \\(HWC display ${this.options.displayId}\\):`,
      );
      const displayMatch = stdout.match(regex);
      if (displayMatch?.[1]) {
        debugDevice(
          `Found physical display ID: ${displayMatch[1]} for display ID: ${this.options.displayId}`,
        );
        return displayMatch[1];
      }

      debugDevice(
        `Could not find physical display ID for display ID: ${this.options.displayId}`,
      );
      return null;
    } catch (error) {
      debugDevice(`Error getting physical display ID: ${error}`);
      return null;
    }
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
      debugDevice('Keyboard has no UI; no closing necessary');
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
          debugDevice(`Keyboard hidden successfully with keycode ${keyCode}`);
          return true;
        }
      }

      debugDevice(
        `Keyboard still shown after keycode ${keyCode}, trying next key`,
      );
    }

    console.warn(
      'Warning: Failed to hide the software keyboard after trying both ESC and BACK keys',
    );
    return false;
  }
}
