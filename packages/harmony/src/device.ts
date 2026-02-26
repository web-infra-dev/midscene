import assert from 'node:assert';
import fs, { unlink } from 'node:fs';
import {
  type DeviceAction,
  type InterfaceType,
  type LocateResultElement,
  type Point,
  type Size,
  getMidsceneLocationSchema,
  z,
} from '@midscene/core';
import {
  type AbstractInterface,
  type ActionTapParam,
  type HarmonyDeviceOpt,
  defineAction,
  defineActionClearInput,
  defineActionCursorMove,
  defineActionDoubleClick,
  defineActionDragAndDrop,
  defineActionKeyboardPress,
  defineActionScroll,
  defineActionSwipe,
  defineActionTap,
  normalizeMobileSwipeParam,
} from '@midscene/core/device';
import { getTmpFile, sleep } from '@midscene/core/utils';
import type { ElementInfo } from '@midscene/shared/extractor';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { normalizeForComparison, repeat } from '@midscene/shared/utils';
import { HdcClient } from './hdc';

export type { HarmonyDeviceOpt } from '@midscene/core/device';

const defaultScrollUntilTimes = 10;
const defaultSwipeSpeed = 600;
const defaultFastSwipeSpeed = 2000;
const maxScrollDistance = 9999999;
const scrollQuadrantDivisions = 4;

const debugDevice = getDebug('harmony:device');

export class HarmonyDevice implements AbstractInterface {
  private deviceId: string;
  private hdc: HdcClient | null = null;
  private connecting: Promise<HdcClient> | null = null;
  private destroyed = false;
  private descriptionText: string | undefined;
  private customActions?: DeviceAction<any>[];
  private cachedScreenSize: { width: number; height: number } | null = null;
  private appNameMapping: Record<string, string> = {};
  private lastTapPosition: { x: number; y: number } | null = null;
  interfaceType: InterfaceType = 'harmony';
  uri: string | undefined;
  options?: HarmonyDeviceOpt;

