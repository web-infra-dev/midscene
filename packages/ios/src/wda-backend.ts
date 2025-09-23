import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { getDebug } from '@midscene/shared/logger';

const execAsync = promisify(exec);
const debugWDA = getDebug('ios:wda');

export interface WDASession {
  sessionId: string;
  capabilities: Record<string, any>;
}

export interface WDAElement {
  ELEMENT: string;
  'element-6066-11e4-a52e-4f735466cecf': string;
}

export interface WDAElementInfo {
  type: string;
  name: string;
  label: string;
  value: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  enabled: boolean;
  visible: boolean;
}

export class WebDriverAgentBackend {
  private baseURL: string;
  private session: WDASession | null = null;
  private udid: string;

  get sessionInfo(): WDASession | null {
    return this.session;
  }

  constructor(udid: string, port = 8100, host = 'localhost') {
    this.udid = udid; // Store for potential future use in debugging/logging
    this.baseURL = `http://${host}:${port}`;
    debugWDA(`Initialized WDA backend for device ${udid} on ${host}:${port}`);
  }

  async createSession(): Promise<WDASession> {
    try {
      const response = await this.makeRequest('POST', '/session', {
        capabilities: {
          alwaysMatch: {
            bundleId: 'com.apple.Preferences', // Default to Settings app
            arguments: [],
            environment: {},
            shouldWaitForQuiescence: true,
            shouldUseTestManagerForVisibilityDetection: false,
            maxTypingFrequency: 60,
            shouldUseSingletonTestManager: true,
          },
        },
      });

      this.session = {
        sessionId: response.sessionId,
        capabilities: response.capabilities,
      };

      debugWDA(`Created WDA session: ${this.session.sessionId}`);
      return this.session;
    } catch (error) {
      debugWDA(`Failed to create WDA session: ${error}`);
      throw new Error(`Failed to create WebDriverAgent session: ${error}`);
    }
  }

  async deleteSession(): Promise<void> {
    if (!this.session) return;

    try {
      await this.makeRequest('DELETE', `/session/${this.session.sessionId}`);
      debugWDA(`Deleted WDA session: ${this.session.sessionId}`);
      this.session = null;
    } catch (error) {
      debugWDA(`Failed to delete WDA session: ${error}`);
      // Don't throw, session might already be invalid
    }
  }

  async getWindowSize(): Promise<{ width: number; height: number }> {
    this.ensureSession();
    try {
      const response = await this.makeRequest(
        'GET',
        `/session/${this.session!.sessionId}/window/size`,
      );
      return {
        width: response.width,
        height: response.height,
      };
    } catch (error) {
      debugWDA(`Failed to get window size: ${error}`);
      throw new Error(`Failed to get window size: ${error}`);
    }
  }

  async takeScreenshot(): Promise<string> {
    this.ensureSession();
    try {
      const response = await this.makeRequest(
        'GET',
        `/session/${this.session!.sessionId}/screenshot`,
      );
      return response; // Base64 encoded image
    } catch (error) {
      debugWDA(`Failed to take screenshot: ${error}`);
      throw new Error(`Failed to take screenshot: ${error}`);
    }
  }

  async tap(x: number, y: number): Promise<void> {
    this.ensureSession();
    try {
      // Try multiple tap endpoints as WDA API may vary
      let success = false;
      const endpoints = [
        {
          url: `/session/${this.session!.sessionId}/wda/tap`,
          body: { x, y },
        },
        {
          url: `/session/${this.session!.sessionId}/wda/touch/perform`,
          body: { actions: [{ action: 'tap', options: { x, y } }] },
        },
        {
          url: `/session/${this.session!.sessionId}/touch/click`,
          body: { x, y },
        },
      ];

      for (const endpoint of endpoints) {
        try {
          await this.makeRequest('POST', endpoint.url, endpoint.body);
          debugWDA(`Tapped at coordinates (${x}, ${y}) using ${endpoint.url}`);
          success = true;
          break;
        } catch (err) {
          debugWDA(`Tap endpoint ${endpoint.url} failed: ${err}`);
        }
      }

      if (!success) {
        throw new Error('All tap endpoints failed');
      }
    } catch (error) {
      debugWDA(`Failed to tap at (${x}, ${y}): ${error}`);
      throw new Error(`Failed to tap at coordinates: ${error}`);
    }
  }

