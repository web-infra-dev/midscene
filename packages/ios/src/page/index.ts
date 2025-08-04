import assert from 'node:assert';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Point, Size } from '@midscene/core';
import type { PageType } from '@midscene/core';
import { getTmpFile, sleep } from '@midscene/core/utils';
import type { ElementInfo } from '@midscene/shared/extractor';
import { resizeImg } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import type { AndroidDeviceInputOpt, AndroidDevicePage } from '@midscene/web';
import { type ScreenInfo, getScreenSize } from '../utils';

export const debugPage = getDebug('ios:device');

export interface iOSDeviceOpt extends AndroidDeviceInputOpt {
  serverUrl?: string;
  serverPort?: number;
  autoDismissKeyboard?: boolean;
  // iOS device mirroring configuration
  iOSMirrorConfig?: {
    mirrorX: number;
    mirrorY: number;
    mirrorWidth: number;
    mirrorHeight: number;
  };
  // Alternative name for better API compatibility
  mirrorConfig?: {
    mirrorX: number;
    mirrorY: number;
    mirrorWidth: number;
    mirrorHeight: number;
  };
}

export interface PyAutoGUIAction {
  action:
    | 'click'
    | 'move'
    | 'drag'
    | 'type'
    | 'key'
    | 'hotkey'
    | 'sleep'
    | 'screenshot'
    | 'scroll';
  x?: number;
  y?: number;
  x2?: number;
  y2?: number;
  text?: string;
  key?: string;
  keys?: string[];
  seconds?: number;
  direction?: 'up' | 'down' | 'left' | 'right';
  clicks?: number;
  distance?: number; // Original scroll distance in pixels
  scroll_type?: 'wheel' | 'trackpad';
  interval?: number; // Interval between keystrokes for type action
}

export interface PyAutoGUIResult {
  status: 'ok' | 'error';
  action?: string;
  x?: number;
  y?: number;
  text?: string;
  seconds?: number;
  from?: [number, number];
  to?: [number, number];
  path?: string; // For screenshot action
  ios_region?: boolean; // For screenshot action
  direction?: string; // For scroll action
  clicks?: number; // For scroll action
  method?: string; // For scroll action (wheel, trackpad, etc.)
  ios_coords?: [number, number]; // For coordinate transformation info
  mac_coords?: [number, number]; // For coordinate transformation info
  error?: string;
  traceback?: string;
}

export class iOSDevice implements AndroidDevicePage {
  private devicePixelRatio = 1;
  private screenInfo: ScreenInfo | null = null;
  private destroyed = false;
  pageType: PageType = 'ios';
  uri: string | undefined;
  options?: iOSDeviceOpt;
  private serverUrl: string;

  constructor(options?: iOSDeviceOpt) {
    this.options = options;
    this.serverUrl =
      options?.serverUrl || `http://localhost:${options?.serverPort || 1412}`;
  }

  public async connect(): Promise<void> {
    if (this.destroyed) {
      throw new Error('iOSDevice has been destroyed and cannot be used');
    }

    // Health check to ensure Python server is running
    try {
      const response = await fetch(`${this.serverUrl}/health`);
      if (!response.ok) {
        throw new Error(
          `Python server health check failed: ${response.status}`,
        );
      }
      const healthData = await response.json();
      debugPage(`Python server is running: ${JSON.stringify(healthData)}`);
    } catch (error: any) {
      throw new Error(
        `Failed to connect to Python server at ${this.serverUrl}: ${error.message}`,
      );
    }

    // Configure iOS mirroring if provided
    if (this.options?.iOSMirrorConfig) {
      await this.configureIOSMirror(this.options.iOSMirrorConfig);
    }

    // Get screen information (will use iOS dimensions if configured)
    this.screenInfo = await getScreenSize();
    this.devicePixelRatio = this.screenInfo.dpr;

    debugPage(
      `iOS Device initialized - Screen: ${this.screenInfo.width}x${this.screenInfo.height}, DPR: ${this.devicePixelRatio}`,
    );
  }

