import {
  DEFAULT_WDA_PORT,
  WEBDRIVER_ELEMENT_ID_KEY,
} from '@midscene/shared/constants';
import { getDebug } from '@midscene/shared/logger';

const debugWDA = getDebug('ios:wda');

export interface WDASession {
  sessionId: string;
  capabilities: Record<string, any>;
}

export interface WDAElement {
  ELEMENT: string;
  [WEBDRIVER_ELEMENT_ID_KEY]: string;
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

  get sessionInfo(): WDASession | null {
    return this.session;
  }

  async getDeviceInfo(): Promise<{
    udid: string;
    name: string;
    model: string;
  } | null> {
    try {
      // Try to get device info from status endpoint first
      const statusResponse = await this.makeRequest('GET', '/status');
      if (statusResponse?.device) {
        return {
          udid:
            statusResponse.device.udid ||
            statusResponse.device.identifier ||
            '',
          name: statusResponse.device.name || '',
          model:
            statusResponse.device.model ||
            statusResponse.device.productName ||
            '',
        };
      }

      // If no session exists, we can't get detailed device info
      if (!this.session) {
        debugWDA('No session available for device info');
        return null;
      }

      // Try alternative WDA device info endpoint
      const deviceResponse = await this.makeRequest(
        'GET',
        `/session/${this.session.sessionId}/wda/device/info`,
      );
      if (deviceResponse) {
        return {
          udid: deviceResponse.udid || deviceResponse.identifier || '',
          name: deviceResponse.name || '',
          model: deviceResponse.model || deviceResponse.productName || '',
        };
      }

      return null;
    } catch (error) {
      debugWDA(`Failed to get device info: ${error}`);
      return null;
    }
  }

  constructor(port = DEFAULT_WDA_PORT, host = 'localhost') {
    this.baseURL = `http://${host}:${port}`;
    debugWDA(`Initialized WDA backend on ${host}:${port}`);
  }

  async createSession(): Promise<WDASession> {
    try {
      const response = await this.makeRequest('POST', '/session', {
        capabilities: {
          alwaysMatch: {
            // No bundleId specified - connects to currently active app
            arguments: [],
            environment: {},
            shouldWaitForQuiescence: false, // Don't wait for app to be idle
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
      // Clean the text to avoid unwanted trailing spaces
      const cleanText = text.trim();
      // Use the working method: /wda/keys with array value
      // WDA expects an array of characters, not a string
      await this.makeRequest(
        'POST',
        `/session/${this.session!.sessionId}/wda/keys`,
        {
          value: cleanText.split(''), // Must be an array of characters
        },
      );
      debugWDA(`Typed text: "${text}"`);
    } catch (error) {
      debugWDA(`Failed to type text "${text}": ${error}`);
      // Try alternative method: element/active/value
      try {
        debugWDA('Trying alternative text input method...');
        // Find the active element and send text to it
        const cleanAltText = text.trim();
        await this.makeRequest(
          'POST',
          `/session/${this.session!.sessionId}/element/active/value`,
          {
            value: cleanAltText.split(''), // Also needs to be an array
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

    // Enhanced key support similar to Android
    const normalizedKey = this.normalizeKeyName(key);

    // iOS key mapping - expanded support
    const iosKeyMap: Record<string, string> = {
      Tab: '\t',
      ArrowUp: '\uE013', // WebDriver arrow keys
      ArrowDown: '\uE015',
      ArrowLeft: '\uE012',
      ArrowRight: '\uE014',
      Home: '\uE011',
      End: '\uE010',
    };

    // Try mapped keys first
    if (iosKeyMap[normalizedKey]) {
      try {
        await this.makeRequest(
          'POST',
          `/session/${this.session!.sessionId}/wda/keys`,
          {
            value: [iosKeyMap[normalizedKey]],
          },
        );
        debugWDA(`Sent WebDriver key code for: ${key}`);
        return;
      } catch (error) {
        debugWDA(`WebDriver key failed for "${key}": ${error}`);
      }
    }

    // For single characters, send as regular text
    if (key.length === 1) {
      try {
        await this.makeRequest(
          'POST',
          `/session/${this.session!.sessionId}/wda/keys`,
          {
            value: [key],
          },
        );
        debugWDA(`Sent single character: "${key}"`);
        return;
      } catch (error) {
        debugWDA(`Failed to send character "${key}": ${error}`);
      }
    }

    // If nothing worked, log warning and throw error
    debugWDA(`Warning: Key "${key}" is not supported on iOS platform`);
    throw new Error(`Key "${key}" is not supported on iOS platform`);
  }

  private normalizeKeyName(key: string): string {
    // Convert to proper case for mapping (first letter uppercase, rest lowercase)
    return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
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
        `/session/${this.session!.sessionId}/wda/pressButton`,
        { name: 'home' },
      );
      debugWDA('Home button pressed using hardware key');
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

  async openUrl(url: string): Promise<void> {
    this.ensureSession();
    try {
      // Try using the standard WebDriver URL endpoint first
      await this.makeRequest(
        'POST',
        `/session/${this.session!.sessionId}/url`,
        {
          url,
        },
      );
      debugWDA(`Opened URL: ${url}`);
    } catch (error) {
      debugWDA(`Failed to open URL ${url} using standard endpoint: ${error}`);
      throw new Error(`Failed to open URL: ${error}`);
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
      const elementId = element.ELEMENT || element[WEBDRIVER_ELEMENT_ID_KEY];
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
    const elementId = element.ELEMENT || element[WEBDRIVER_ELEMENT_ID_KEY];

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
      const elementId = element.ELEMENT || element[WEBDRIVER_ELEMENT_ID_KEY];

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

      debugWDA(`Making ${method} request to ${endpoint}`);

      const requestOptions: RequestInit = {
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (data) {
        requestOptions.body = JSON.stringify(data);
      }

      const response = await fetch(url, requestOptions);

      // Get response text
      const responseText = await response.text();

      // Handle empty responses
      if (!responseText || responseText.trim() === '') {
        debugWDA(`Empty response from ${endpoint}`);
        return null;
      }

      let parsedResponse;
      try {
        parsedResponse = JSON.parse(responseText);
      } catch (parseError) {
        debugWDA(
          `JSON parse failed for ${endpoint}, response: "${responseText}"`,
        );
        // For some endpoints that return plain text or no content, treat as success
        if (
          responseText.trim() === 'OK' ||
          responseText.trim() === 'true' ||
          responseText.trim() === ''
        ) {
          return null;
        }
        throw new Error(
          `Invalid JSON response from ${endpoint}: ${parseError}`,
        );
      }

      if (parsedResponse.error) {
        throw new Error(
          parsedResponse.error.message || 'WebDriverAgent request failed',
        );
      }

      return parsedResponse.value !== undefined
        ? parsedResponse.value
        : parsedResponse;
    } catch (error) {
      debugWDA(`Request failed: ${error}`);
      throw error;
    }
  }
}
