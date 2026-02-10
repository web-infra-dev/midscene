import assert from 'node:assert';
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
  type IOSDeviceInputOpt,
  type IOSDeviceOpt,
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
import { sleep } from '@midscene/core/utils';
import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import type { ElementInfo } from '@midscene/shared/extractor';
import { createImgBase64ByFormat } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { normalizeForComparison } from '@midscene/shared/utils';
import { WDAManager } from '@midscene/webdriver';
import { IOSWebDriverClient as WebDriverAgentBackend } from './ios-webdriver-client';

// Re-export IOSDeviceOpt and IOSDeviceInputOpt for backward compatibility
export type { IOSDeviceOpt, IOSDeviceInputOpt } from '@midscene/core/device';

const debugDevice = getDebug('ios:device');

/**
 * HTTP methods supported by WebDriverAgent API
 */
export const WDA_HTTP_METHODS = ['GET', 'POST', 'DELETE', 'PUT'] as const;
export type WDAHttpMethod = (typeof WDA_HTTP_METHODS)[number];

export class IOSDevice implements AbstractInterface {
  private deviceId: string;
  private devicePixelRatio = 1;
  private devicePixelRatioInitialized = false;
  private destroyed = false;
  private description: string | undefined;
  private customActions?: DeviceAction<any>[];
  private wdaBackend: WebDriverAgentBackend;
  private wdaManager: WDAManager;
  private appNameMapping: Record<string, string> = {};
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
              'The text to input. Provide the final content for replace/append modes, or an empty string when using clear mode to remove existing text.',
            ),
          autoDismissKeyboard: z
            .boolean()
            .optional()
            .describe(
              'Whether to dismiss the keyboard after input. Defaults to true if not specified. Set to false to keep the keyboard visible after input.',
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
          if (param.mode !== 'typeOnly') {
            await this.clearInput(element as unknown as ElementInfo);
          }

          if (param.mode === 'clear') {
            // Clear mode removes existing text without entering new characters
            return;
          }

          if (!param || !param.value) {
            return;
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
          1000,
        );
      }),
      defineActionSwipe(async (param) => {
        const { startPoint, endPoint, duration, repeatCount } =
          normalizeMobileSwipeParam(param, await this.size());
        for (let i = 0; i < repeatCount; i++) {
          await this.swipe(
            startPoint.x,
            startPoint.y,
            endPoint.x,
            endPoint.y,
            duration,
          );
        }
      }),
      defineActionKeyboardPress(async (param) => {
        await this.pressKey(param.keyName);
      }),
      defineActionCursorMove(async (param) => {
        const arrowKey =
          param.direction === 'left' ? 'ArrowLeft' : 'ArrowRight';
        const times = param.times ?? 1;
        for (let i = 0; i < times; i++) {
          await this.pressKey(arrowKey);
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
          assert(element, 'LongPress requires an element to be located');
          const [x, y] = element.center;
          await this.longPress(x, y, param?.duration);
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

  constructor(options?: IOSDeviceOpt) {
    // deviceId will be auto-detected from WebDriverAgent connection
    this.deviceId = 'pending-connection';
    this.options = options;
    this.customActions = options?.customActions;

    const wdaPort = options?.wdaPort || DEFAULT_WDA_PORT;
    const wdaHost = options?.wdaHost || 'localhost';
    this.wdaBackend = new WebDriverAgentBackend({
      port: wdaPort,
      host: wdaHost,
    });
    this.wdaManager = WDAManager.getInstance(wdaPort, wdaHost);
  }

  describe(): string {
    return this.description || `Device ID: ${this.deviceId}`;
  }

  async getConnectedDeviceInfo(): Promise<{
    udid: string;
    name: string;
    model: string;
  } | null> {
    return await this.wdaBackend.getDeviceInfo();
  }

  public async connect(): Promise<void> {
    assert(
      !this.destroyed,
      `IOSDevice ${this.deviceId} has been destroyed and cannot execute commands`,
    );

    debugDevice(`Connecting to iOS device: ${this.deviceId}`);

    try {
      // Start WebDriverAgent
      await this.wdaManager.start();

      // Create WDA session
      await this.wdaBackend.createSession();

      // Try to get real device info from WebDriverAgent
      const deviceInfo = await this.wdaBackend.getDeviceInfo();
      if (deviceInfo?.udid) {
        // Update deviceId with real UDID from WebDriverAgent
        this.deviceId = deviceInfo.udid;
        debugDevice(`Updated device ID to real UDID: ${this.deviceId}`);
      }

      // Get device screen size for description
      const size = await this.getScreenSize();
      this.description = `
UDID: ${this.deviceId}${
        deviceInfo
          ? `
Name: ${deviceInfo.name}
Model: ${deviceInfo.model}`
          : ''
      }
Type: WebDriverAgent
ScreenSize: ${size.width}x${size.height} (DPR: ${size.scale})
`;
      debugDevice('iOS device connected successfully', this.description);
    } catch (e) {
      debugDevice(`Failed to connect to iOS device: ${e}`);
      throw new Error(`Unable to connect to iOS device ${this.deviceId}: ${e}`);
    }
  }

  /**
   * Set the app name to bundle ID mapping
   */
  public setAppNameMapping(mapping: Record<string, string>): void {
    this.appNameMapping = mapping;
  }

  /**
   * Resolve app name to bundle ID using the mapping.
   * Comparison is case-insensitive and ignores spaces, dashes, and underscores.
   * Keys in appNameMapping are pre-normalized, so we only need to normalize the input.
   *
   * @param appName The app name to resolve.
   */
  private resolveBundleId(appName: string): string | undefined {
    const normalizedAppName = normalizeForComparison(appName);
    return this.appNameMapping[normalizedAppName];
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
        // Launch app using bundle ID or app name
        // Auto-resolve friendly app name to bundle ID if mapping exists
        const resolvedUri = this.resolveBundleId(uri) ?? uri;
        await this.wdaBackend.launchApp(resolvedUri);
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

  private async initializeDevicePixelRatio(): Promise<void> {
    if (this.devicePixelRatioInitialized) {
      return;
    }

    // Get real device pixel ratio from WebDriverAgent /wda/screen endpoint
    const apiScale = await this.wdaBackend.getScreenScale();

    assert(
      apiScale && apiScale > 0,
      'Failed to get device pixel ratio from WebDriverAgent API',
    );

    debugDevice(`Got screen scale from WebDriverAgent API: ${apiScale}`);
    this.devicePixelRatio = apiScale;
    this.devicePixelRatioInitialized = true;
  }

  async getScreenSize(): Promise<{
    width: number;
    height: number;
    scale: number;
  }> {
    // Ensure device pixel ratio is initialized
    await this.initializeDevicePixelRatio();

    const windowSize = await this.wdaBackend.getWindowSize();

    return {
      width: windowSize.width,
      height: windowSize.height,
      scale: this.devicePixelRatio,
    };
  }

  async size(): Promise<Size> {
    const screenSize = await this.getScreenSize();

    return {
      width: screenSize.width,
      height: screenSize.height,
      dpr: screenSize.scale,
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

  async clearInput(element?: ElementInfo): Promise<void> {
    if (element) {
      // Tap on the input field to focus it
      await this.tap(element.center[0], element.center[1]);
      await sleep(100);
    }

    // For iOS, use WebDriver's standard clear API
    // This gets the currently focused element and clears it using the /element/{id}/clear endpoint
    // Works reliably with dynamic input fields and doesn't trigger unwanted events
    debugDevice('Attempting to clear input with WebDriver Clear API');
    const cleared = await this.wdaBackend.clearActiveElement();
    if (cleared) {
      debugDevice('Successfully cleared input with WebDriver Clear API');
    } else {
      debugDevice(
        'WebDriver Clear API returned false (no active element or clear failed)',
      );
    }
  }

  async url(): Promise<string> {
    return '';
  }

  // Core interaction methods
  async tap(x: number, y: number): Promise<void> {
    await this.wdaBackend.tap(Math.round(x), Math.round(y));
  }

  // Android-compatible method name
  async mouseClick(x: number, y: number): Promise<void> {
    debugDevice(`mouseClick at coordinates (${x}, ${y})`);
    await this.tap(x, y);
  }

  async doubleTap(x: number, y: number): Promise<void> {
    await this.wdaBackend.doubleTap(Math.round(x), Math.round(y));
  }

  async tripleTap(x: number, y: number): Promise<void> {
    await this.wdaBackend.tripleTap(Math.round(x), Math.round(y));
  }

  async longPress(x: number, y: number, duration = 1000): Promise<void> {
    await this.wdaBackend.longPress(Math.round(x), Math.round(y), duration);
  }

  async swipe(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    duration = 500,
  ): Promise<void> {
    await this.wdaBackend.swipe(
      Math.round(fromX),
      Math.round(fromY),
      Math.round(toX),
      Math.round(toY),
      duration,
    );
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
      await this.hideKeyboard();
    }
  }

  async pressKey(key: string): Promise<void> {
    await this.wdaBackend.pressKey(key);
  }

  // Scroll methods
  async scrollUp(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint
      ? { x: Math.round(startPoint.left), y: Math.round(startPoint.top) }
      : { x: Math.round(width / 2), y: Math.round(height / 2) };
    const scrollDistance = Math.round(distance || height / 3);

    await this.swipe(start.x, start.y, start.x, start.y + scrollDistance);
  }

  async scrollDown(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint
      ? { x: Math.round(startPoint.left), y: Math.round(startPoint.top) }
      : { x: Math.round(width / 2), y: Math.round(height / 2) };
    const scrollDistance = Math.round(distance || height / 3);

    await this.swipe(start.x, start.y, start.x, start.y - scrollDistance);
  }

  async scrollLeft(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    // scrollLeft: bring left content into view (swipe finger right)
    const start = startPoint
      ? { x: Math.round(startPoint.left), y: Math.round(startPoint.top) }
      : { x: Math.round(width / 2), y: Math.round(height / 2) };
    const scrollDistance = Math.round(distance || width * 0.7); // Use 70% of width for sufficient scroll

    await this.swipe(start.x, start.y, start.x + scrollDistance, start.y);
  }

  async scrollRight(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    // scrollRight: bring right content into view (swipe finger left)
    const start = startPoint
      ? { x: Math.round(startPoint.left), y: Math.round(startPoint.top) }
      : { x: Math.round(width / 2), y: Math.round(height / 2) };
    const scrollDistance = Math.round(distance || width * 0.7); // Use 70% of width for sufficient scroll

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
      start = {
        x: Math.round(startPoint.left),
        y: Math.round(startPoint.top),
      };
    } else {
      switch (direction) {
        case 'up':
          start = { x: Math.round(width / 2), y: Math.round(height * 0.2) };
          break;
        case 'down':
          start = { x: Math.round(width / 2), y: Math.round(height * 0.8) };
          break;
        case 'left':
          start = { x: Math.round(width * 0.8), y: Math.round(height / 2) };
          break;
        case 'right':
          start = { x: Math.round(width * 0.2), y: Math.round(height / 2) };
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
        const scrollDistance = Math.round(
          direction === 'left' || direction === 'right'
            ? width * 0.6
            : height * 0.6,
        );

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
    await this.wdaBackend.pressHomeButton();
  }

  async appSwitcher(): Promise<void> {
    try {
      // For iOS, use swipe up with slower/longer duration to trigger app switcher
      debugDevice('Triggering app switcher with slow swipe up gesture');
      const { width, height } = await this.size();

      // Swipe up from the very bottom of the screen to trigger app switcher
      const centerX = Math.round(width / 2);
      const startY = Math.round(height - 5); // Start from very bottom
      const endY = Math.round(height * 0.5); // Swipe to middle of screen

      // Use a slower, longer swipe to trigger app switcher without additional tapping
      // Longer duration mimics the "hold" behavior during the swipe itself
      await this.wdaBackend.swipe(centerX, startY, centerX, endY, 1500); // Slower swipe

      await sleep(800); // Wait for app switcher to appear and stabilize
    } catch (error) {
      debugDevice(`App switcher failed: ${error}`);
      throw new Error(`Failed to trigger app switcher: ${error}`);
    }
  }

  async hideKeyboard(keyNames?: string[]): Promise<boolean> {
    try {
      // Always try WDA's dismissKeyboard API first (most reliable)
      // Use common keyboard button names if not specified
      const dismissKeys =
        keyNames && keyNames.length > 0
          ? keyNames
          : ['return', 'done', 'go', 'search', 'next', 'send'];

      debugDevice(
        `Attempting to dismiss keyboard using WDA API with keys: ${dismissKeys.join(', ')}`,
      );

      try {
        await this.wdaBackend.dismissKeyboard(dismissKeys);
        debugDevice('Successfully dismissed keyboard using WDA API');
        await sleep(500); // Wait longer to ensure UI is stable
        return true;
      } catch (wdaError) {
        debugDevice(
          `WDA dismissKeyboard failed, falling back to swipe gesture: ${wdaError}`,
        );
      }

      // Fallback: Use swipe gesture if WDA API fails
      // Use safer coordinates: swipe up from bottom of screen
      const windowSize = await this.wdaBackend.getWindowSize();
      const centerX = Math.round(windowSize.width / 2);
      const startY = Math.round(windowSize.height * 0.9); // Start near bottom
      const endY = Math.round(windowSize.height * 0.5); // Swipe up to middle

      // Perform swipe up gesture to dismiss keyboard
      await this.swipe(centerX, startY, centerX, endY, 300);
      debugDevice(
        'Dismissed keyboard with swipe up gesture from bottom of screen',
      );

      await sleep(500); // Wait longer to ensure UI is stable
      return true;
    } catch (error) {
      debugDevice(`Failed to hide keyboard: ${error}`);
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
      await this.wdaBackend.terminateApp('com.apple.mobilesafari');
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

  /**
   * Execute a WebDriverAgent API request directly
   * This is the iOS equivalent of Android's runAdbShell
   * @param method HTTP method (GET, POST, DELETE, PUT)
   * @param endpoint WebDriver API endpoint
   * @param data Optional request body data
   * @returns Response from the WebDriver API
   */
  async runWdaRequest<TResult = any>(
    method: WDAHttpMethod,
    endpoint: string,
    data?: any,
  ): Promise<TResult> {
    return await this.wdaBackend.executeRequest<TResult>(
      method,
      endpoint,
      data,
    );
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
}

const runWdaRequestParamSchema = z.object({
  method: z
    .enum(WDA_HTTP_METHODS)
    .describe('HTTP method (GET, POST, DELETE, PUT)'),
  endpoint: z.string().describe('WebDriver API endpoint'),
  data: z
    .object({})
    .passthrough()
    .optional()
    .describe('Optional request body data as JSON object'),
});

type RunWdaRequestParam = z.infer<typeof runWdaRequestParamSchema>;
type RunWdaRequestReturn = Awaited<ReturnType<IOSDevice['runWdaRequest']>>;

const launchParamSchema = z
  .string()
  .describe(
    'App name, bundle ID, or URL to launch. Prioritize using the exact bundle ID or URL the user has provided. If none provided, use the accurate app name.',
  );

type LaunchParam = z.infer<typeof launchParamSchema>;

export type DeviceActionRunWdaRequest = DeviceAction<
  RunWdaRequestParam,
  RunWdaRequestReturn
>;
export type DeviceActionLaunch = DeviceAction<LaunchParam, void>;

/**
 * Platform-specific action definitions for iOS
 * Single source of truth for both runtime behavior and type definitions
 */
const createPlatformActions = (device: IOSDevice) => {
  return {
    RunWdaRequest: defineAction<
      typeof runWdaRequestParamSchema,
      RunWdaRequestParam,
      RunWdaRequestReturn
    >({
      name: 'RunWdaRequest',
      description: 'Execute WebDriverAgent API request directly on iOS device',
      interfaceAlias: 'runWdaRequest',
      paramSchema: runWdaRequestParamSchema,
      call: async (param) => {
        return await device.runWdaRequest(
          param.method,
          param.endpoint,
          param.data,
        );
      },
    }),
    Launch: defineAction<typeof launchParamSchema, LaunchParam, void>({
      name: 'Launch',
      description: 'Launch an iOS app or URL',
      interfaceAlias: 'launch',
      paramSchema: launchParamSchema,
      call: async (param) => {
        await device.launch(param);
      },
    }),
    IOSHomeButton: defineAction({
      name: 'IOSHomeButton',
      description: 'Trigger the system "home" operation on iOS devices',
      call: async () => {
        await device.home();
      },
    }),
    IOSAppSwitcher: defineAction({
      name: 'IOSAppSwitcher',
      description: 'Trigger the system "app switcher" operation on iOS devices',
      call: async () => {
        await device.appSwitcher();
      },
    }),
  } as const;
};

export type DeviceActionIOSHomeButton = DeviceAction<undefined, void>;
export type DeviceActionIOSAppSwitcher = DeviceAction<undefined, void>;
