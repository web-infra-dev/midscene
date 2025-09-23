import assert from 'node:assert';
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
import { sleep } from '@midscene/core/utils';
import type { ElementInfo } from '@midscene/shared/extractor';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { WebDriverAgentBackend } from './wda-backend';
import { WDAManager } from './wda-manager';

const debugDevice = getDebug('ios:device');

export type IOSDeviceInputOpt = {
  autoDismissKeyboard?: boolean;
  keyboardDismissStrategy?: 'done-first' | 'escape-first';
};

export type IOSDeviceOpt = {
  deviceId?: string;
  customActions?: DeviceAction<any>[];
  wdaPort?: number;
  wdaHost?: string;
  useWDA?: boolean;
} & IOSDeviceInputOpt;

export class IOSDevice implements AbstractInterface {
  private deviceId: string;
  private devicePixelRatio = 1;
  private destroyed = false;
  private description: string | undefined;
  private customActions?: DeviceAction<any>[];
  private wdaBackend: WebDriverAgentBackend;
  private wdaManager: WDAManager;
  interfaceType: InterfaceType = 'ios';
  uri: string | undefined;
  options?: IOSDeviceOpt;

  actionSpace(): DeviceAction<any>[] {
    const defaultActions = [
      defineActionTap(async (param: ActionTapParam) => {
        const element = param.locate;
        assert(element, 'Element not found, cannot tap');
        await this.mouseClick(element.center[0], element.center[1]);
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
              'The final that should be filled in the input box. No matter what modifications are required, just provide the final value to replace the existing input value. Giving a blank string means clear the input field.',
            ),
          autoDismissKeyboard: z
            .boolean()
            .optional()
            .describe(
              'If true, the keyboard will be dismissed after the input is completed. Do not set it unless the user asks you to do so.',
            ),
          locate: getMidsceneLocationSchema()
            .describe('The input field to be filled')
            .optional(),
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
          await this.typeText(param.value, {
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
        await this.swipe(
          from.center[0],
          from.center[1],
          to.center[0],
          to.center[1],
        );
      }),
      defineActionKeyboardPress(async (param) => {
        const key = param.keyName;
        await this.pressKey(key);
      }),
      defineAction({
        name: 'IOSHomeButton',
        description: 'Trigger the system "home" operation on iOS devices',
        paramSchema: z.object({}),
        call: async () => {
          await this.home();
        },
      }),
      defineAction({
        name: 'IOSAppSwitcher',
        description:
          'Trigger the system "app switcher" operation on iOS devices',
        paramSchema: z.object({}),
        call: async () => {
          await this.appSwitcher();
        },
      }),
      defineAction({
        name: 'IOSLongPress',
        description:
          'Trigger a long press on the screen at specified coordinates on iOS devices',
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
            throw new Error('IOSLongPress requires an element to be located');
          }
          const [x, y] = element.center;
          await this.longPress(x, y, param?.duration);
        },
      }),
    ];