  async doubleTap(x: number, y: number): Promise<void> {
    this.ensureSession();
    try {
      await this.makeRequest(
        'POST',
        `/session/${this.session!.sessionId}/wda/doubleTap`,
        {
          x,
          y,
        },
      );
      debugWDA(`Double tapped at coordinates (${x}, ${y})`);
    } catch (error) {
      debugWDA(`Failed to double tap at (${x}, ${y}): ${error}`);
      throw new Error(`Failed to double tap at coordinates: ${error}`);
    }
  }

  async longPress(x: number, y: number, duration = 1000): Promise<void> {
    this.ensureSession();
    try {
      await this.makeRequest(
        'POST',
        `/session/${this.session!.sessionId}/wda/touchAndHold`,
        {
          x,
          y,
          duration: duration / 1000, // WDA expects duration in seconds
        },
      );
      debugWDA(`Long pressed at coordinates (${x}, ${y}) for ${duration}ms`);
    } catch (error) {
      debugWDA(`Failed to long press at (${x}, ${y}): ${error}`);
      throw new Error(`Failed to long press at coordinates: ${error}`);
    }
  }

  async swipe(
    fromX: number,
    fromY: number,
    toX: number,
    toY: number,
    duration = 500,
  ): Promise<void> {
    this.ensureSession();
    try {
      await this.makeRequest(
        'POST',
        `/session/${this.session!.sessionId}/wda/dragfromtoforduration`,
        {
          fromX,
          fromY,
          toX,
          toY,
          duration: duration / 1000, // WDA expects duration in seconds
        },
      );
      debugWDA(
        `Swiped from (${fromX}, ${fromY}) to (${toX}, ${toY}) in ${duration}ms`,
      );
    } catch (error) {
      debugWDA(
        `Failed to swipe from (${fromX}, ${fromY}) to (${toX}, ${toY}): ${error}`,
      );
      throw new Error(`Failed to swipe: ${error}`);
    }
  }

  async typeText(text: string): Promise<void> {
    this.ensureSession();
    try {
      // Use the working method: /wda/keys with array value
      // WDA expects an array of characters, not a string
      await this.makeRequest(
        'POST',
        `/session/${this.session!.sessionId}/wda/keys`,
        {
          value: text.split(''), // Must be an array of characters
        },
      );
      debugWDA(`Typed text: "${text}"`);
    } catch (error) {
      debugWDA(`Failed to type text "${text}": ${error}`);
      // Try alternative method: element/active/value
      try {
        debugWDA('Trying alternative text input method...');
        // Find the active element and send text to it
        await this.makeRequest(
          'POST',
          `/session/${this.session!.sessionId}/element/active/value`,
          {
            value: text.split(''), // Also needs to be an array
          },
        );
        debugWDA(`Typed text using alternative method: "${text}"`);
      } catch (altError) {
        debugWDA(`Alternative method also failed: ${altError}`);
        throw new Error(`Failed to type text: ${error}`);
      }
    }
  }

