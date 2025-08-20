import fs from 'node:fs';
import path from 'node:path';
import {
  MidsceneLocation,
  type Point,
  type Size,
} from '@midscene/core';
import type {
  DeviceAction,
  ExecutorContext,
  MidsceneLocationType,
  PageType,
} from '@midscene/core';
import { z } from '@midscene/core';
import { getTmpFile, sleep } from '@midscene/core/utils';
import type { ElementInfo } from '@midscene/shared/extractor';
import { 
  createImgBase64ByFormat,
  resizeImgBuffer
 } from '@midscene/shared/img';
import { getDebug } from '@midscene/shared/logger';
import type { AndroidDeviceInputOpt, AndroidDevicePage } from '@midscene/web';
import { commonWebActionsForWebPage } from '@midscene/web/utils';
import { type ScreenInfo, getScreenSize } from '../utils';

export const debugPage = getDebug('ios:device');
export interface iOSDeviceOpt extends AndroidDeviceInputOpt {
  serverUrl?: string;
  serverPort?: number;
  autoDismissKeyboard?: boolean;
  // iOS device mirroring configuration
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
  private serverPort: number;
  private serverProcess?: any; // Store reference to server process

  constructor(options?: iOSDeviceOpt) {
    this.options = options;
    this.serverPort = options?.serverPort || 1412;
    this.serverUrl =
      options?.serverUrl || `http://localhost:${this.serverPort}`;
  }

  actionSpace(): DeviceAction[] {
    const commonActions = commonWebActionsForWebPage(this);
    commonActions.forEach((action) => {
      if (action.name === 'Input') {
        action.paramSchema = z.object({
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
        });
        action.call = async (param, context) => {
          const { element } = context;
          if (element) {
            await this.clearInput(element as unknown as ElementInfo);

            if (!param || !param.value) {
              return;
            }
          }

          const autoDismissKeyboard =
            param.autoDismissKeyboard ?? this.options?.autoDismissKeyboard;
          await this.keyboard.type(param.value, {
            autoDismissKeyboard,
          });
        };
      }
    });

    const allActions: DeviceAction<any>[] = [
      ...commonActions,
      {
        name: 'IOSBackButton',
        description: 'Trigger the system "back" operation on iOS devices',
        call: async (param, context) => {
          await this.back();
        },
      },
      {
        name: 'IOSHomeButton',
        description: 'Trigger the system "home" operation on iOS devices',
        call: async (param, context) => {
          await this.home();
        },
      },
      {
        name: 'IOSRecentAppsButton',
        description:
          'Trigger the system "recent apps" operation on iOS devices',
        call: async (param, context) => {
          await this.recentApps();
        },
      },
      {
        name: 'IOSLongPress',
        description:
          'Trigger a long press on the screen at specified coordinates on iOS devices',
        paramSchema: z.object({
          duration: z
            .number()
            .optional()
            .describe('The duration of the long press in milliseconds'),
          locate: MidsceneLocation.describe('The element to be long pressed'),
        }),
        call: async (param, context) => {
          const { element } = context;
          if (!element) {
            throw new Error(
              'IOSLongPress requires an element to be located',
            );
          }
          const [x, y] = element.center;
          await this.longPress(x, y, param?.duration);
        },
      } as DeviceAction<{
        duration?: number;
        locate: MidsceneLocationType;
      }>,
      {
        name: 'IOSPull',
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
        }),
        call: async (
          param: {
            direction: 'up' | 'down';
            distance?: number;
            duration?: number;
          },
          context: ExecutorContext,
        ) => {
          const { element } = context;
          const startPoint = element
            ? { left: element.center[0], top: element.center[1] }
            : undefined;
          if (!param || !param.direction) {
            throw new Error('IOSPull requires a direction parameter');
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
      debugPage(`Python server connection failed: ${error.message}`);

      // Try to start server automatically
      debugPage('Attempting to start Python server automatically...');

      try {
        await this.startPyAutoGUIServer();
        debugPage('Python server started successfully');

        // Verify server is now running
        const response = await fetch(`${this.serverUrl}/health`);
        if (!response.ok) {
          throw new Error(
            `Server still not responding after startup: ${response.status}`,
          );
        }

        const healthData = await response.json();
        debugPage(
          `Python server is now running: ${JSON.stringify(healthData)}`,
        );
      } catch (startError: any) {
        throw new Error(
          `Failed to auto-start Python server: ${startError.message}. ` +
            `Please manually start the server by running: node packages/ios/bin/server.js ${this.serverPort}`,
        );
      }
    }

    // Make iPhone mirroring app foreground
    try {
      // Use fixed mirroring app name for iOS device screen mirroring
      const mirroringAppName = 'iPhone Mirroring';

      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);

      // Activate the mirroring application using AppleScript
      await execAsync(
        `osascript -e 'tell application "${mirroringAppName}" to activate'`,
      );
      debugPage(`Activated iOS mirroring app: ${mirroringAppName}`);

      //wait for app to be ready
      await sleep(2000);
    } catch (mirrorError: any) {
      debugPage(
        `Warning: Failed to bring iOS mirroring app to foreground: ${mirrorError.message}`,
      );
      // Continue execution even if this fails - it's not critical
    }

    // Configure iOS mirroring if provided
    await this.initializeMirrorConfiguration();
  }