    const customActions = this.customActions || [];
    return [...defaultActions, ...customActions];
  }

  constructor(deviceId: string, options?: IOSDeviceOpt) {
    assert(deviceId, 'deviceId is required for IOSDevice');

    this.deviceId = deviceId;
    this.options = options;
    this.customActions = options?.customActions;

    const wdaPort = options?.wdaPort || 8100;
    const wdaHost = options?.wdaHost || 'localhost';
    this.wdaBackend = new WebDriverAgentBackend(deviceId, wdaPort, wdaHost);
    this.wdaManager = WDAManager.getInstance(deviceId, wdaPort, wdaHost);
  }

  describe(): string {
    return this.description || `Device ID: ${this.deviceId}`;
  }

  public async connect(): Promise<void> {
    if (this.destroyed) {
      throw new Error(
        `IOSDevice ${this.deviceId} has been destroyed and cannot execute commands`,
      );
    }

    debugDevice(`Connecting to iOS device: ${this.deviceId}`);

    try {
      // Start WebDriverAgent
      await this.wdaManager.start();

      // Create WDA session
      await this.wdaBackend.createSession();

      // Get device screen size for description
      const size = await this.getScreenSize();
      this.description = `
UDID: ${this.deviceId}
Type: WebDriverAgent
ScreenSize: ${size.width}x${size.height} (DPR: ${this.devicePixelRatio})
`;
      debugDevice('iOS device connected successfully', this.description);
    } catch (e) {
      debugDevice(`Failed to connect to iOS device: ${e}`);
      throw new Error(`Unable to connect to iOS device ${this.deviceId}: ${e}`);
    }
  }

  public async launch(uri: string): Promise<IOSDevice> {
    this.uri = uri;

    try {
      debugDevice(`Launching app: ${uri}`);
      if (
        uri.startsWith('http://') ||
        uri.startsWith('https://') ||
        uri.includes('://')
      ) {
        // Try to open URL using WebDriverAgent
        await this.openUrl(uri);
      } else {
        // Launch app using bundle ID
        await this.wdaBackend.launchApp(uri);
      }
      debugDevice(`Successfully launched: ${uri}`);
    } catch (error: any) {
      debugDevice(`Error launching ${uri}: ${error}`);
      throw new Error(`Failed to launch ${uri}: ${error.message}`);
    }

    return this;
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

  async getScreenSize(): Promise<{
    width: number;
    height: number;
    scale: number;
  }> {
    try {
      const windowSize = await this.wdaBackend.getWindowSize();
      // WDA returns logical points, for our coordinate system we use scale = 1
      // This means we work directly with the logical coordinates that WDA provides
      const scale = 1; // Use 1 to work with WDA's logical coordinate system directly

      return {
        width: windowSize.width,
        height: windowSize.height,
        scale,
      };
    } catch (e) {
      debugDevice(`Failed to get screen size: ${e}`);
      // Fallback to default iPhone size with scale 1
      return {
        width: 402,
        height: 874,
        scale: 1,
      };
    }
  }

  async size(): Promise<Size> {
    const screenSize = await this.getScreenSize();
    this.devicePixelRatio = screenSize.scale;

    return {
      width: screenSize.width,
      height: screenSize.height,
      dpr: this.devicePixelRatio,
    };
  }

  async screenshotBase64(): Promise<string> {
    debugDevice('Taking screenshot via WDA');
    try {
      const base64Data = await this.wdaBackend.takeScreenshot();
      const result = createImgBase64ByFormat('png', base64Data);
      debugDevice('Screenshot taken successfully');
      return result;
    } catch (error) {
      debugDevice(`Screenshot failed: ${error}`);
      throw new Error(`Failed to take screenshot: ${error}`);
    }
  }

  async clearInput(element: ElementInfo): Promise<void> {
    if (!element) {
      return;
    }

    // Tap on the input field to focus it
    await this.tap(element.center[0], element.center[1]);
    await sleep(100);

    // For iOS, we need to use different methods to clear text
    try {
      // Method 1: Try to use WDA's element clear if available
      await this.wdaBackend.clearElement();
    } catch (error) {
      debugDevice(`Method 1 failed, trying method 2: ${error}`);
      try {
        // Method 2: Long press to select all, then delete
        await this.longPress(element.center[0], element.center[1], 800);
        await sleep(200);

        // Type empty string to replace selected text
        await this.wdaBackend.typeText('');
      } catch (error2) {
        debugDevice(`Method 2 failed, trying method 3: ${error2}`);
        try {
          // Method 3: Send multiple backspace characters
          const backspaces = Array(30).fill('\u0008').join(''); // Unicode backspace
          await this.wdaBackend.typeText(backspaces);
        } catch (error3) {
          debugDevice(`All clear methods failed: ${error3}`);
          // Continue anyway, maybe there was no text to clear
        }
      }
    }
  }

  async url(): Promise<string> {
    return '';
  }

  // Core interaction methods
  async tap(x: number, y: number): Promise<void> {
    await this.wdaBackend.tap(x, y);
  }

  // Android-compatible method name
  async mouseClick(x: number, y: number): Promise<void> {
    debugDevice(`mouseClick at coordinates (${x}, ${y})`);
    await this.tap(x, y);
  }

  async doubleTap(x: number, y: number): Promise<void> {
    await this.wdaBackend.doubleTap(x, y);
  }

  async longPress(x: number, y: number, duration = 1000): Promise<void> {
    await this.wdaBackend.longPress(x, y, duration);
  }

  async swipe(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    duration = 500,
  ): Promise<void> {
    await this.wdaBackend.swipe(fromX, fromY, toX, toY, duration);
  }

  async typeText(text: string, options?: IOSDeviceInputOpt): Promise<void> {
    if (!text) return;

    const shouldAutoDismissKeyboard =
      options?.autoDismissKeyboard ?? this.options?.autoDismissKeyboard ?? true;

    debugDevice(`Typing text: "${text}"`);

    try {
      // Wait a bit to ensure keyboard is ready
      await sleep(200);
      await this.wdaBackend.typeText(text);
      await sleep(300); // Give more time for text to appear
    } catch (error) {
      debugDevice(`Failed to type text with WDA: ${error}`);
      throw error;
    }

    if (shouldAutoDismissKeyboard) {
      await this.hideKeyboard(options);
    }
  }

  async pressKey(key: string): Promise<void> {
    await this.wdaBackend.pressKey(key);
  }

  // Scroll methods
  async scrollUp(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint
      ? { x: startPoint.left, y: startPoint.top }
      : { x: width / 2, y: height / 2 };
    const scrollDistance = distance || height / 3;

    await this.swipe(start.x, start.y, start.x, start.y + scrollDistance);
  }

  async scrollDown(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint
      ? { x: startPoint.left, y: startPoint.top }
      : { x: width / 2, y: height / 2 };
    const scrollDistance = distance || height / 3;

    await this.swipe(start.x, start.y, start.x, start.y - scrollDistance);
  }

  async scrollLeft(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint
      ? { x: startPoint.left, y: startPoint.top }
      : { x: width / 2, y: height / 2 };
    const scrollDistance = distance || width / 3;

    await this.swipe(start.x, start.y, start.x + scrollDistance, start.y);
  }

  async scrollRight(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint
      ? { x: startPoint.left, y: startPoint.top }
      : { x: width / 2, y: height / 2 };
    const scrollDistance = distance || width / 3;

    await this.swipe(start.x, start.y, start.x - scrollDistance, start.y);
  }

  async scrollUntilTop(startPoint?: Point): Promise<void> {
    debugDevice(
      'Using screenshot-based scroll detection for better reliability',
    );
    await this.scrollUntilBoundary('up', startPoint, 1);
  }

  async scrollUntilBottom(startPoint?: Point): Promise<void> {
    debugDevice(
      'Using screenshot-based scroll detection for better reliability',
    );
    await this.scrollUntilBoundary('down', startPoint, 1);
  }

  // Smart screenshot comparison method that tolerates minor dynamic changes
  private compareScreenshots(
    screenshot1: string,
    screenshot2: string,
    tolerancePercent = 2, // Allow 2% difference
  ): boolean {
    // Identical screenshots are the ideal case
    if (screenshot1 === screenshot2) {
      debugDevice('Screenshots are identical');
      return true;
    }

    const len1 = screenshot1.length;
    const len2 = screenshot2.length;
    debugDevice(`Screenshots differ: length1=${len1}, length2=${len2}`);

    // If length difference is too large, content is genuinely different
    if (Math.abs(len1 - len2) > Math.min(len1, len2) * 0.1) {
      debugDevice('Screenshots have significant length difference');
      return false;
    }

    // For screenshots with similar length, calculate character difference percentage
    if (len1 > 0 && len2 > 0) {
      const minLength = Math.min(len1, len2);
      const sampleSize = Math.min(2000, minLength); // Check first 2000 characters
      let diffCount = 0;

      for (let i = 0; i < sampleSize; i++) {
        if (screenshot1[i] !== screenshot2[i]) {
          diffCount++;
        }
      }

      const diffPercent = (diffCount / sampleSize) * 100;
      debugDevice(
        `Character differences: ${diffCount}/${sampleSize} (${diffPercent.toFixed(2)}%)`,
      );

      // If difference is within tolerance, consider screenshots similar (no substantial content change)
      const isSimilar = diffPercent <= tolerancePercent;
      if (isSimilar) {
        debugDevice(
          `Screenshots are similar enough (${diffPercent.toFixed(2)}% <= ${tolerancePercent}%)`,
        );
      }
      return isSimilar;
    }

    return false;
  }

  // Generic scroll-to-boundary detection method
  private async scrollUntilBoundary(
    direction: 'up' | 'down' | 'left' | 'right',
    startPoint?: Point,
    maxUnchangedCount = 1,
  ): Promise<void> {
    const maxAttempts = 20;
    const { width, height } = await this.size();

    // Determine starting position based on scroll direction
    let start: { x: number; y: number };
    if (startPoint) {
      start = { x: startPoint.left, y: startPoint.top };
    } else {
      switch (direction) {
        case 'up':
          start = { x: width / 2, y: height * 0.2 };
          break;
        case 'down':
          start = { x: width / 2, y: height * 0.8 };
          break;
        case 'left':
          start = { x: width * 0.8, y: height / 2 };
          break;
        case 'right':
          start = { x: width * 0.2, y: height / 2 };
          break;
      }
    }

    let lastScreenshot: string | null = null;
    let unchangedCount = 0;

    debugDevice(`Starting scroll to ${direction} with content detection`);

    for (let i = 0; i < maxAttempts; i++) {
      try {
        debugDevice(`Scroll attempt ${i + 1}/${maxAttempts}`);

        // Wait for any previous scroll to stabilize
        await sleep(500);

        // Take a single stable screenshot
        const currentScreenshot = await this.screenshotBase64();

        if (
          lastScreenshot &&
          this.compareScreenshots(lastScreenshot, currentScreenshot, 10) // Tolerate 10% difference for dynamic content
        ) {
          unchangedCount++;
          debugDevice(
            `Screen content unchanged (${unchangedCount}/${maxUnchangedCount})`,
          );

          if (unchangedCount >= maxUnchangedCount) {
            debugDevice(
              `Reached ${direction}: screen content no longer changes`,
            );
            break;
          }
        } else {
          // Content changed, reset counter
          if (lastScreenshot) {
            debugDevice(
              `Content changed, resetting counter (was ${unchangedCount})`,
            );
          }
          unchangedCount = 0;
        }

        // Safety measure to prevent infinite scrolling: if consecutive attempts have large differences, may be too much dynamic content
        if (i >= 15 && unchangedCount === 0) {
          debugDevice(
            `Too many attempts with dynamic content, stopping scroll to ${direction}`,
          );
          break;
        }

        lastScreenshot = currentScreenshot;

        // Execute scroll action
        const scrollDistance =
          direction === 'left' || direction === 'right'
            ? width * 0.6
            : height * 0.6;

        debugDevice(
          `Performing scroll: ${direction}, distance: ${scrollDistance}`,
        );

        switch (direction) {
          case 'up':
            await this.swipe(
              start.x,
              start.y,
              start.x,
              start.y + scrollDistance,
              300,
            );
            break;
          case 'down':
            await this.swipe(
              start.x,
              start.y,
              start.x,
              start.y - scrollDistance,
              300,
            );
            break;
          case 'left':
            await this.swipe(
              start.x,
              start.y,
              start.x + scrollDistance,
              start.y,
              300,
            );
            break;
          case 'right':
            await this.swipe(
              start.x,
              start.y,
              start.x - scrollDistance,
              start.y,
              300,
            );
            break;
        }

        // Critical: wait for scroll action completion + inertia scrolling to stop
        debugDevice('Waiting for scroll and inertia to complete...');
        await sleep(2000); // 300ms scroll + inertia time + page stabilization time
      } catch (error) {
        debugDevice(`Error during scroll attempt ${i + 1}: ${error}`);
        await sleep(300);
      }
    }

    debugDevice(
      `Scroll to ${direction} completed after ${maxAttempts} attempts`,
    );
  }

  async scrollUntilLeft(startPoint?: Point): Promise<void> {
    await this.scrollUntilBoundary('left', startPoint, 1); // 1 detection is enough for horizontal scrolling
  }

  async scrollUntilRight(startPoint?: Point): Promise<void> {
    await this.scrollUntilBoundary('right', startPoint, 3);
  }

  // iOS specific methods
  async home(): Promise<void> {
    await this.wdaBackend.homeButton();
  }

  async appSwitcher(): Promise<void> {
    try {
      // For iOS, use swipe up with slower/longer duration to trigger app switcher
      debugDevice('Triggering app switcher with slow swipe up gesture');
      const { width, height } = await this.size();

      // Swipe up from the very bottom of the screen to trigger app switcher
      const centerX = width / 2;
      const startY = height - 5; // Start from very bottom
      const endY = height * 0.5; // Swipe to middle of screen

      // Use a slower, longer swipe to trigger app switcher without additional tapping
      // Longer duration mimics the "hold" behavior during the swipe itself
      await this.wdaBackend.swipe(centerX, startY, centerX, endY, 1500); // Slower swipe

      await sleep(800); // Wait for app switcher to appear and stabilize
    } catch (error) {
      debugDevice(`App switcher failed: ${error}`);
      throw new Error(`Failed to trigger app switcher: ${error}`);
    }
  }

  async hideKeyboard(_options?: IOSDeviceInputOpt): Promise<boolean> {
    try {
      // Use WebDriverAgent's dedicated keyboard dismiss API
      await this.wdaBackend.makeRequest(
        'POST',
        `/session/${this.wdaBackend.sessionInfo!.sessionId}/wda/keyboard/dismiss`,
      );
      debugDevice('Successfully dismissed keyboard using WDA API');
      await sleep(300);
      return true;
    } catch (e) {
      debugDevice(`Failed to hide keyboard using WDA API: ${e}`);
      return false;
    }
  }

  /**
   * Open a URL using WebDriverAgent
   * @param url The URL to open (supports http://, https://, and custom schemes)
   * @param options Configuration options for URL opening
   */
  async openUrl(
    url: string,
    options?: {
      useSafariAsBackup?: boolean;
      waitTime?: number;
    },
  ): Promise<void> {
    const opts = {
      useSafariAsBackup: true,
      waitTime: 2000,
      ...options,
    };

    try {
      debugDevice(`Opening URL: ${url}`);

      // Try direct URL opening first
      await this.wdaBackend.openUrl(url);
      await sleep(opts.waitTime);

      debugDevice(`Successfully opened URL: ${url}`);
    } catch (error) {
      debugDevice(`Direct URL opening failed: ${error}`);

      if (opts.useSafariAsBackup) {
        debugDevice(`Attempting to open URL via Safari: ${url}`);
        await this.openUrlViaSafari(url);
      } else {
        throw new Error(`Failed to open URL: ${error}`);
      }
    }
  }

  /**
   * Open a URL via Safari (backup method for real devices)
   * @param url The URL to open
   */
  async openUrlViaSafari(url: string): Promise<void> {
    try {
      debugDevice(`Opening URL via Safari: ${url}`);

      // Launch Safari
      await this.wdaBackend.launchApp('com.apple.mobilesafari');
      await sleep(2000); // Wait for Safari to launch

      // Find and tap the address bar
      // Note: This is a simplified implementation. In practice, you might need
      // to handle different Safari UI states (new tab, existing tab, etc.)

      // Type the URL in the address bar
      await this.typeText(url);
      await sleep(500);

      // Press Return to navigate
      await this.pressKey('Return');
      await sleep(1000);

      // Handle potential app confirmation dialog
      // iOS shows a dialog asking if you want to open the app
      try {
        // Look for "Open" button and tap it if present
        // This is a best-effort approach as the dialog appearance may vary
        await sleep(2000); // Wait for potential dialog
        debugDevice(`URL opened via Safari: ${url}`);
      } catch (dialogError) {
        debugDevice(
          `No confirmation dialog or dialog handling failed: ${dialogError}`,
        );
      }
    } catch (error) {
      debugDevice(`Failed to open URL via Safari: ${error}`);
      throw new Error(`Failed to open URL via Safari: ${error}`);
    }
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    try {
      // Delete WDA session
      await this.wdaBackend.deleteSession();

      // Stop WDA manager
      await this.wdaManager.stop();
    } catch (error) {
      debugDevice(`Error during cleanup: ${error}`);
    }

    this.destroyed = true;
    debugDevice(`iOS device ${this.deviceId} destroyed`);
  }

  // Legacy methods (not applicable for WDA)
  async getXpathsById(): Promise<string[]> {
    throw new Error('Not implemented');
  }

  async getXpathsByPoint(): Promise<string[]> {
    throw new Error('Not implemented');
  }

  async getElementInfoByXpath(): Promise<ElementInfo> {
    throw new Error('Not implemented');
  }
}