  async pressKey(key: string): Promise<void> {
    this.ensureSession();
    debugWDA(`Attempting to press key: ${key}`);

    // iOS platform has limited keyboard event support, using practical solutions
    if (key === 'Enter' || key === 'Return' || key === 'return') {
      debugWDA('Handling Enter/Return key for iOS');

      // Method 1: Send newline character directly to trigger form submission
      try {
        await this.makeRequest(
          'POST',
          `/session/${this.session!.sessionId}/wda/keys`,
          {
            value: ['\n'], // Send newline character
          },
        );
        debugWDA('Sent newline character for Enter key');

        // In iOS, newline character may not immediately trigger submission, need to wait
        await new Promise((resolve) => setTimeout(resolve, 100));
        return;
      } catch (error) {
        debugWDA(`Newline method failed: ${error}`);
      }

      // Method 2: Try to click submit button on the keyboard
      const submitButtons = [
        'Search',
        'Go',
        'Done',
        'Return',
        'Send',
        'Next',
        'Join',
      ];
      for (const buttonText of submitButtons) {
        try {
          // Find keyboard button
          const elements = await this.makeRequest(
            'POST',
            `/session/${this.session!.sessionId}/elements`,
            {
              using: 'accessibility id',
              value: buttonText,
            },
          );

          if (elements && elements.length > 0) {
            const element = elements[0];
            if (element?.ELEMENT) {
              await this.makeRequest(
                'POST',
                `/session/${this.session!.sessionId}/element/${element.ELEMENT}/click`,
              );
              debugWDA(`Successfully clicked ${buttonText} button for Enter`);
              return;
            }
          }
        } catch (error) {
          // Continue trying next button
        }
      }

      // Method 3: Try coordinate tap on common keyboard submit positions
      try {
        const windowSize = await this.getWindowSize();
        // On iPhone, submit button is usually in the bottom right corner of keyboard
        const submitX = windowSize.width * 0.9;
        const submitY = windowSize.height * 0.75; // Keyboard area

        await this.tap(submitX, submitY);
        debugWDA(
          `Attempted coordinate tap for Enter at (${submitX}, ${submitY})`,
        );
        return;
      } catch (error) {
        debugWDA(`Coordinate tap failed: ${error}`);
      }

      // If all methods failed, log warning but don't throw error
      debugWDA(
        'Warning: Enter key press may not have worked as expected on iOS',
      );
      return;
    }

    // For other keys, iOS support is very limited
    if (key === 'Backspace' || key === 'Delete') {
      try {
        // Backspace key can be implemented through character deletion
        await this.makeRequest(
          'POST',
          `/session/${this.session!.sessionId}/wda/keys`,
          {
            value: ['\b'], // Backspace character
          },
        );
        debugWDA('Sent backspace character');
        return;
      } catch (error) {
        debugWDA(`Backspace failed: ${error}`);
      }
    }

    // For space key
    if (key === 'Space') {
      try {
        await this.makeRequest(
          'POST',
          `/session/${this.session!.sessionId}/wda/keys`,
          {
            value: [' '],
          },
        );
        debugWDA('Sent space character');
        return;
      } catch (error) {
        debugWDA(`Space key failed: ${error}`);
      }
    }

    // For other special keys (Tab, Escape, arrow keys, etc.), iOS basically doesn't support them
    // Log warning and try to send as regular character
    debugWDA(`Warning: Key "${key}" may not be supported on iOS platform`);

    try {
      await this.makeRequest(
        'POST',
        `/session/${this.session!.sessionId}/wda/keys`,
        {
          value: [key],
        },
      );
      debugWDA(`Sent "${key}" as character (may not work as expected)`);
    } catch (error) {
      debugWDA(`Failed to send key "${key}": ${error}`);
      throw new Error(`Key "${key}" is not supported on iOS platform`);
    }
  }

  async clearElement(): Promise<void> {
    this.ensureSession();
    try {
      // Try to clear the currently focused element
      await this.makeRequest(
        'POST',
        `/session/${this.session!.sessionId}/wda/element/0/clear`,
        {},
      );
      debugWDA('Cleared focused element');
    } catch (error) {
      debugWDA(`Failed to clear element: ${error}`);
      throw new Error(`Failed to clear element: ${error}`);
    }
  }

  async homeButton(): Promise<void> {
    this.ensureSession();
    try {
      await this.makeRequest(
        'POST',
        `/session/${this.session!.sessionId}/wda/homescreen`,
      );
      debugWDA('Pressed home button');
    } catch (error) {
      debugWDA(`Failed to press home button: ${error}`);
      throw new Error(`Failed to press home button: ${error}`);
    }
  }

  async launchApp(bundleId: string): Promise<void> {
    this.ensureSession();
    try {
      await this.makeRequest(
        'POST',
        `/session/${this.session!.sessionId}/wda/apps/launch`,
        {
          bundleId,
        },
      );
      debugWDA(`Launched app: ${bundleId}`);
    } catch (error) {
      debugWDA(`Failed to launch app ${bundleId}: ${error}`);
      throw new Error(`Failed to launch app: ${error}`);
    }
  }

  async terminateApp(bundleId: string): Promise<void> {
    this.ensureSession();
    try {
      await this.makeRequest(
        'POST',
        `/session/${this.session!.sessionId}/wda/apps/terminate`,
        {
          bundleId,
        },
      );
      debugWDA(`Terminated app: ${bundleId}`);
    } catch (error) {
      debugWDA(`Failed to terminate app ${bundleId}: ${error}`);
      // Don't throw, app might not be running
    }
  }