  private async startPyAutoGUIServer(): Promise<void> {
    try {
      const { spawn } = await import('node:child_process');
      const serverScriptPath = path.resolve(__dirname, '../../bin/server.js');

      debugPage(
        `Starting PyAutoGUI server using: node ${serverScriptPath} ${this.serverPort}`,
      );

      // Start server process in background (similar to server.js background mode)
      // Start server process (non-detached so parent can reliably terminate it)
      this.serverProcess = spawn(
        'node',
        [serverScriptPath, this.serverPort.toString()],
        {
          detached: false,
          stdio: 'pipe', // Capture output
          env: {
            ...process.env,
          },
        },
      );

      // Handle server process events
      this.serverProcess.on('error', (error: any) => {
        debugPage(`Server process error: ${error.message}`);
      });

      // Listen for both exit and close for robust termination handling
      this.serverProcess.on(
        'exit',
        (code: number | null, signal: string | null) => {
          debugPage(
            `Server process exit event: code=${code}, signal=${signal}`,
          );
        },
      );

      this.serverProcess.on(
        'close',
        (code: number | null, signal: string | null) => {
          debugPage(`Server process closed: code=${code}, signal=${signal}`);
          // Ensure reference is cleared when process actually stops
          this.serverProcess = undefined;
        },
      );

      // Capture and log server output
      if (this.serverProcess.stdout) {
        this.serverProcess.stdout.on('data', (data: Buffer) => {
          debugPage(`Server stdout: ${data.toString().trim()}`);
        });
      }

      if (this.serverProcess.stderr) {
        this.serverProcess.stderr.on('data', (data: Buffer) => {
          debugPage(`Server stderr: ${data.toString().trim()}`);
        });
      }

      debugPage(
        `Started PyAutoGUI server process with PID: ${this.serverProcess.pid}`,
      );

      // Wait for server to start up (similar to server.js timeout)
      await sleep(3000);
    } catch (error: any) {
      throw new Error(`Failed to start PyAutoGUI server: ${error.message}`);
    }
  }