  actionSpace(): DeviceAction<any>[] {
    const defaultActions = [
      defineActionTap(async (param: ActionTapParam) => {
        const element = param.locate;
        assert(element, 'Element not found, cannot tap');
        await this.tap(element.center[0], element.center[1]);
      }),
      defineActionDoubleClick(async (param) => {
        const element = param.locate;
        assert(element, 'Element not found, cannot double click');
        await this.doubleTap(element.center[0], element.center[1]);
      }),
      defineAction({
        name: 'Input',
        description: 'Input text into the input field',
        interfaceAlias: 'aiInput',
        paramSchema: z.object({
          value: z
            .string()
            .describe(
              'The text to input. Provide the final content for replace/append modes, or an empty string when using clear mode to remove existing text.',
            ),
          mode: z.preprocess(
            (val) => (val === 'append' ? 'typeOnly' : val),
            z
              .enum(['replace', 'clear', 'typeOnly'])
              .default('replace')
              .optional()
              .describe(
                'Input mode: "replace" (default) - clear the field and input the value; "typeOnly" - type the value directly without clearing the field first; "clear" - clear the field without inputting new text.',
              ),
          ),
          locate: getMidsceneLocationSchema()
            .describe('The input field to be filled')
            .optional(),
        }),
        call: async (param) => {
          const element = param.locate;

          if (param.mode === 'clear') {
            await this.clearInput(element as unknown as ElementInfo);
            return;
          }

          if (!param || !param.value) {
            return;
          }

          const shouldReplace = param.mode !== 'typeOnly';
          await this.inputText(
            param.value,
            element as unknown as LocateResultElement | undefined,
            shouldReplace,
          );
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
        if (scrollToEventName === 'scrollToTop') {
          await this.scrollUntilTop(startingPoint);
        } else if (scrollToEventName === 'scrollToBottom') {
          await this.scrollUntilBottom(startingPoint);
        } else if (scrollToEventName === 'scrollToRight') {
          await this.scrollUntilRight(startingPoint);
        } else if (scrollToEventName === 'scrollToLeft') {
          await this.scrollUntilLeft(startingPoint);
        } else if (scrollToEventName === 'singleAction' || !scrollToEventName) {
          if (param?.direction === 'down' || !param || !param.direction) {
            await this.scrollDown(param?.distance ?? undefined, startingPoint);
          } else if (param.direction === 'up') {
            await this.scrollUp(param.distance || undefined, startingPoint);
          } else if (param.direction === 'left') {
            await this.scrollLeft(param.distance || undefined, startingPoint);
          } else if (param.direction === 'right') {
            await this.scrollRight(param.distance || undefined, startingPoint);
          } else {
            throw new Error(`Unknown scroll direction: ${param.direction}`);
          }
          await sleep(500);
        } else {
          throw new Error(
            `Unknown scroll event type: ${scrollToEventName}, param: ${JSON.stringify(param)}`,
          );
        }
      }),
      defineActionDragAndDrop(async (param) => {
        const from = param.from;
        const to = param.to;
        assert(from, 'missing "from" param for drag and drop');
        assert(to, 'missing "to" param for drag and drop');
        const hdc = await this.getHdc();
        await hdc.drag(
          from.center[0],
          from.center[1],
          to.center[0],
          to.center[1],
        );
      }),
      defineActionSwipe(async (param) => {
        const { startPoint, endPoint, duration, repeatCount } =
          normalizeMobileSwipeParam(param, await this.size());
        const hdc = await this.getHdc();
        for (let i = 0; i < repeatCount; i++) {
          await hdc.swipe(
            startPoint.x,
            startPoint.y,
            endPoint.x,
            endPoint.y,
            duration ? Math.round(duration) : undefined,
          );
        }
      }),
      defineActionKeyboardPress(async (param) => {
        await this.keyboardPress(param.keyName);
      }),
      defineActionCursorMove(async (param) => {
        const arrowKey =
          param.direction === 'left' ? 'ArrowLeft' : 'ArrowRight';
        const times = param.times ?? 1;
        for (let i = 0; i < times; i++) {
          await this.keyboardPress(arrowKey);
          await sleep(100);
        }
      }),
      defineAction<
        z.ZodObject<{
          duration: z.ZodOptional<z.ZodNumber>;
          locate: ReturnType<typeof getMidsceneLocationSchema>;
        }>,
        {
          duration?: number;
          locate: LocateResultElement;
        }
      >({
        name: 'LongPress',
        description: 'Trigger a long press on the screen at specified element',
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
            throw new Error('LongPress requires an element to be located');
          }
          await this.longPress(element.center[0], element.center[1]);
        },
      }),
      defineActionClearInput(async (param) => {
        await this.clearInput(param.locate as ElementInfo | undefined);
      }),
    ];

    const platformSpecificActions = Object.values(createPlatformActions(this));