  async findElement(
    strategy: string,
    selector: string,
  ): Promise<WDAElement | null> {
    this.ensureSession();
    try {
      const response = await this.makeRequest(
        'POST',
        `/session/${this.session!.sessionId}/element`,
        {
          using: strategy,
          value: selector,
        },
      );
      return response;
    } catch (error) {
      debugWDA(`Element not found with ${strategy}="${selector}": ${error}`);
      return null;
    }
  }

  async findElements(
    strategy: string,
    selector: string,
  ): Promise<WDAElement[]> {
    this.ensureSession();
    try {
      const response = await this.makeRequest(
        'POST',
        `/session/${this.session!.sessionId}/elements`,
        {
          using: strategy,
          value: selector,
        },
      );
      return response || [];
    } catch (error) {
      debugWDA(`Elements not found with ${strategy}="${selector}": ${error}`);
      return [];
    }
  }

  async getElementInfo(element: WDAElement): Promise<WDAElementInfo> {
    this.ensureSession();
    try {
      const elementId =
        element.ELEMENT || element['element-6066-11e4-a52e-4f735466cecf'];
      const response = await this.makeRequest(
        'GET',
        `/session/${this.session!.sessionId}/element/${elementId}/rect`,
      );
      const attributes = await this.makeRequest(
        'GET',
        `/session/${this.session!.sessionId}/element/${elementId}/attribute/name`,
      );
      const enabled = await this.makeRequest(
        'GET',
        `/session/${this.session!.sessionId}/element/${elementId}/enabled`,
      );
      const displayed = await this.makeRequest(
        'GET',
        `/session/${this.session!.sessionId}/element/${elementId}/displayed`,
      );

      return {
        type: attributes.type || '',
        name: attributes.name || '',
        label: attributes.label || '',
        value: attributes.value || '',
        rect: response,
        enabled: enabled,
        visible: displayed,
      };
    } catch (error) {
      debugWDA(`Failed to get element info: ${error}`);
      throw new Error(`Failed to get element info: ${error}`);
    }
  }

  async clickElement(element: WDAElement): Promise<void> {
    this.ensureSession();
    const elementId =
      element.ELEMENT || element['element-6066-11e4-a52e-4f735466cecf'];

    // Try multiple click methods
    const clickMethods = [
      {
        name: 'standard click',
        method: () =>
          this.makeRequest(
            'POST',
            `/session/${this.session!.sessionId}/element/${elementId}/click`,
          ),
      },
      {
        name: 'WDA tap',
        method: async () => {
          // Get element coordinates and use coordinate tap
          const rect = await this.makeRequest(
            'GET',
            `/session/${this.session!.sessionId}/element/${elementId}/rect`,
          );
          const centerX = rect.x + rect.width / 2;
          const centerY = rect.y + rect.height / 2;
          return this.tap(centerX, centerY);
        },
      },
    ];

    let lastError;
    for (const clickMethod of clickMethods) {
      try {
        debugWDA(`Trying ${clickMethod.name} for element: ${elementId}`);
        await clickMethod.method();
        debugWDA(
          `Successfully clicked element using ${clickMethod.name}: ${elementId}`,
        );
        return;
      } catch (error) {
        debugWDA(`${clickMethod.name} failed: ${error}`);
        lastError = error;
      }
    }

    throw new Error(`All click methods failed for element: ${lastError}`);
  }

  async getPageSource(): Promise<string> {
    this.ensureSession();
    try {
      const response = await this.makeRequest(
        'GET',
        `/session/${this.session!.sessionId}/source`,
      );
      return response;
    } catch (error) {
      debugWDA(`Failed to get page source: ${error}`);
      throw new Error(`Failed to get page source: ${error}`);
    }
  }

  async getScrollableViews(): Promise<WDAElement[]> {
    this.ensureSession();
    try {
      // Find all scrollable elements (ScrollView, Table, CollectionView)
      const scrollableTypes = [
        'XCUIElementTypeScrollView',
        'XCUIElementTypeTable',
        'XCUIElementTypeCollectionView',
      ];

      const allScrollableElements: WDAElement[] = [];

      for (const elementType of scrollableTypes) {
        try {
          const elements = await this.findElements('class name', elementType);
          allScrollableElements.push(...elements);
        } catch (error) {
          debugWDA(`No ${elementType} elements found: ${error}`);
        }
      }

      return allScrollableElements;
    } catch (error) {
      debugWDA(`Failed to get scrollable views: ${error}`);
      return [];
    }
  }