  private async configureIOSMirror(config: {
    mirrorX: number;
    mirrorY: number;
    mirrorWidth: number;
    mirrorHeight: number;
  }): Promise<void> {
    try {
      const response = await fetch(`${this.serverUrl}/configure`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });

      if (!response.ok) {
        throw new Error(`Failed to configure iOS mirror: ${response.status}`);
      }

      const result = await response.json();
      if (result.status !== 'ok') {
        throw new Error(`iOS configuration failed: ${result.error}`);
      }

      debugPage(
        `iOS mirroring configured: mirror region ${config.mirrorX},${config.mirrorY} -> ${config.mirrorWidth}x${config.mirrorHeight}`,
      );
    } catch (error: any) {
      throw new Error(`Failed to configure iOS mirroring: ${error.message}`);
    }
  }

  async getConfiguration(): Promise<any> {
    const response = await fetch(`${this.serverUrl}/config`);
    if (!response.ok) {
      throw new Error(`Failed to get configuration: ${response.status}`);
    }
    return await response.json();
  }

  public async launch(uri: string): Promise<iOSDevice> {
    this.uri = uri;

    try {
      if (uri.startsWith('http://') || uri.startsWith('https://')) {
        // Open URL in default browser
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);

        await execAsync(`open "${uri}"`);
        debugPage(`Successfully launched URL: ${uri}`);
      } else {
        // Try to open as application
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);

        await execAsync(`open -a "${uri}"`);
        debugPage(`Successfully launched app: ${uri}`);
      }
    } catch (error: any) {
      debugPage(`Error launching ${uri}: ${error}`);
      throw new Error(`Failed to launch ${uri}: ${error.message}`, {
        cause: error,
      });
    }

    return this;
  }

  async size(): Promise<Size> {
    // 对于iOS镜像模式，返回iOS设备的逻辑尺寸而不是macOS屏幕尺寸
    if (this.options?.iOSMirrorConfig) {
      // 从Python服务器获取配置信息，使用估算的iOS设备尺寸
      try {
        const config = await this.getConfiguration();
        if (config.status === 'ok' && config.config.enabled) {
          return {
            width: config.config.estimated_ios_width,
            height: config.config.estimated_ios_height,
            dpr: 1, // iOS坐标系不需要额外的像素比调整
          };
        }
      } catch (error) {
        debugPage('Failed to get iOS configuration, using fallback:', error);
      }
    }

    // 非iOS镜像模式或配置获取失败时的fallback
    if (!this.screenInfo) {
      this.screenInfo = await getScreenSize();
    }

    return {
      width: this.screenInfo.width,
      height: this.screenInfo.height,
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

    try {
      // Use PyAutoGUI server's screenshot functionality for iOS mirroring
      if (this.options?.iOSMirrorConfig) {
        const result = await this.executePyAutoGUIAction({
          action: 'screenshot',
        });

        if (result.status === 'ok' && result.path) {
          // Read the screenshot file and convert to base64
          const screenshotBuffer = await fs.promises.readFile(result.path);

          // Get iOS device dimensions for resizing
          const { width, height } = await this.size();

          // Resize to match iOS device dimensions
          const resizedScreenshotBuffer = await resizeImg(screenshotBuffer, {
            width,
            height,
          });

          // Clean up temporary file
          try {
            await fs.promises.unlink(result.path);
          } catch (cleanupError) {
            debugPage('Failed to cleanup temp screenshot file:', cleanupError);
          }

          debugPage('screenshotBase64 end (via PyAutoGUI server)');
          return `data:image/png;base64,${resizedScreenshotBuffer.toString('base64')}`;
        } else {
          throw new Error('PyAutoGUI screenshot failed: no path returned');
        }
      } else {
        // Fallback to macOS screencapture for non-mirroring scenarios
        const { exec } = await import('node:child_process');
        const { promisify } = await import('node:util');
        const execAsync = promisify(exec);

        const tempPath = getTmpFile('png')!;

        // Use screencapture to take screenshot
        await execAsync(`screencapture -x "${tempPath}"`);

        // Read and resize the screenshot
        const screenshotBuffer = await fs.promises.readFile(tempPath);
        const { width, height } = await this.size();

        const resizedScreenshotBuffer = await resizeImg(screenshotBuffer, {
          width,
          height,
        });

        debugPage('screenshotBase64 end (via screencapture)');
        return `data:image/png;base64,${resizedScreenshotBuffer.toString('base64')}`;
      }
    } catch (error: any) {
      debugPage('screenshotBase64 error:', error);
      throw new Error(`Failed to take screenshot: ${error.message}`);
    }
  }

  /**
   * Execute action via PyAutoGUI server
   */
  private async executePyAutoGUIAction(
    action: PyAutoGUIAction,
  ): Promise<PyAutoGUIResult> {
    try {
      const fetch = (await import('node-fetch')).default;

      const response = await fetch(`${this.serverUrl}/run`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(action),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const result = (await response.json()) as PyAutoGUIResult;

      if (result.status === 'error') {
        throw new Error(`PyAutoGUI error: ${result.error}`);
      }

      return result;
    } catch (error: any) {
      debugPage('PyAutoGUI action failed:', error);
      throw new Error(`Failed to execute PyAutoGUI action: ${error.message}`);
    }
  }

  async tap(point: Point): Promise<void> {
    debugPage(`tap at (${point.left}, ${point.top})`);

    // 对于iOS mirroring模式，直接传递iOS坐标，让Python服务器处理坐标变换
    // 对于非mirroring模式，使用设备像素比调整坐标
    if (this.options?.iOSMirrorConfig) {
      await this.executePyAutoGUIAction({
        action: 'click',
        x: point.left,
        y: point.top,
      });
    } else {
      const adjusted = this.adjustCoordinates(point.left, point.top);
      await this.executePyAutoGUIAction({
        action: 'click',
        x: adjusted.x,
        y: adjusted.y,
      });
    }
  }

  async hover(point: Point): Promise<void> {
    debugPage(`hover at (${point.left}, ${point.top})`);

    if (this.options?.iOSMirrorConfig) {
      await this.executePyAutoGUIAction({
        action: 'move',
        x: point.left,
        y: point.top,
      });
    } else {
      const adjusted = this.adjustCoordinates(point.left, point.top);
      await this.executePyAutoGUIAction({
        action: 'move',
        x: adjusted.x,
        y: adjusted.y,
      });
    }
  }

  async input(text: string, options?: AndroidDeviceInputOpt): Promise<void> {
    debugPage(`input text: ${text}`);

    // For iOS, we use the optimized type action with proper intervals
    // The auto server will handle this appropriately for iOS
    await this.executePyAutoGUIAction({
      action: 'type',
      text,
      interval: 0.05, // Proper interval for iOS keyboard responsiveness
    });

    // For iOS mirroring, default to NOT dismissing keyboard as it can cause issues
    // Only dismiss if explicitly enabled
    if (
      options?.autoDismissKeyboard === true ||
      this.options?.autoDismissKeyboard === true
    ) {
      await this.dismissKeyboard();
    }
  }

  private async dismissKeyboard(): Promise<void> {
    try {
      // Method 1: Try to tap the "Done" or "Return" button if visible
      // This is iOS-specific logic - many keyboards have a "Done" button
      await this.keyboardPress('return');
      debugPage('Dismissed keyboard using Return key');
    } catch (error) {
      try {
        // Method 2: Tap outside the keyboard area (top part of screen)
        const { width, height } = await this.size();
        const tapX = width / 2;
        const tapY = height / 4; // Tap in the upper quarter of the screen

        await this.tap({ left: tapX, top: tapY });
        debugPage('Dismissed keyboard by tapping outside');
      } catch (fallbackError) {
        debugPage('Failed to dismiss keyboard:', fallbackError);
        // Don't throw error - keyboard dismissal is optional
      }
    }
  }

  async keyboardPress(key: string): Promise<void> {
    debugPage(`keyboard press: ${key}`);

    // Check if it's a combination key (contains '+')
    if (key.includes('+')) {
      // Handle hotkey combinations like 'cmd+1', 'cmd+tab', etc.
      const keys = key.split('+').map((k) => k.trim().toLowerCase());

      // Map common key names to PyAutoGUI format
      const keyMapping: Record<string, string> = {
        cmd: 'command',
        ctrl: 'ctrl',
        alt: 'alt',
        option: 'alt',
        shift: 'shift',
        tab: 'tab',
        enter: 'enter',
        return: 'enter',
        space: 'space',
        backspace: 'backspace',
        delete: 'delete',
        escape: 'escape',
        esc: 'escape',
      };

      const mappedKeys = keys.map((k) => keyMapping[k] || k);

      await this.executePyAutoGUIAction({
        action: 'hotkey',
        keys: mappedKeys,
      });
    } else {
      // Handle single key press
      const keyMap: Record<string, string> = {
        Enter: 'enter',
        Return: 'enter',
        Tab: 'tab',
        Space: 'space',
        Backspace: 'backspace',
        Delete: 'delete',
        Escape: 'escape',
      };

      const mappedKey = keyMap[key] || key.toLowerCase();

      await this.executePyAutoGUIAction({
        action: 'key',
        key: mappedKey,
      });
    }
  }

  async scroll(scrollType: {
    direction: 'up' | 'down' | 'left' | 'right';
    distance?: number;
  }): Promise<void> {
    debugPage(
      `scroll ${scrollType.direction}, distance: ${scrollType.distance || 'default'}`,
    );

    // Get current screen center for scroll
    const { width, height } = await this.size();
    const centerX = width / 2;
    const centerY = height / 2;

    const distance = scrollType.distance || 100;

    // Improved distance calculation to better match Android scroll behavior
    // Android scroll distance is in pixels, we need to convert to effective scroll events
    // Base the calculation on screen size for better proportional scrolling
    const screenArea = width * height;
    const scrollRatio = distance / Math.sqrt(screenArea); // Normalize by screen size

    // Calculate clicks with better scaling - aim for more responsive scrolling
    let clicks: number;
    if (distance <= 50) {
      // Small scrolls: direct mapping for fine control
      clicks = Math.max(3, Math.floor(distance / 8));
    } else if (distance <= 200) {
      // Medium scrolls: moderate scaling
      clicks = Math.max(8, Math.floor(distance / 12));
    } else {
      // Large scrolls: aggressive scaling for significant movement
      clicks = Math.max(15, Math.floor(distance / 10));
    }

    debugPage(
      `Scroll distance: ${distance}px -> ${clicks} clicks (ratio: ${scrollRatio.toFixed(3)})`,
    );

    // Pass both distance and calculated clicks to Python server
    const scrollAction: PyAutoGUIAction = {
      action: 'scroll',
      x: centerX,
      y: centerY,
      direction: scrollType.direction,
      clicks: clicks,
      distance: distance, // Pass original distance for server-side fine-tuning
      scroll_type: 'trackpad', // Default to trackpad for smooth scrolling
    };

    // Always use mouse wheel/trackpad for scrolling (better compatibility)
    if (this.options?.iOSMirrorConfig) {
      // iOS mirroring mode: use iOS coordinates directly
      await this.executePyAutoGUIAction(scrollAction);
    } else {
      // Non-mirroring mode: adjust coordinates
      const adjusted = this.adjustCoordinates(centerX, centerY);
      await this.executePyAutoGUIAction({
        ...scrollAction,
        x: adjusted.x,
        y: adjusted.y,
        scroll_type: 'wheel', // Use wheel for non-iOS devices
      });
    }
  }

  async getElementText(elementInfo: ElementInfo): Promise<string> {
    // For iOS/macOS, we can't easily extract text from elements
    // This would require accessibility APIs or OCR
    throw new Error('getElementText is not implemented for iOS devices');
  }

  // Required AndroidDevicePage interface methods
  async getElementsNodeTree(): Promise<any> {
    // Simplified implementation, returns an empty node tree
    return {
      node: null,
      children: [],
    };
  }

  // @deprecated
  async getElementsInfo(): Promise<any[]> {
    throw new Error('getElementsInfo is not implemented for iOS devices');
  }

  get mouse(): any {
    return {
      click: async (x: number, y: number, options: { button: string }) => {
        // Directly use the provided coordinates, as these are already in the iOS coordinate system.
        // The coordinate transformation from iOS to macOS will be handled inside executePyAutoGUIAction.
        await this.executePyAutoGUIAction({
          action: 'click',
          x: x,
          y: y,
        });
      },
      wheel: async (deltaX: number, deltaY: number) => {
        throw new Error('mouse wheel is not implemented for iOS devices');
      },
      move: async (x: number, y: number) => {
        await this.hover({ left: x, top: y });
      },
      drag: async (
        from: { x: number; y: number },
        to: { x: number; y: number },
      ) => {
        // 对于iOS镜像模式，直接传递坐标；对于非镜像模式，使用设备像素比调整
        if (this.options?.iOSMirrorConfig) {
          await this.executePyAutoGUIAction({
            action: 'drag',
            x: from.x,
            y: from.y,
            x2: to.x,
            y2: to.y,
          });
        } else {
          const startAdjusted = this.adjustCoordinates(from.x, from.y);
          const endAdjusted = this.adjustCoordinates(to.x, to.y);

          await this.executePyAutoGUIAction({
            action: 'drag',
            x: startAdjusted.x,
            y: startAdjusted.y,
            x2: endAdjusted.x,
            y2: endAdjusted.y,
          });
        }
      },
    };
  }

  get keyboard(): any {
    return {
      type: async (text: string, options?: AndroidDeviceInputOpt) => {
        await this.input(text, options);
      },
      press: async (action: any) => {
        if (Array.isArray(action)) {
          for (const a of action) {
            await this.keyboardPress(a.key);
          }
        } else {
          await this.keyboardPress(action.key);
        }
      },
    };
  }

  async clearInput(element: any): Promise<void> {
    // For iOS, we need to focus the input first by tapping it
    if (element?.center) {
      debugPage(
        `Focusing input field at (${element.center[0]}, ${element.center[1]})`,
      );
      await this.tap({ left: element.center[0], top: element.center[1] });
      await sleep(300); // Wait for focus and potential keyboard animation
    }

    // Select all text and delete it - this works well on iOS
    await this.keyboardPress('cmd+a');
    await sleep(100);
    await this.keyboardPress('delete');
    await sleep(100);

    debugPage('Input field cleared');
  }

  url(): string {
    return this.uri || '';
  }

  async scrollUntilTop(startingPoint?: Point): Promise<void> {
    const screenSize = await this.size();
    const point = startingPoint || {
      left: screenSize.width / 2,
      top: screenSize.height / 2,
    };

    // Scroll up multiple times to reach top
    for (let i = 0; i < 10; i++) {
      await this.scroll({ direction: 'up', distance: screenSize.height / 3 });
      await sleep(500);
    }
  }

  async scrollUntilBottom(startingPoint?: Point): Promise<void> {
    const screenSize = await this.size();
    const point = startingPoint || {
      left: screenSize.width / 2,
      top: screenSize.height / 2,
    };

    // Scroll down multiple times to reach bottom
    for (let i = 0; i < 10; i++) {
      await this.scroll({ direction: 'down', distance: screenSize.height / 3 });
      await sleep(500);
    }
  }

  async scrollUntilLeft(startingPoint?: Point): Promise<void> {
    const screenSize = await this.size();
    const point = startingPoint || {
      left: screenSize.width / 2,
      top: screenSize.height / 2,
    };

    // Scroll left multiple times to reach leftmost
    for (let i = 0; i < 10; i++) {
      await this.scroll({ direction: 'left', distance: screenSize.width / 3 });
      await sleep(500);
    }
  }

  async scrollUntilRight(startingPoint?: Point): Promise<void> {
    const screenSize = await this.size();
    const point = startingPoint || {
      left: screenSize.width / 2,
      top: screenSize.height / 2,
    };

    // Scroll right multiple times to reach rightmost
    for (let i = 0; i < 10; i++) {
      await this.scroll({ direction: 'right', distance: screenSize.width / 3 });
      await sleep(500);
    }
  }

  async scrollUp(distance?: number, startingPoint?: Point): Promise<void> {
    await this.scroll({ direction: 'up', distance });
  }

  async scrollDown(distance?: number, startingPoint?: Point): Promise<void> {
    await this.scroll({ direction: 'down', distance });
  }

  async scrollLeft(distance?: number, startingPoint?: Point): Promise<void> {
    await this.scroll({ direction: 'left', distance });
  }

  async scrollRight(distance?: number): Promise<void> {
    await this.scroll({ direction: 'right', distance });
  }

  async getXpathsById(id: string): Promise<string[]> {
    throw new Error('getXpathsById is not implemented for iOS devices');
  }

  async getXpathsByPoint(
    point: Point,
    isOrderSensitive: boolean,
  ): Promise<string[]> {
    throw new Error('getXpathsByPoint is not implemented for iOS devices');
  }

  async getElementInfoByXpath(xpath: string): Promise<ElementInfo> {
    throw new Error('getElementInfoByXpath is not implemented for iOS devices');
  }

  async back(): Promise<void> {
    // For iOS/macOS, we can simulate Command+[ or use system back gesture
    await this.keyboardPress('cmd+[');
  }

  async home(): Promise<void> {
    // For iOS simulator/mirroring, CMD+1 opens home screen
    debugPage('Navigating to home screen using CMD+1');
    await this.keyboardPress('cmd+1');
  }

  async recentApps(): Promise<void> {
    // For iOS simulator/mirroring, CMD+2 opens app switcher
    debugPage('Opening app switcher using CMD+2');
    await this.keyboardPress('cmd+2');
  }

  async longPress(x: number, y: number, duration?: number): Promise<void> {
    if (this.options?.iOSMirrorConfig) {
      await this.executePyAutoGUIAction({
        action: 'click',
        x: x,
        y: y,
      });
    } else {
      const adjustedPoint = this.adjustCoordinates(x, y);
      await this.executePyAutoGUIAction({
        action: 'click',
        x: adjustedPoint.x,
        y: adjustedPoint.y,
      });
    }

    // Simulate long press by holding for duration
    if (duration) {
      await sleep(duration);
    }
  }

  async pullDown(
    startPoint?: Point,
    distance?: number,
    duration?: number,
  ): Promise<void> {
    const screenSize = await this.size();
    const start = startPoint || {
      left: screenSize.width / 2,
      top: screenSize.height / 4,
    };
    const end = {
      left: start.left,
      top: start.top + (distance || screenSize.height / 3),
    };

    if (this.options?.iOSMirrorConfig) {
      await this.executePyAutoGUIAction({
        action: 'drag',
        x: start.left,
        y: start.top,
        x2: end.left,
        y2: end.top,
      });
    } else {
      const startAdjusted = this.adjustCoordinates(start.left, start.top);
      const endAdjusted = this.adjustCoordinates(end.left, end.top);

      await this.executePyAutoGUIAction({
        action: 'drag',
        x: startAdjusted.x,
        y: startAdjusted.y,
        x2: endAdjusted.x,
        y2: endAdjusted.y,
      });
    }
  }

  async pullUp(
    startPoint?: Point,
    distance?: number,
    duration?: number,
  ): Promise<void> {
    const screenSize = await this.size();
    const start = startPoint || {
      left: screenSize.width / 2,
      top: (screenSize.height * 3) / 4,
    };
    const end = {
      left: start.left,
      top: start.top - (distance || screenSize.height / 3),
    };

    if (this.options?.iOSMirrorConfig) {
      await this.executePyAutoGUIAction({
        action: 'drag',
        x: start.left,
        y: start.top,
        x2: end.left,
        y2: end.top,
      });
    } else {
      const startAdjusted = this.adjustCoordinates(start.left, start.top);
      const endAdjusted = this.adjustCoordinates(end.left, end.top);

      await this.executePyAutoGUIAction({
        action: 'drag',
        x: startAdjusted.x,
        y: startAdjusted.y,
        x2: endAdjusted.x,
        y2: endAdjusted.y,
      });
    }
  }

  async destroy(): Promise<void> {
    debugPage('destroy iOS device');
    this.destroyed = true;
  }

  // Additional abstract methods from AbstractPage
  async waitUntilNetworkIdle?(options?: {
    idleTime?: number;
    concurrency?: number;
  }): Promise<void> {
    // Network idle detection is not applicable for iOS devices
    await sleep(options?.idleTime || 1000);
  }

  async evaluateJavaScript?<T = any>(script: string): Promise<T> {
    throw new Error('evaluateJavaScript is not implemented for iOS devices');
  }
}