    const customActions = this.customActions || [];
    return [...defaultActions, ...platformSpecificActions, ...customActions];
  }

  constructor(deviceId: string, options?: HarmonyDeviceOpt) {
    assert(deviceId, 'deviceId is required for HarmonyDevice');

    this.deviceId = deviceId;
    this.options = options;
    this.customActions = options?.customActions;
  }

  describe(): string {
    return this.descriptionText || `DeviceId: ${this.deviceId}`;
  }

  public async connect(): Promise<HdcClient> {
    const hdc = await this.getHdc();
    return hdc;
  }

  public async getHdc(): Promise<HdcClient> {
    if (this.destroyed) {
      throw new Error(
        `HarmonyDevice ${this.deviceId} has been destroyed and cannot execute HDC commands`,
      );
    }

    if (this.hdc) {
      return this.hdc;
    }

    if (this.connecting) {
      return this.connecting;
    }

    this.connecting = (async () => {
      debugDevice(`Initializing HDC with device ID: ${this.deviceId}`);
      try {
        this.hdc = new HdcClient({
          hdcPath: this.options?.hdcPath,
          deviceId: this.deviceId,
        });

        const screenInfo = await this.hdc.getScreenInfo();
        this.cachedScreenSize = screenInfo;

        this.descriptionText = `DeviceId: ${this.deviceId}\nScreenSize: ${screenInfo.width}x${screenInfo.height}`;
        debugDevice('HDC initialized successfully', this.descriptionText);
        return this.hdc;
      } catch (e) {
        debugDevice(`Failed to initialize HDC: ${e}`);
        throw new Error(`Unable to connect to device ${this.deviceId}: ${e}`);
      } finally {
        this.connecting = null;
      }
    })();

    return this.connecting;
  }

  public setAppNameMapping(mapping: Record<string, string>): void {
    this.appNameMapping = mapping;
  }

  private resolvePackageName(appName: string): string | undefined {
    const normalizedAppName = normalizeForComparison(appName);
    return this.appNameMapping[normalizedAppName];
  }

  public async launch(uri: string): Promise<HarmonyDevice> {
    const hdc = await this.getHdc();

    this.uri = uri;

    try {
      debugDevice(`Launching app: ${uri}`);
      if (
        uri.startsWith('http://') ||
        uri.startsWith('https://') ||
        uri.includes('://')
      ) {
        // URI with scheme - use aa start -U
        await hdc.shell(`aa start -U ${uri}`);
      } else if (uri.includes('/')) {
        // Format: bundleName/abilityName
        const [bundleName, abilityName] = uri.split('/');
        await hdc.startAbility(bundleName, abilityName);
      } else {
        // Bundle name or app name
        const bundleName = this.resolvePackageName(uri) ?? uri;
        try {
          await hdc.startAbility(bundleName, 'EntryAbility');
        } catch (e: any) {
          if (!e.message?.includes('resolve ability')) throw e;
          // EntryAbility not found, auto-discover the main ability
          const mainAbility = await hdc.queryMainAbility(bundleName);
          if (!mainAbility) {
            throw new Error(
              `Cannot find a launchable ability for ${bundleName}`,
            );
          }
          debugDevice(
            `EntryAbility not found, using discovered ability: ${mainAbility}`,
          );
          await hdc.startAbility(bundleName, mainAbility);
        }
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

  async getScreenSize(): Promise<{ width: number; height: number }> {
    if (this.cachedScreenSize) {
      return this.cachedScreenSize;
    }

    const hdc = await this.getHdc();
    const screenInfo = await hdc.getScreenInfo();
    this.cachedScreenSize = screenInfo;
    return screenInfo;
  }

  async size(): Promise<Size> {
    const screenInfo = await this.getScreenSize();
    const scale = this.options?.screenshotResizeScale ?? 1;

    const logicalWidth = Math.round(screenInfo.width * scale);
    const logicalHeight = Math.round(screenInfo.height * scale);

    return {
      width: logicalWidth,
      height: logicalHeight,
    };
  }

  async screenshotBase64(): Promise<string> {
    debugDevice('screenshotBase64 begin');
    const hdc = await this.getHdc();

    const screenshotId = Date.now().toString(36);
    const remoteScreenshotPath = `/data/local/tmp/ms_${screenshotId}.jpeg`;
    const localScreenshotPath = getTmpFile('jpeg')!;

    try {
      // Take screenshot on device
      await hdc.screenshot(remoteScreenshotPath);

      // Pull to local
      await hdc.fileRecv(remoteScreenshotPath, localScreenshotPath);

      // Read file
      const screenshotBuffer = await fs.promises.readFile(localScreenshotPath);

      if (!screenshotBuffer || screenshotBuffer.length === 0) {
        throw new Error('Screenshot buffer is empty');
      }

      debugDevice(`Screenshot captured: ${screenshotBuffer.length} bytes`);

      const result = createImgBase64ByFormat(
        'jpeg',
        screenshotBuffer.toString('base64'),
      );
      debugDevice('screenshotBase64 end');
      return result;
    } finally {
      // Cleanup remote file asynchronously
      Promise.resolve()
        .then(() => hdc.shell(`rm ${remoteScreenshotPath}`))
        .catch((error) => {
          debugDevice(`Failed to delete remote screenshot: ${error}`);
        });

      // Cleanup local file
      unlink(localScreenshotPath, (unlinkError) => {
        if (unlinkError) {
          debugDevice(`Failed to delete local screenshot: ${unlinkError}`);
        }
      });
    }
  }

  async tap(x: number, y: number): Promise<void> {
    this.lastTapPosition = { x, y };
    const hdc = await this.getHdc();
    await hdc.click(x, y);
  }

  async doubleTap(x: number, y: number): Promise<void> {
    const hdc = await this.getHdc();
    await hdc.doubleClick(x, y);
  }

  async longPress(x: number, y: number): Promise<void> {
    const hdc = await this.getHdc();
    await hdc.longClick(x, y);
  }

  async inputText(
    text: string,
    element?: LocateResultElement,
    shouldReplace?: boolean,
  ): Promise<void> {
    if (!text) return;

    const hdc = await this.getHdc();
    let x: number;
    let y: number;

    if (element) {
      [x, y] = element.center;
    } else if (this.lastTapPosition) {
      x = this.lastTapPosition.x;
      y = this.lastTapPosition.y;
    } else {
      const { width, height } = await this.size();
      x = Math.round(width / 2);
      y = Math.round(height / 2);
    }

    if (shouldReplace) {
      // Type a sentinel char to put the input into "typing mode", then Ctrl+A
      // to select all text (including any existing content). The subsequent
      // inputText will replace the entire selection with the new text.
      // This pattern was verified to work on HarmonyOS uitest.
      await hdc.inputText(x, y, '.');
      await hdc.keyEvent('2072', '2017'); // Ctrl+A: select all in focused input
    }

    await hdc.inputText(x, y, text);

    if (this.options?.autoDismissKeyboard) {
      await this.hideKeyboard();
    }
  }

  async clearInput(_element?: ElementInfo): Promise<void> {
    // No-op: do NOT tap or send keyboard shortcuts here.
    // Tapping causes keyboard popup + page shift, making inputText miss its target.
    // Ctrl+A without focus selects page text and shows context menu, blocking input.
    // The subsequent inputText (uitest uiInput inputText) handles click+type atomically.
  }

  async keyboardPress(key: string): Promise<void> {
    // HarmonyOS uitest only accepts Back/Home/Power as string names.
    // All other keys must use numeric keycodes.
    const harmonyKeyCodeMap: Record<string, string> = {
      Enter: '2054',
      Backspace: '2055',
      Tab: '2049',
      Escape: '2070',
      Home: 'Home',
      ArrowUp: '2012',
      ArrowDown: '2013',
      ArrowLeft: '2014',
      ArrowRight: '2015',
      Space: '2050',
      Delete: '2071',
    };

    const normalizedKey = this.normalizeKeyName(key);
    const harmonyKey = harmonyKeyCodeMap[normalizedKey] ?? key;

    const hdc = await this.getHdc();
    await hdc.keyEvent(harmonyKey);
  }

  private normalizeKeyName(key: string): string {
    const keyNameAliasMap: Record<string, string> = {
      enter: 'Enter',
      backspace: 'Backspace',
      tab: 'Tab',
      escape: 'Escape',
      esc: 'Escape',
      home: 'Home',
      space: 'Space',
      delete: 'Delete',
      arrowup: 'ArrowUp',
      arrowdown: 'ArrowDown',
      arrowleft: 'ArrowLeft',
      arrowright: 'ArrowRight',
      up: 'ArrowUp',
      down: 'ArrowDown',
      left: 'ArrowLeft',
      right: 'ArrowRight',
    };

    const lowerKey = key.toLowerCase();
    return keyNameAliasMap[lowerKey] ?? key;
  }

  async scroll(deltaX: number, deltaY: number, speed?: number): Promise<void> {
    if (deltaX === 0 && deltaY === 0) {
      throw new Error('Scroll distance cannot be zero in both directions');
    }

    const { width, height } = await this.size();
    const n = scrollQuadrantDivisions;

    const startX = Math.round(deltaX < 0 ? (n - 1) * (width / n) : width / n);
    const startY = Math.round(deltaY < 0 ? (n - 1) * (height / n) : height / n);

    const maxPositiveDeltaX = startX;
    const maxNegativeDeltaX = width - startX;
    const maxPositiveDeltaY = startY;
    const maxNegativeDeltaY = height - startY;

    deltaX = Math.max(-maxNegativeDeltaX, Math.min(deltaX, maxPositiveDeltaX));
    deltaY = Math.max(-maxNegativeDeltaY, Math.min(deltaY, maxPositiveDeltaY));

    const endX = Math.round(startX - deltaX);
    const endY = Math.round(startY - deltaY);

    const hdc = await this.getHdc();
    await hdc.swipe(startX, startY, endX, endY, speed ?? defaultSwipeSpeed);
  }

  async scrollDown(distance?: number, startPoint?: Point): Promise<void> {
    const { height } = await this.size();
    const scrollDistance = Math.round(distance ?? height);

    if (startPoint) {
      const hdc = await this.getHdc();
      const startX = Math.round(startPoint.left);
      const startY = Math.round(startPoint.top);
      const endY = Math.max(0, startY - scrollDistance);
      await hdc.swipe(startX, startY, startX, endY);
      return;
    }

    await this.scroll(0, scrollDistance);
  }

  async scrollUp(distance?: number, startPoint?: Point): Promise<void> {
    const { height } = await this.size();
    const scrollDistance = Math.round(distance ?? height);

    if (startPoint) {
      const hdc = await this.getHdc();
      const startX = Math.round(startPoint.left);
      const startY = Math.round(startPoint.top);
      const endY = Math.min(height, startY + scrollDistance);
      await hdc.swipe(startX, startY, startX, endY);
      return;
    }

    await this.scroll(0, -scrollDistance);
  }

  async scrollLeft(distance?: number, startPoint?: Point): Promise<void> {
    const { width } = await this.size();
    const scrollDistance = Math.round(distance ?? width);

    if (startPoint) {
      const hdc = await this.getHdc();
      const startX = Math.round(startPoint.left);
      const startY = Math.round(startPoint.top);
      const endX = Math.min(width, startX + scrollDistance);
      await hdc.swipe(startX, startY, endX, startY);
      return;
    }

    await this.scroll(-scrollDistance, 0);
  }

  async scrollRight(distance?: number, startPoint?: Point): Promise<void> {
    const { width } = await this.size();
    const scrollDistance = Math.round(distance ?? width);

    if (startPoint) {
      const hdc = await this.getHdc();
      const startX = Math.round(startPoint.left);
      const startY = Math.round(startPoint.top);
      const endX = Math.max(0, startX - scrollDistance);
      await hdc.swipe(startX, startY, endX, startY);
      return;
    }

    await this.scroll(scrollDistance, 0);
  }

  async scrollUntilTop(startPoint?: Point): Promise<void> {
    if (startPoint) {
      const { height } = await this.size();
      const hdc = await this.getHdc();
      const startX = Math.round(startPoint.left);
      const startY = Math.round(startPoint.top);

      await repeat(defaultScrollUntilTimes, () =>
        hdc.fling(
          startX,
          startY,
          startX,
          Math.round(height),
          defaultFastSwipeSpeed,
        ),
      );
      await sleep(1000);
      return;
    }

    await repeat(defaultScrollUntilTimes, () =>
      this.scroll(0, -maxScrollDistance, defaultFastSwipeSpeed),
    );
    await sleep(1000);
  }

  async scrollUntilBottom(startPoint?: Point): Promise<void> {
    if (startPoint) {
      const hdc = await this.getHdc();
      const startX = Math.round(startPoint.left);
      const startY = Math.round(startPoint.top);

      await repeat(defaultScrollUntilTimes, () =>
        hdc.fling(startX, startY, startX, 0, defaultFastSwipeSpeed),
      );
      await sleep(1000);
      return;
    }

    await repeat(defaultScrollUntilTimes, () =>
      this.scroll(0, maxScrollDistance, defaultFastSwipeSpeed),
    );
    await sleep(1000);
  }

  async scrollUntilLeft(startPoint?: Point): Promise<void> {
    if (startPoint) {
      const { width } = await this.size();
      const hdc = await this.getHdc();
      const startX = Math.round(startPoint.left);
      const startY = Math.round(startPoint.top);

      await repeat(defaultScrollUntilTimes, () =>
        hdc.fling(
          startX,
          startY,
          Math.round(width),
          startY,
          defaultFastSwipeSpeed,
        ),
      );
      await sleep(1000);
      return;
    }

    await repeat(defaultScrollUntilTimes, () =>
      this.scroll(-maxScrollDistance, 0, defaultFastSwipeSpeed),
    );
    await sleep(1000);
  }

  async scrollUntilRight(startPoint?: Point): Promise<void> {
    if (startPoint) {
      const hdc = await this.getHdc();
      const startX = Math.round(startPoint.left);
      const startY = Math.round(startPoint.top);

      await repeat(defaultScrollUntilTimes, () =>
        hdc.fling(startX, startY, 0, startY, defaultFastSwipeSpeed),
      );
      await sleep(1000);
      return;
    }

    await repeat(defaultScrollUntilTimes, () =>
      this.scroll(maxScrollDistance, 0, defaultFastSwipeSpeed),
    );
    await sleep(1000);
  }

  async back(): Promise<void> {
    const hdc = await this.getHdc();
    await hdc.keyEvent('Back');
  }

  async home(): Promise<void> {
    const hdc = await this.getHdc();
    await hdc.keyEvent('Home');
  }

  async recentApps(): Promise<void> {
    const hdc = await this.getHdc();
    // HarmonyOS recent apps key event
    await hdc.keyEvent('RecentApps');
  }

  async hideKeyboard(): Promise<void> {
    const hdc = await this.getHdc();
    await hdc.keyEvent('Back');
  }

  async getTimestamp(): Promise<number> {
    const hdc = await this.getHdc();
    try {
      const stdout = await hdc.shell('date +%s%3N');
      const timestamp = Number.parseInt(stdout.trim(), 10);

      if (Number.isNaN(timestamp)) {
        throw new Error(`Invalid timestamp format: ${stdout}`);
      }

      debugDevice(`Got device time: ${timestamp}`);
      return timestamp;
    } catch (error) {
      debugDevice(`Failed to get device time: ${error}`);
      throw new Error(`Failed to get device time: ${error}`);
    }
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    this.cachedScreenSize = null;
    this.hdc = null;
    this.connecting = null;
  }
}

const runHdcShellParamSchema = z.object({
  command: z.string().describe('HDC shell command to execute'),
});

const launchParamSchema = z.object({
  uri: z
    .string()
    .describe(
      'App name, bundle name, or URL to launch. Prioritize using the exact bundle name or URL the user has provided. If none provided, use the accurate app name.',
    ),
});

type RunHdcShellParam = z.infer<typeof runHdcShellParamSchema>;
type LaunchParam = z.infer<typeof launchParamSchema>;

export type DeviceActionRunHdcShell = DeviceAction<RunHdcShellParam, string>;
export type DeviceActionLaunch = DeviceAction<LaunchParam, void>;

const createPlatformActions = (
  device: HarmonyDevice,
): {
  RunHdcShell: DeviceActionRunHdcShell;
  Launch: DeviceActionLaunch;
  HarmonyBackButton: DeviceActionHarmonyBackButton;
  HarmonyHomeButton: DeviceActionHarmonyHomeButton;
  HarmonyRecentAppsButton: DeviceActionHarmonyRecentAppsButton;
} => {
  return {
    RunHdcShell: defineAction({
      name: 'RunHdcShell',
      description: 'Execute HDC shell command on HarmonyOS device',
      interfaceAlias: 'runHdcShell',
      paramSchema: runHdcShellParamSchema,
      call: async (param) => {
        if (!param.command || param.command.trim() === '') {
          throw new Error('RunHdcShell requires a non-empty command parameter');
        }
        const hdc = await device.getHdc();
        return await hdc.shell(param.command);
      },
    }),
    Launch: defineAction({
      name: 'Launch',
      description: 'Launch a HarmonyOS app or URL',
      interfaceAlias: 'launch',
      paramSchema: launchParamSchema,
      call: async (param) => {
        if (!param.uri || param.uri.trim() === '') {
          throw new Error('Launch requires a non-empty uri parameter');
        }
        await device.launch(param.uri);
      },
    }),
    HarmonyBackButton: defineAction({
      name: 'HarmonyBackButton',
      description: 'Trigger the system "back" operation on HarmonyOS devices',
      call: async () => {
        await device.back();
      },
    }),
    HarmonyHomeButton: defineAction({
      name: 'HarmonyHomeButton',
      description: 'Trigger the system "home" operation on HarmonyOS devices',
      call: async () => {
        await device.home();
      },
    }),
    HarmonyRecentAppsButton: defineAction({
      name: 'HarmonyRecentAppsButton',
      description:
        'Trigger the system "recent apps" operation on HarmonyOS devices',
      call: async () => {
        await device.recentApps();
      },
    }),
  } as const;
};

export type DeviceActionHarmonyBackButton = DeviceAction<undefined, void>;
export type DeviceActionHarmonyHomeButton = DeviceAction<undefined, void>;
export type DeviceActionHarmonyRecentAppsButton = DeviceAction<undefined, void>;