  async canElementScroll(
    element: WDAElement,
    direction: 'up' | 'down' | 'left' | 'right',
  ): Promise<boolean> {
    this.ensureSession();
    try {
      const elementId =
        element.ELEMENT || element['element-6066-11e4-a52e-4f735466cecf'];

      // Get current page source as baseline
      const initialSource = await this.makeRequest(
        'GET',
        `/session/${this.sessionInfo!.sessionId}/source`,
      );

      // Use mobile: scroll command instead of direct endpoint
      await this.makeRequest(
        'POST',
        `/session/${this.sessionInfo!.sessionId}/execute`,
        {
          script: 'mobile: scroll',
          args: [
            {
              direction: direction,
              element: elementId,
              distance: 0.1, // Very small distance for testing
              duration: 0.5, // Short duration
            },
          ],
        },
      );

      // Get page source after scroll attempt
      const afterScrollSource = await this.makeRequest(
        'GET',
        `/session/${this.sessionInfo!.sessionId}/source`,
      );

      // If source changed, scrolling is possible
      const canScroll = initialSource !== afterScrollSource;

      // Try to scroll back to original position if content changed
      if (canScroll) {
        const oppositeDirection =
          direction === 'up'
            ? 'down'
            : direction === 'down'
              ? 'up'
              : direction === 'left'
                ? 'right'
                : 'left';

        try {
          await this.makeRequest(
            'POST',
            `/session/${this.sessionInfo!.sessionId}/execute`,
            {
              script: 'mobile: scroll',
              args: [
                {
                  direction: oppositeDirection,
                  element: elementId,
                  distance: 0.1,
                  duration: 0.5,
                },
              ],
            },
          );
        } catch (error) {
          debugWDA(`Failed to scroll back: ${error}`);
        }
      }

      debugWDA(`Scroll test: direction=${direction}, canScroll=${canScroll}`);
      return canScroll;
    } catch (error) {
      debugWDA(`Failed to check if element can scroll: ${error}`);
      return false; // Assume can't scroll if check fails
    }
  }

  private ensureSession(): void {
    if (!this.session) {
      throw new Error(
        'No active WebDriverAgent session. Call createSession() first.',
      );
    }
  }

  async makeRequest(
    method: string,
    endpoint: string,
    data?: any,
  ): Promise<any> {
    try {
      const url = `${this.baseURL}${endpoint}`;
      const curlCommand = this.buildCurlCommand(method, url, data);

      debugWDA(`Making ${method} request to ${endpoint}`);
      const { stdout } = await execAsync(curlCommand, {
        maxBuffer: 50 * 1024 * 1024, // 50MB buffer for large screenshots
      });

      // Handle empty responses
      if (!stdout || stdout.trim() === '') {
        debugWDA(`Empty response from ${endpoint}`);
        return null;
      }

      let response;
      try {
        response = JSON.parse(stdout);
      } catch (parseError) {
        debugWDA(`JSON parse failed for ${endpoint}, response: "${stdout}"`);
        // For some endpoints that return plain text or no content, treat as success
        if (
          stdout.trim() === 'OK' ||
          stdout.trim() === 'true' ||
          stdout.trim() === ''
        ) {
          return null;
        }
        throw new Error(
          `Invalid JSON response from ${endpoint}: ${parseError}`,
        );
      }

      if (response.error) {
        throw new Error(
          response.error.message || 'WebDriverAgent request failed',
        );
      }

      return response.value !== undefined ? response.value : response;
    } catch (error) {
      debugWDA(`Request failed: ${error}`);
      throw error;
    }
  }

  private buildCurlCommand(method: string, url: string, data?: any): string {
    let command = `curl -s -X ${method}`;

    if (data) {
      command += ` -H "Content-Type: application/json"`;
      command += ` -d '${JSON.stringify(data)}'`;
    }

    command += ` "${url}"`;
    return command;
  }
}