  private async initializeMirrorConfiguration() {
    if (this.options?.mirrorConfig) {
      await this.configureIOSMirror(this.options.mirrorConfig);
    } else {
      try {
        // Auto-detect iPhone Mirroring app window using AppleScript
        const mirrorConfig = await this.detectAndConfigureIOSMirror();
        if (mirrorConfig) {
          if (!this.options || typeof this.options.mirrorConfig !== 'object') {
            this.options = {};
          }
          this.options.mirrorConfig = mirrorConfig;

          debugPage(
            `Auto-detected iOS mirror config: ${mirrorConfig.mirrorWidth}x${mirrorConfig.mirrorHeight} at (${mirrorConfig.mirrorX}, ${mirrorConfig.mirrorY})`,
          );

          // Configure the detected mirror settings
          await this.configureIOSMirror(mirrorConfig);
        } else {
          debugPage('No iPhone Mirroring app found or auto-detection failed');
        }
      } catch (error: any) {
        debugPage(
          `Failed to auto-detect iPhone Mirroring app: ${error.message}`,
        );
      }
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

  private async detectAndConfigureIOSMirror(): Promise<{
    mirrorX: number;
    mirrorY: number;
    mirrorWidth: number;
    mirrorHeight: number;
  } | null> {
    try {
      const { exec } = await import('node:child_process');
      const { promisify } = await import('node:util');
      const execAsync = promisify(exec);

      // AppleScript to get window information for iPhone Mirroring app
      const applescript = `
        tell application "System Events"
            try
                set mirrorApp to first application process whose name contains "iPhone Mirroring"
                set mirrorWindow to first window of mirrorApp
                set windowPosition to position of mirrorWindow
                set windowSize to size of mirrorWindow
                
                -- Get window frame information
                set windowX to item 1 of windowPosition
                set windowY to item 2 of windowPosition
                set windowWidth to item 1 of windowSize
                set windowHeight to item 2 of windowSize
                
                -- Try to get the actual visible frame (content area)
                try
                    set appName to name of mirrorApp
                    set bundleId to bundle identifier of mirrorApp
                    set visibleFrame to "{\\"found\\":true,\\"x\\":" & windowX & ",\\"y\\":" & windowY & ",\\"width\\":" & windowWidth & ",\\"height\\":" & windowHeight & ",\\"app\\":\\"" & appName & "\\",\\"bundle\\":\\"" & bundleId & "\\"}"
                    return visibleFrame
                on error
                    return "{\\"found\\":true,\\"x\\":" & windowX & ",\\"y\\":" & windowY & ",\\"width\\":" & windowWidth & ",\\"height\\":" & windowHeight & "}"
                end try
                
            on error errMsg
                return "{\\"found\\":false,\\"error\\":\\"" & errMsg & "\\"}"
            end try
        end tell
      `;

      const { stdout, stderr } = await execAsync(
        `osascript -e '${applescript}'`,
      );

      if (stderr) {
        debugPage(`AppleScript error: ${stderr}`);
        return null;
      }

      const result = JSON.parse(stdout.trim());

      if (!result.found) {
        debugPage(
          `iPhone Mirroring app not found: ${result.error || 'Unknown error'}`,
        );
        return null;
      }

      const windowX = result.x;
      const windowY = result.y;
      const windowWidth = result.width;
      const windowHeight = result.height;

      debugPage(
        `Detected iPhone Mirroring window: ${windowWidth}x${windowHeight} at (${windowX}, ${windowY})`,
      );

      // Calculate device content area with smart detection based on window size
      const titleBarHeight = 28;
      let contentPaddingH;
      let contentPaddingV;

      if (windowWidth < 500 && windowHeight < 1000) {
        // Small window - minimal padding
        contentPaddingH = 20;
        contentPaddingV = 20;
      } else if (windowWidth < 800 && windowHeight < 1400) {
        // Medium window - moderate padding
        contentPaddingH = 40;
        contentPaddingV = 50;
      } else {
        // Large window - more padding
        contentPaddingH = 80;
        contentPaddingV = 100;
      }

      // Calculate the actual iOS device screen area within the window
      const contentX = windowX + Math.floor(contentPaddingH / 2);
      const contentY =
        windowY + titleBarHeight + Math.floor(contentPaddingV / 2);
      const contentWidth = windowWidth - contentPaddingH;
      const contentHeight = windowHeight - titleBarHeight - contentPaddingV;

      // Ensure minimum viable dimensions
      if (contentWidth < 200 || contentHeight < 400) {
        // Try with minimal padding if initial calculation is too small
        const minimalContentX = windowX + 10;
        const minimalContentY = windowY + titleBarHeight + 10;
        const minimalContentWidth = windowWidth - 20;
        const minimalContentHeight = windowHeight - titleBarHeight - 20;

        if (minimalContentWidth < 200 || minimalContentHeight < 400) {
          debugPage(
            `Detected window seems too small for iPhone content: ${windowWidth}x${windowHeight}`,
          );
          return null;
        }

        return {
          mirrorX: minimalContentX,
          mirrorY: minimalContentY,
          mirrorWidth: minimalContentWidth,
          mirrorHeight: minimalContentHeight,
        };
      }

      debugPage(
        `Calculated content area: ${contentWidth}x${contentHeight} at (${contentX}, ${contentY})`,
      );

      return {
        mirrorX: contentX,
        mirrorY: contentY,
        mirrorWidth: contentWidth,
        mirrorHeight: contentHeight,
      };
    } catch (error: any) {
      debugPage(
        `Exception during iPhone Mirroring app detection: ${error.message}`,
      );
      return null;
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
    // For iOS mirroring mode, return iOS device logical size instead of macOS screen size
    if (this.options?.mirrorConfig) {
      // Get configuration from Python server, using estimated iOS device size
      try {
        const config = await this.getConfiguration();
        if (config.status === 'ok' && config.config.enabled) {
          return {
            width: config.config.estimated_ios_width,
            height: config.config.estimated_ios_height,
            dpr: 1, // iOS coordinate system doesn't need additional pixel ratio adjustment
          };
        }
      } catch (error) {
        debugPage('Failed to get iOS configuration, using fallback:', error);
      }
    }

    // Fallback for non-iOS mirroring mode or when configuration retrieval fails
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
      if (this.options?.mirrorConfig) {
        const result = await this.executePyAutoGUIAction({
          action: 'screenshot',
        });

        if (result.status === 'ok' && result.path) {
          // Read the screenshot file and convert to base64
          const screenshotBuffer = await fs.promises.readFile(result.path);

          // Get iOS device dimensions for resizing
          const { width, height } = await this.size();

          // Resize to match iOS device dimensions
          const { buffer, format } = await resizeImgBuffer(
            'png',
            screenshotBuffer,
            {
              width,
              height,
            },
          );

          // Clean up temporary file
          try {
            await fs.promises.unlink(result.path);
          } catch (cleanupError) {
            debugPage('Failed to cleanup temp screenshot file:', cleanupError);
          }

          debugPage('screenshotBase64 end (via PyAutoGUI server)');
          const image = createImgBase64ByFormat(format, buffer.toString('base64'));
          return image;
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

        const { buffer: resizedScreenshotBuffer } = await resizeImgBuffer(
          'png',
          screenshotBuffer,
          {
            width,
            height,
          },
        );

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

    if (this.options?.mirrorConfig) {
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

    if (this.options?.mirrorConfig) {
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

    // Improved distance calculation to better match iOS scroll behavior
    // iOS scroll distance is in pixels, we need to convert to effective scroll events
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
    if (this.options?.mirrorConfig) {
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

  // Required iOSDevicePage interface methods
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
        // For iOS mirroring mode, pass coordinates directly; for non-mirroring mode, adjust using device pixel ratio
        if (this.options?.mirrorConfig) {
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
    if (this.options?.mirrorConfig) {
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

    if (this.options?.mirrorConfig) {
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

    if (this.options?.mirrorConfig) {
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

    // Clean up server process if we started it
    if (this.serverProcess) {
      try {
        debugPage('Terminating PyAutoGUI server process');
        this.serverProcess.kill('SIGTERM');
        this.serverProcess = undefined;
      } catch (error) {
        debugPage('Error terminating server process:', error);
      }
    }
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
