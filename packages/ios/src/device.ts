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
import { NodeType } from '@midscene/shared/constants';
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
  udid?: string;
  customActions?: DeviceAction<any>[];
  wdaPort?: number;
  useWDA?: boolean;
} & IOSDeviceInputOpt;

export class IOSDevice implements AbstractInterface {
  private udid: string;
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

  constructor(udid: string, options?: IOSDeviceOpt) {
    assert(udid, 'udid is required for IOSDevice');

    this.udid = udid;
    this.options = options;
    this.customActions = options?.customActions;

    const wdaPort = options?.wdaPort || 8100;
    this.wdaBackend = new WebDriverAgentBackend(udid, wdaPort);
    this.wdaManager = WDAManager.getInstance(udid, wdaPort);
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
      // Start WebDriverAgent
      await this.wdaManager.start();

      // Create WDA session
      await this.wdaBackend.createSession();

      // Get device screen size for description
      const size = await this.getScreenSize();
      this.description = `
UDID: ${this.udid}
Type: WebDriverAgent
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
        throw new Error(
          'URL launching not supported with WebDriverAgent backend',
        );
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
    try {
      const pageSource = await this.wdaBackend.getPageSource();
      return this.parseElementsFromXML(pageSource);
    } catch (error) {
      debugDevice(`Failed to get elements info: ${error}`);
      return [];
    }
  }

  private parseElementsFromXML(xmlSource: string): ElementInfo[] {
    const elements: ElementInfo[] = [];

    try {
      // Parse XML and extract element information
      // This is a simplified parser - in production you might want to use a proper XML parser
      const elementMatches = xmlSource.matchAll(/<XCUIElementType[^>]*>/g);

      for (const match of elementMatches) {
        const elementTag = match[0];

        // Extract attributes
        const nameMatch = elementTag.match(/name="([^"]*)"/);
        const labelMatch = elementTag.match(/label="([^"]*)"/);
        const valueMatch = elementTag.match(/value="([^"]*)"/);
        const enabledMatch = elementTag.match(/enabled="([^"]*)"/);
        const visibleMatch = elementTag.match(/visible="([^"]*)"/);
        const xMatch = elementTag.match(/x="([^"]*)"/);
        const yMatch = elementTag.match(/y="([^"]*)"/);
        const widthMatch = elementTag.match(/width="([^"]*)"/);
        const heightMatch = elementTag.match(/height="([^"]*)"/);

        // Only include visible and enabled elements
        const isVisible = visibleMatch?.[1] === 'true';
        const isEnabled = enabledMatch?.[1] === 'true';

        if (!isVisible) continue;

        const x = Number.parseFloat(xMatch?.[1] || '0');
        const y = Number.parseFloat(yMatch?.[1] || '0');
        const width = Number.parseFloat(widthMatch?.[1] || '0');
        const height = Number.parseFloat(heightMatch?.[1] || '0');

        // Skip elements with zero dimensions
        if (width === 0 || height === 0) continue;

        const text = labelMatch?.[1] || nameMatch?.[1] || valueMatch?.[1] || '';

        elements.push({
          id: `${x}-${y}-${width}-${height}`, // Generate a unique ID
          indexId: elements.length,
          nodeHashId: `${x}-${y}-${width}-${height}`,
          attributes: {
            name: nameMatch?.[1] || '',
            label: labelMatch?.[1] || '',
            value: valueMatch?.[1] || '',
            enabled: isEnabled.toString(),
            visible: isVisible.toString(),
            nodeType: NodeType.FORM_ITEM,
          },
          nodeType: NodeType.FORM_ITEM,
          content: text,
          rect: {
            left: x,
            top: y,
            width,
            height,
          },
          center: [x + width / 2, y + height / 2] as [number, number],
          isVisible: isVisible,
        });
      }
    } catch (error) {
      debugDevice(`Failed to parse XML elements: ${error}`);
    }

    return elements;
  }

  async getElementsNodeTree(): Promise<any> {
    try {
      const pageSource = await this.wdaBackend.getPageSource();
      return this.parseXMLToTree(pageSource);
    } catch (error) {
      debugDevice(`Failed to get elements node tree: ${error}`);
      return {
        node: null,
        children: [],
      };
    }
  }

  private parseXMLToTree(xmlSource: string): any {
    try {
      // Simple XML tree parser
      // This creates a basic tree structure from the XML
      const root = {
        tagName: 'Application',
        attributes: {},
        children: [],
        text: '',
      };

      // Find the root application element
      const appMatch = xmlSource.match(
        /<XCUIElementTypeApplication[^>]*>([\s\S]*)<\/XCUIElementTypeApplication>/,
      );
      if (appMatch) {
        const appContent = appMatch[1];
        root.children = this.parseXMLChildren(appContent) as any;
      }

      return root;
    } catch (error) {
      debugDevice(`Failed to parse XML tree: ${error}`);
      return {
        tagName: 'Application',
        attributes: {},
        children: [] as any[],
        text: '',
      };
    }
  }

  private parseXMLChildren(xmlContent: string): any[] {
    const children: any[] = [];

    // Simple regex to find child elements
    const elementRegex =
      /<(XCUIElementType\w+)([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/g;
    let match;

    match = elementRegex.exec(xmlContent);
    while (match !== null) {
      const [, tagName, attributesStr, innerContent] = match;

      // Parse attributes
      const attributes: Record<string, string> = {};
      const attrRegex = /(\w+)="([^"]*)"/g;
      let attrMatch = attrRegex.exec(attributesStr);

      while (attrMatch !== null) {
        attributes[attrMatch[1]] = attrMatch[2];
        attrMatch = attrRegex.exec(attributesStr);
      }

      const element = {
        tagName,
        attributes,
        children: innerContent ? this.parseXMLChildren(innerContent) : [],
        text: attributes.label || attributes.name || attributes.value || '',
      };

      children.push(element);
      match = elementRegex.exec(xmlContent);
    }

    return children;
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
    await this.wdaBackend.homeButton();
  }

  async appSwitcher(): Promise<void> {
    // Double tap home button or use gesture for app switcher
    await this.home();
    await sleep(100);
    await this.home();
  }

  async hideKeyboard(_options?: IOSDeviceInputOpt): Promise<boolean> {
    try {
      // Try tapping at the bottom of the screen to dismiss keyboard
      const { width, height } = await this.size();
      const centerX = width / 2;
      const bottomY = height - 100; // Near bottom but not edge
      debugDevice(
        `Attempting to hide keyboard by tapping at (${centerX}, ${bottomY})`,
      );
      await this.tap(centerX, bottomY);

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

    try {
      // Delete WDA session
      await this.wdaBackend.deleteSession();

      // Stop WDA manager
      await this.wdaManager.stop();
    } catch (error) {
      debugDevice(`Error during cleanup: ${error}`);
    }

    this.destroyed = true;
    debugDevice(`iOS device ${this.udid} destroyed`);
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
