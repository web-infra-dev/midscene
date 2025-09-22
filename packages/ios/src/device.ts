import assert from 'node:assert';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
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
// Note: These env variables are defined in @midscene/shared/env but we'll use them directly for now
const MIDSCENE_IOS_DEVICE_UDID = 'MIDSCENE_IOS_DEVICE_UDID';
const MIDSCENE_IOS_SIMULATOR_UDID = 'MIDSCENE_IOS_SIMULATOR_UDID';
import type { ElementInfo } from '@midscene/shared/extractor';
import {
  createImgBase64ByFormat,
} from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import { uuid } from '@midscene/shared/utils';

const execAsync = promisify(exec);

const debugDevice = getDebug('ios:device');

export type IOSDeviceInputOpt = {
  autoDismissKeyboard?: boolean;
  keyboardDismissStrategy?: 'done-first' | 'escape-first';
};

export type IOSDeviceOpt = {
  udid?: string;
  customActions?: DeviceAction<any>[];
} & IOSDeviceInputOpt;

export class IOSDevice implements AbstractInterface {
  private udid: string;
  private devicePixelRatio = 1;
  private destroyed = false;
  private description: string | undefined;
  private customActions?: DeviceAction<any>[];
  interfaceType: InterfaceType = 'ios';
  uri: string | undefined;
  options?: IOSDeviceOpt;

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
        description: 'Trigger the system "app switcher" operation on iOS devices',
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
            throw new Error(
              'IOSLongPress requires an element to be located',
            );
          }
          const [x, y] = element.center;
          await this.longPress(x, y, param?.duration);
        },
      }),
    ];

    const customActions = this.customActions || [];
    return [...defaultActions, ...customActions];
  }

  constructor(udid: string, options?: IOSDeviceOpt) {
    assert(udid, 'udid is required for IOSDevice');

    this.udid = udid;
    this.options = options;
    this.customActions = options?.customActions;
  }

  describe(): string {
    return this.description || `UDID: ${this.udid}`;
  }

  public async connect(): Promise<void> {
    if (this.destroyed) {
      throw new Error(
        `IOSDevice ${this.udid} has been destroyed and cannot execute commands`,
      );
    }

    debugDevice(`Connecting to iOS device: ${this.udid}`);
    
    try {
      // Check if device exists and is available
      await this.execSimctl(['list', 'devices', this.udid]);
      
      // Try to get device info for description
      const size = await this.getScreenSize();
      this.description = `
UDID: ${this.udid}
ScreenSize: ${size.width}x${size.height} (DPR: ${this.devicePixelRatio})
`;
      debugDevice('iOS device connected successfully', this.description);
    } catch (e) {
      debugDevice(`Failed to connect to iOS device: ${e}`);
      throw new Error(`Unable to connect to iOS device ${this.udid}: ${e}`);
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
        // If it's a URL, use openurl
        await this.execSimctl(['openurl', this.udid, uri]);
      } else {
        // Assume it's a bundle ID
        await this.execSimctl(['launch', this.udid, uri]);
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
      const { stdout } = await this.execSimctl(['getenv', this.udid, 'SIMULATOR_MAINSCREEN_HEIGHT']);
      const height = Number.parseInt(stdout.trim(), 10);
      
      const { stdout: widthStdout } = await this.execSimctl(['getenv', this.udid, 'SIMULATOR_MAINSCREEN_WIDTH']);
      const width = Number.parseInt(widthStdout.trim(), 10);
      
      const { stdout: scaleStdout } = await this.execSimctl(['getenv', this.udid, 'SIMULATOR_MAINSCREEN_SCALE']);
      const scale = Number.parseFloat(scaleStdout.trim()) || 1;

      if (width && height) {
        return { width, height, scale };
      }
    } catch (e) {
      debugDevice(`Failed to get screen size from env: ${e}`);
    }

    // Fallback: use device info
    try {
      const { stdout } = await this.execSimctl(['list', 'devicetypes']);
      // This is a simplified fallback - in reality, we'd parse device types
      // For now, return a default size
      return {
        width: 375,
        height: 667,
        scale: 2,
      };
    } catch (e) {
      throw new Error(`Failed to get screen size: ${e}`);
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
    debugDevice('screenshotBase64 begin');
    const { width, height } = await this.size();
    
    try {
      const tempFile = `/tmp/midscene_screenshot_${uuid()}.png`;
      
      // Take screenshot using idb
      await this.execIdb(['screenshot', tempFile]);
      
      debugDevice('Screenshot taken, processing...');
      
      // Read the file and convert to base64
      const { stdout } = await execAsync(`base64 -i "${tempFile}"`);
      
      // Clean up temp file
      await execAsync(`rm "${tempFile}"`).catch(() => {
        // Ignore cleanup errors
      });
      
      const base64Data = stdout.replace(/\n/g, '');
      const result = createImgBase64ByFormat('png', base64Data);
      
      debugDevice('screenshotBase64 end');
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
    
    // For iOS, we can try multiple approaches to clear input
    try {
      // Method 1: Try triple-tap to select all text, then use idb text with empty string
      await this.tap(element.center[0], element.center[1]); // First tap
      await sleep(50);
      await this.tap(element.center[0], element.center[1]); // Second tap  
      await sleep(50);
      await this.tap(element.center[0], element.center[1]); // Third tap (should select all)
      await sleep(100);
      
      // Now type empty string or a single space and then clear it
      await this.execIdb(['ui', 'text', '']);
    } catch (error) {
      debugDevice(`Failed to clear input: ${error}`);
      // If triple-tap doesn't work, just continue - the typeText should replace content
    }
  }

  async url(): Promise<string> {
    return '';
  }

  // Core interaction methods
  async tap(x: number, y: number): Promise<void> {
    const adjustedCoords = this.adjustCoordinates(x, y);
    await this.execIdb(['ui', 'tap', adjustedCoords.x.toString(), adjustedCoords.y.toString()]);
  }

  async doubleTap(x: number, y: number): Promise<void> {
    const adjustedCoords = this.adjustCoordinates(x, y);
    await this.tap(adjustedCoords.x, adjustedCoords.y);
    await sleep(100);
    await this.tap(adjustedCoords.x, adjustedCoords.y);
  }

  async longPress(x: number, y: number, duration = 1000): Promise<void> {
    const adjustedCoords = this.adjustCoordinates(x, y);
    // Use idb tap with duration for long press
    await this.execIdb([
      'ui', 'tap', 
      adjustedCoords.x.toString(), adjustedCoords.y.toString(),
      '--duration', (duration / 1000).toString()
    ]);
  }

  async swipe(fromX: number, fromY: number, toX: number, toY: number, duration = 500): Promise<void> {
    const fromCoords = this.adjustCoordinates(fromX, fromY);
    const toCoords = this.adjustCoordinates(toX, toY);
    
    await this.execIdb([
      'ui', 'swipe',
      fromCoords.x.toString(), fromCoords.y.toString(),
      toCoords.x.toString(), toCoords.y.toString(),
      '--duration', (duration / 1000).toString() // idb expects duration in seconds
    ]);
  }

  async typeText(text: string, options?: IOSDeviceInputOpt): Promise<void> {
    if (!text) return;
    
    const shouldAutoDismissKeyboard =
      options?.autoDismissKeyboard ?? this.options?.autoDismissKeyboard ?? true;

    debugDevice(`Typing text: "${text}"`);
    
    // Clean the text to avoid unwanted characters
    const cleanText = text.trim();
    
    try {
      // Use idb ui text to input the clean text
      // This should replace existing content in most input fields
      await this.execIdb(['ui', 'text', cleanText]);
      
      // Add a small delay after typing
      await sleep(100);
    } catch (error) {
      debugDevice(`Failed to type text with idb: ${error}`);
      throw error;
    }

    if (shouldAutoDismissKeyboard) {
      await this.hideKeyboard(options);
    }
  }

  async clearAndTypeText(text: string, options?: IOSDeviceInputOpt): Promise<void> {
    if (!text) return;
    
    debugDevice(`Clearing field and typing text: "${text}"`);
    
    try {
      // Simply use typeText - we need to find why extra text is being added
      await this.typeText(text.trim(), options);
    } catch (error) {
      debugDevice(`Failed to clear and type text: ${error}`);
      throw error;
    }
  }

  async pressKey(key: string): Promise<void> {
    // Map common keys to iOS key codes or names
    const keyMap: Record<string, string> = {
      'Enter': '\\n',
      'Return': '\\n',
      'Backspace': '\\b',
      'Delete': '\\b',
      'Tab': '\\t',
      'Escape': '\\e',
      'Space': ' ',
      'cmd+a': 'cmd+a',
      'cmd+c': 'cmd+c',
      'cmd+v': 'cmd+v',
    };

    const mappedKey = keyMap[key] || key;
    
    if (mappedKey.includes('cmd+')) {
      // Handle command combinations - idb doesn't support modifier keys well
      // For common shortcuts, we can try alternative approaches
      const parts = mappedKey.split('+');
      if (parts.length === 2) {
        const modifier = parts[0];
        const key = parts[1];
        
        // Try to use idb key sequence for simple cases
        if (modifier === 'cmd' && key === 'a') {
          // For Cmd+A (select all), we can try using key sequence
          // But since idb doesn't support modifiers well, we'll log and skip
          debugDevice(`Skipping unsupported modifier key combination: ${mappedKey}`);
          debugDevice('Consider using alternative UI actions for this operation');
          return;
        } else {
          debugDevice(`Unsupported modifier key combination: ${mappedKey}`);
          return;
        }
      }
    } else {
      // For non-modifier keys, we need to distinguish between actual text and key presses
      // System keys like 'delete', 'escape', etc. should not be sent as text
      const systemKeys = ['delete', 'backspace', 'escape', 'enter', 'return', 'tab', 'done'];
      
      if (systemKeys.includes(mappedKey.toLowerCase())) {
        // Try to use idb ui key for system keys
        try {
          await this.execIdb(['ui', 'key', mappedKey]);
        } catch (error) {
          debugDevice(`Failed to press system key "${mappedKey}": ${error}`);
          // For keys that don't work with idb key, we'll skip them
          debugDevice(`Skipping unsupported system key: ${mappedKey}`);
        }
      } else {
        // For regular text/characters, use ui text
        await this.execIdb(['ui', 'text', mappedKey]);
      }
    }
  }

  // Scroll methods
  async scrollUp(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint ? { x: startPoint.left, y: startPoint.top } : { x: width / 2, y: height / 2 };
    const scrollDistance = distance || height / 3;
    
    await this.swipe(start.x, start.y, start.x, start.y + scrollDistance);
  }

  async scrollDown(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint ? { x: startPoint.left, y: startPoint.top } : { x: width / 2, y: height / 2 };
    const scrollDistance = distance || height / 3;
    
    await this.swipe(start.x, start.y, start.x, start.y - scrollDistance);
  }

  async scrollLeft(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint ? { x: startPoint.left, y: startPoint.top } : { x: width / 2, y: height / 2 };
    const scrollDistance = distance || width / 3;
    
    await this.swipe(start.x, start.y, start.x + scrollDistance, start.y);
  }

  async scrollRight(distance?: number, startPoint?: Point): Promise<void> {
    const { width, height } = await this.size();
    const start = startPoint ? { x: startPoint.left, y: startPoint.top } : { x: width / 2, y: height / 2 };
    const scrollDistance = distance || width / 3;
    
    await this.swipe(start.x, start.y, start.x - scrollDistance, start.y);
  }

  async scrollUntilTop(startPoint?: Point): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await this.scrollUp(undefined, startPoint);
      await sleep(500);
    }
  }

  async scrollUntilBottom(startPoint?: Point): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await this.scrollDown(undefined, startPoint);
      await sleep(500);
    }
  }

  async scrollUntilLeft(startPoint?: Point): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await this.scrollLeft(undefined, startPoint);
      await sleep(500);
    }
  }

  async scrollUntilRight(startPoint?: Point): Promise<void> {
    for (let i = 0; i < 10; i++) {
      await this.scrollRight(undefined, startPoint);
      await sleep(500);
    }
  }

  // iOS specific methods
  async home(): Promise<void> {
    await this.execIdb(['ui', 'button', 'HOME']);
  }

  async appSwitcher(): Promise<void> {
    // Double tap home button (for older iOS) or swipe up gesture
    await this.home();
    await sleep(100);
    await this.home();
  }

  async hideKeyboard(options?: IOSDeviceInputOpt): Promise<boolean> {
    const strategy = options?.keyboardDismissStrategy ?? this.options?.keyboardDismissStrategy ?? 'done-first';
    
    try {
      // For iOS, we can try tapping outside the keyboard area or using specific gestures
      // Since we don't have direct "done" button support in idb, we'll try alternative methods
      
      if (strategy === 'done-first') {
        // Try tapping at the bottom of the screen to dismiss keyboard
        const { width, height } = await this.size();
        const centerX = Math.round(width / 2 / this.devicePixelRatio);
        const bottomY = Math.round((height - 100) / this.devicePixelRatio); // Near bottom but not edge
        debugDevice(`Attempting to hide keyboard by tapping at (${centerX}, ${bottomY})`);
        await this.tap(centerX, bottomY);
      } else {
        // Try using idb key with escape if available
        try {
          await this.execIdb(['ui', 'key', 'escape']);
        } catch {
          // If escape doesn't work, fall back to tapping
          const { width, height } = await this.size();
          const centerX = Math.round(width / 2 / this.devicePixelRatio);
          const bottomY = Math.round((height - 100) / this.devicePixelRatio);
          await this.tap(centerX, bottomY);
        }
      }
      
      await sleep(300);
      return true;
    } catch (e) {
      debugDevice(`Failed to hide keyboard: ${e}`);
      return false;
    }
  }

  async destroy(): Promise<void> {
    if (this.destroyed) {
      return;
    }

    this.destroyed = true;
    debugDevice(`iOS device ${this.udid} destroyed`);
  }

  // Utility methods
  private adjustCoordinates(x: number, y: number): { x: number; y: number } {
    // iOS simulators use a logical coordinate system that's different from physical pixels
    // We need to convert from physical coordinates to logical coordinates
    // Physical coordinates come from screenshots (1206x2622 for iPhone 16 Pro)
    // Logical coordinates for idb are (402x874 for iPhone 16 Pro)
    debugDevice(`Original coordinates: (${x}, ${y}), DPR: ${this.devicePixelRatio}`);
    
    // Convert from physical to logical coordinates by dividing by devicePixelRatio
    const adjustedX = Math.round(x / this.devicePixelRatio);
    const adjustedY = Math.round(y / this.devicePixelRatio);
    
    debugDevice(`Adjusted coordinates: (${adjustedX}, ${adjustedY})`);
    return {
      x: adjustedX,
      y: adjustedY,
    };
  }

  private async execSimctl(args: string[]): Promise<{ stdout: string; stderr: string }> {
    if (this.destroyed) {
      throw new Error(`IOSDevice ${this.udid} has been destroyed and cannot execute commands`);
    }

    const command = `xcrun simctl ${args.join(' ')}`;
    debugDevice(`Executing: ${command}`);
    
    try {
      const result = await execAsync(command);
      debugDevice(`Command completed: ${command}`);
      return result;
    } catch (error: any) {
      debugDevice(`Command failed: ${command}, error: ${error}`);
      throw new Error(`simctl command failed: ${command}, error: ${error.message}`);
    }
  }

  private async execIdb(args: string[]): Promise<{ stdout: string; stderr: string }> {
    if (this.destroyed) {
      throw new Error(`IOSDevice ${this.udid} has been destroyed and cannot execute commands`);
    }
    // idb expects --udid to be passed with the subcommands that support it
    const argsWithUdid = [...args, '--udid', this.udid];
    const command = `idb ${argsWithUdid.join(' ')}`;
    debugDevice(`Executing: ${command}`);
    
    try {
      const result = await execAsync(command);
      debugDevice(`Command completed: ${command}`);
      return result;
    } catch (error: any) {
      debugDevice(`Command failed: ${command}, error: ${error}`);
      throw new Error(`idb command failed: ${command}, error: ${error.message}`);
    }
  }

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