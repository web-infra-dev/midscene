import { getDebug } from '@midscene/shared/logger';
import { WebDriverClient } from '@midscene/webdriver';

const debugIOS = getDebug('webdriver:ios');

// WDA MJPEG server settings applied during session setup
const WDA_MJPEG_SCREENSHOT_QUALITY = 50;
const WDA_MJPEG_FRAMERATE = 30;
const WDA_MJPEG_SCALING_FACTOR = 50;
const w3cElementId = 'element-6066-11e4-a52e-4f735466cecf';
const keyboardDismissTimeoutMs = 2000;
const keyboardDismissPollIntervalMs = 100;
const keyboardAccessoryToolbarGeometry = {
  minHeight: 24,
  maxHeight: 80,
  minHorizontalOverlap: 0.8,
  minRightButtonCenterRatio: 0.65,
  maxGap: 48,
} as const;
const keyboardNamedButtonMaxDistance = 100;

type WebDriverElementRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export class IOSWebDriverClient extends WebDriverClient {
  async launchApp(bundleId: string): Promise<void> {
    this.ensureSession();

    try {
      // Use WebDriverAgent's app launch endpoint
      await this.makeRequest(
        'POST',
        `/session/${this.sessionId}/wda/apps/launch`,
        {
          bundleId,
        },
      );
      debugIOS(`Launched app: ${bundleId}`);
    } catch (error) {
      debugIOS(`Failed to launch app ${bundleId}: ${error}`);
      throw error;
    }
  }

  async activateApp(bundleId: string): Promise<void> {
    this.ensureSession();

    await this.makeRequest(
      'POST',
      `/session/${this.sessionId}/wda/apps/activate`,
      {
        bundleId,
      },
    );
  }

  async terminateApp(bundleId: string): Promise<void> {
    this.ensureSession();

    await this.makeRequest(
      'POST',
      `/session/${this.sessionId}/wda/apps/terminate`,
      {
        bundleId,
      },
    );
  }

  async openUrl(url: string): Promise<void> {
    this.ensureSession();

    try {
      await this.makeRequest('POST', `/session/${this.sessionId}/url`, {
        url,
      });
    } catch (error) {
      debugIOS(`Direct URL opening failed, trying Safari fallback: ${error}`);
      // Fallback to launching Safari with the URL
      await this.launchApp('com.apple.mobilesafari');
      // Wait a bit for Safari to open
      await new Promise((resolve) => setTimeout(resolve, 2000));
      // Navigate to URL using direct WebDriver API
      await this.makeRequest('POST', `/session/${this.sessionId}/url`, {
        url,
      });
    }
  }

  async pressHomeButton(): Promise<void> {
    this.ensureSession();

    try {
      // Use original working approach for home button
      await this.makeRequest(
        'POST',
        `/session/${this.sessionId}/wda/pressButton`,
        { name: 'home' },
      );
      debugIOS('Home button pressed using hardware key');
    } catch (error) {
      debugIOS(`Failed to press home button: ${error}`);
      throw new Error(`Failed to press home button: ${error}`);
    }
  }

  async appSwitcher(): Promise<void> {
    this.ensureSession();

    try {
      const windowSize = await this.getWindowSize();
      const centerX = Math.round(windowSize.width / 2);
      const startY = Math.max(0, windowSize.height - 1);
      const endY = Math.round(windowSize.height * 0.5);

      debugIOS('Triggering app switcher with native WDA drag gesture');

      // W3C pointer actions are scoped to the active application on real
      // devices, so this system gesture can be interpreted as an in-app
      // scroll. WDA's native drag endpoint uses screen coordinates and
      // reliably starts from the home indicator instead. Its duration is in
      // seconds and represents the hold before dragging.
      await this.makeRequest(
        'POST',
        `/session/${this.sessionId}/wda/dragfromtoforduration`,
        {
          fromX: centerX,
          fromY: startY,
          toX: centerX,
          toY: endY,
          duration: 1,
        },
      );

      await new Promise((resolve) => setTimeout(resolve, 800)); // Wait for app switcher to appear and stabilize
    } catch (error) {
      debugIOS(`App switcher failed: ${error}`);
      throw new Error(`Failed to trigger app switcher: ${error}`);
    }
  }

  async pressKey(key: string): Promise<void> {
    this.ensureSession();
    debugIOS(`Attempting to press key: ${key}`);

    if (key.trim() !== '+' && key.includes('+')) {
      throw new Error(
        `iOS keyboardPress does not support key combinations: ${JSON.stringify(key)}`,
      );
    }

    // iOS platform has limited keyboard event support, using practical solutions
    if (key === 'Enter' || key === 'Return' || key === 'return') {
      debugIOS('Handling Enter/Return key for iOS');

      // Send newline character directly to trigger form submission
      await this.makeRequest('POST', `/session/${this.sessionId}/wda/keys`, {
        value: ['\n'], // Send newline character
      });
      debugIOS('Sent newline character for Enter key');
      await new Promise((resolve) => setTimeout(resolve, 100));
      return;
    }

    // For other keys, iOS support is very limited
    if (key === 'Backspace' || key === 'Delete') {
      try {
        // Backspace key can be implemented through character deletion
        await this.makeRequest('POST', `/session/${this.sessionId}/wda/keys`, {
          value: ['\b'], // Backspace character
        });
        debugIOS('Sent backspace character');
        return;
      } catch (error) {
        debugIOS(`Backspace failed: ${error}`);
      }
    }

    // For space key
    if (key === 'Space') {
      try {
        await this.makeRequest('POST', `/session/${this.sessionId}/wda/keys`, {
          value: [' '],
        });
        debugIOS('Sent space character');
        return;
      } catch (error) {
        debugIOS(`Space key failed: ${error}`);
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
        await this.makeRequest('POST', `/session/${this.sessionId}/wda/keys`, {
          value: [iosKeyMap[normalizedKey]],
        });
        debugIOS(`Sent WebDriver key code for: ${key}`);
        return;
      } catch (error) {
        debugIOS(`WebDriver key failed for "${key}": ${error}`);
      }
    }

    // For single characters, send as regular text
    if (key.length === 1) {
      try {
        await this.makeRequest('POST', `/session/${this.sessionId}/wda/keys`, {
          value: [key],
        });
        debugIOS(`Sent single character: "${key}"`);
        return;
      } catch (error) {
        debugIOS(`Failed to send character "${key}": ${error}`);
      }
    }

    // If nothing worked, log warning and throw error
    debugIOS(`Warning: Key "${key}" is not supported on iOS platform`);
    throw new Error(`Key "${key}" is not supported on iOS platform`);
  }

  /**
   * Get the currently focused element's WebDriver ID
   * @returns WebDriver element ID or null if no element is focused
   */
  async getActiveElement(): Promise<string | null> {
    this.ensureSession();
    debugIOS('Getting active element');

    try {
      const response = await this.makeRequest(
        'GET',
        `/session/${this.sessionId}/element/active`,
      );

      // WebDriver can return element ID in two formats:
      // - Legacy format: response.ELEMENT or response.value.ELEMENT
      // - W3C format: response['element-6066-11e4-a52e-4f735466cecf']
      const elementId =
        response.value?.ELEMENT ||
        response.value?.['element-6066-11e4-a52e-4f735466cecf'] ||
        response.ELEMENT ||
        response['element-6066-11e4-a52e-4f735466cecf'];

      if (elementId) {
        debugIOS(`Got active element ID: ${elementId}`);
        return elementId;
      }

      debugIOS('No active element found');
      return null;
    } catch (error) {
      debugIOS(`Failed to get active element: ${error}`);
      return null;
    }
  }

  /**
   * Clear an element using WebDriver's clear endpoint
   * @param elementId WebDriver element ID
   */
  async clearElement(elementId: string): Promise<void> {
    this.ensureSession();
    debugIOS(`Clearing element: ${elementId}`);

    try {
      await this.makeRequest(
        'POST',
        `/session/${this.sessionId}/element/${elementId}/clear`,
      );
      debugIOS('Element cleared successfully');
    } catch (error) {
      debugIOS(`Failed to clear element: ${error}`);
      throw new Error(`Failed to clear element: ${error}`);
    }
  }

  /**
   * Clear the currently focused input field using WebDriver Clear API
   * @returns true if successful, false otherwise
   */
  async clearActiveElement(): Promise<boolean> {
    try {
      const elementId = await this.getActiveElement();
      if (!elementId) {
        debugIOS('No active element to clear');
        return false;
      }

      await this.clearElement(elementId);
      return true;
    } catch (error) {
      debugIOS(`Failed to clear active element: ${error}`);
      return false;
    }
  }

  private normalizeKeyName(key: string): string {
    // Convert to proper case for mapping (first letter uppercase, rest lowercase)
    return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
  }

  private getResponseValue(response: unknown): unknown {
    if (typeof response !== 'object' || response === null) {
      return response;
    }
    const responseRecord = response as Record<string, unknown>;
    return 'value' in responseRecord ? responseRecord.value : response;
  }

  private getElementId(element: unknown): string | null {
    if (typeof element !== 'object' || element === null) {
      return null;
    }
    const elementRecord = element as Record<string, unknown>;
    const elementId = elementRecord[w3cElementId] ?? elementRecord.ELEMENT;
    return typeof elementId === 'string' ? elementId : null;
  }

  private getElementIds(response: unknown): string[] {
    const elements = this.getResponseValue(response);
    if (!Array.isArray(elements)) {
      throw new Error(
        `Unexpected WDA elements response: ${JSON.stringify(response)}`,
      );
    }

    return elements.map((element, index) => {
      const elementId = this.getElementId(element);
      if (!elementId) {
        throw new Error(
          `WDA element at index ${index} has no element ID: ${JSON.stringify(element)}`,
        );
      }
      return elementId;
    });
  }

  private async findElementIds(
    using: string,
    value: string,
    rootElementId?: string,
  ): Promise<string[]> {
    const endpoint = rootElementId
      ? `/session/${this.sessionId}/element/${rootElementId}/elements`
      : `/session/${this.sessionId}/elements`;
    const response = await this.makeRequest('POST', endpoint, {
      using,
      value,
    });
    return this.getElementIds(response);
  }

  private async getElementRect(
    elementId: string,
  ): Promise<WebDriverElementRect> {
    const response = await this.makeRequest(
      'GET',
      `/session/${this.sessionId}/element/${elementId}/rect`,
    );
    const rect = this.getResponseValue(response);
    if (
      typeof rect !== 'object' ||
      rect === null ||
      !['x', 'y', 'width', 'height'].every((key) =>
        Number.isFinite((rect as Record<string, unknown>)[key]),
      )
    ) {
      throw new Error(
        `Unexpected WDA element rect response: ${JSON.stringify(response)}`,
      );
    }
    const rectRecord = rect as Record<keyof WebDriverElementRect, number>;
    return {
      x: rectRecord.x,
      y: rectRecord.y,
      width: rectRecord.width,
      height: rectRecord.height,
    };
  }

  private async clickElement(elementId: string): Promise<void> {
    await this.makeRequest(
      'POST',
      `/session/${this.sessionId}/element/${elementId}/click`,
    );
  }

  private async findVisibleKeyboardIds(): Promise<string[]> {
    return await this.findElementIds(
      'predicate string',
      'type == "XCUIElementTypeKeyboard" AND visible == true',
    );
  }

  private async getVisibleKeyboardRect(): Promise<WebDriverElementRect | null> {
    const keyboardIds = await this.findVisibleKeyboardIds();
    if (keyboardIds.length === 0) {
      return null;
    }

    const keyboardRects: WebDriverElementRect[] = [];
    for (const keyboardId of keyboardIds) {
      const rect = await this.getElementRect(keyboardId);
      if (rect.width > 0 && rect.height > 0) {
        keyboardRects.push(rect);
      }
    }

    const keyboardRect = keyboardRects.sort(
      (left, right) => right.width * right.height - left.width * left.height,
    )[0];
    if (!keyboardRect) {
      throw new Error('WDA reported a visible keyboard without a valid rect');
    }
    return keyboardRect;
  }

  private async dismissKeyboardByName(
    keyNames: string[],
    keyboardRect: WebDriverElementRect,
  ): Promise<boolean> {
    const predicateNames = keyNames
      .map(
        (name) => `"${name.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`,
      )
      .join(', ');
    const buttonIds = await this.findElementIds(
      'predicate string',
      `type IN {"XCUIElementTypeButton", "XCUIElementTypeKey"} AND enabled == true AND visible == true AND (name IN {${predicateNames}} OR label IN {${predicateNames}})`,
    );
    const nearbyButtons: Array<{
      id: string;
      distanceFromKeyboard: number;
    }> = [];
    for (const buttonId of buttonIds) {
      const rect = await this.getElementRect(buttonId);
      const centerX = rect.x + rect.width / 2;
      const centerY = rect.y + rect.height / 2;
      const isNearKeyboard =
        rect.width > 0 &&
        rect.height > 0 &&
        centerX >= keyboardRect.x &&
        centerX <= keyboardRect.x + keyboardRect.width &&
        centerY >= keyboardRect.y - keyboardNamedButtonMaxDistance &&
        centerY <= keyboardRect.y + keyboardRect.height;
      if (isNearKeyboard) {
        nearbyButtons.push({
          id: buttonId,
          distanceFromKeyboard: Math.abs(centerY - keyboardRect.y),
        });
      }
    }
    nearbyButtons.sort(
      (left, right) => left.distanceFromKeyboard - right.distanceFromKeyboard,
    );
    const dismissButton = nearbyButtons[0];
    if (!dismissButton) {
      return false;
    }

    await this.clickElement(dismissButton.id);
    debugIOS(
      `Dismissed keyboard using configured button: ${keyNames.join(', ')}`,
    );
    return true;
  }

  private async dismissKeyboardUsingAccessoryToolbar(
    keyboardRect: WebDriverElementRect,
  ): Promise<boolean> {
    const toolbarIds = await this.findElementIds(
      'class name',
      'XCUIElementTypeToolbar',
    );
    const toolbarCandidates: Array<{
      id: string;
      rect: WebDriverElementRect;
      gap: number;
    }> = [];

    for (const toolbarId of toolbarIds) {
      const rect = await this.getElementRect(toolbarId);
      const overlapWidth = Math.max(
        0,
        Math.min(rect.x + rect.width, keyboardRect.x + keyboardRect.width) -
          Math.max(rect.x, keyboardRect.x),
      );
      const horizontalOverlap = overlapWidth / keyboardRect.width;
      const gap = keyboardRect.y - (rect.y + rect.height);
      const maxGap = Math.max(
        keyboardAccessoryToolbarGeometry.maxGap,
        rect.height,
      );
      const isKeyboardAccessory =
        rect.width > 0 &&
        rect.height >= keyboardAccessoryToolbarGeometry.minHeight &&
        rect.height <= keyboardAccessoryToolbarGeometry.maxHeight &&
        horizontalOverlap >=
          keyboardAccessoryToolbarGeometry.minHorizontalOverlap &&
        rect.y <= keyboardRect.y &&
        gap >= -rect.height &&
        gap <= maxGap;

      if (isKeyboardAccessory) {
        toolbarCandidates.push({ id: toolbarId, rect, gap });
      }
    }

    toolbarCandidates.sort(
      (left, right) => Math.abs(left.gap) - Math.abs(right.gap),
    );

    for (const toolbar of toolbarCandidates) {
      const buttonIds = await this.findElementIds(
        'predicate string',
        'type == "XCUIElementTypeButton" AND enabled == true AND visible == true',
        toolbar.id,
      );
      const rightSideButtons: Array<{
        id: string;
        rect: WebDriverElementRect;
      }> = [];

      for (const buttonId of buttonIds) {
        const rect = await this.getElementRect(buttonId);
        const centerX = rect.x + rect.width / 2;
        const centerY = rect.y + rect.height / 2;
        const isVisibleInsideToolbar =
          rect.width > 0 &&
          rect.height > 0 &&
          centerX >=
            toolbar.rect.x +
              toolbar.rect.width *
                keyboardAccessoryToolbarGeometry.minRightButtonCenterRatio &&
          centerX <= toolbar.rect.x + toolbar.rect.width &&
          centerY >= toolbar.rect.y &&
          centerY <= toolbar.rect.y + toolbar.rect.height;

        if (isVisibleInsideToolbar) {
          rightSideButtons.push({ id: buttonId, rect });
        }
      }

      rightSideButtons.sort(
        (left, right) =>
          right.rect.x + right.rect.width - (left.rect.x + left.rect.width),
      );
      const dismissButton = rightSideButtons[0];
      if (!dismissButton) {
        continue;
      }

      await this.clickElement(dismissButton.id);
      debugIOS('Dismissed keyboard using the accessory toolbar button');
      return true;
    }

    return false;
  }

  private async waitForKeyboardToHide(): Promise<boolean> {
    const deadline = Date.now() + keyboardDismissTimeoutMs;
    while (Date.now() < deadline) {
      if (!(await this.isKeyboardVisible())) {
        return true;
      }
      await new Promise((resolve) =>
        setTimeout(resolve, keyboardDismissPollIntervalMs),
      );
    }
    return false;
  }

  /**
   * Hides the visible software keyboard and waits until WDA confirms it is gone.
   *
   * By default this locates a full-width accessory toolbar next to the keyboard
   * and clicks its rightmost enabled button without depending on localized text.
   * Explicit key names are only matched within the keyboard's nearby region.
   *
   * @returns `true` when the keyboard is hidden, or `false` when no supported
   * dismissal control exists or the keyboard remains visible after the timeout.
   * @throws When WDA returns an invalid response or a request fails.
   */
  async dismissKeyboard(keyNames?: string[]): Promise<boolean> {
    this.ensureSession();

    const keyboardRect = await this.getVisibleKeyboardRect();
    if (!keyboardRect) {
      return true;
    }

    const dismissalStarted =
      keyNames && keyNames.length > 0
        ? await this.dismissKeyboardByName(keyNames, keyboardRect)
        : await this.dismissKeyboardUsingAccessoryToolbar(keyboardRect);
    return dismissalStarted ? await this.waitForKeyboardToHide() : false;
  }

  /** Returns whether WDA currently exposes a visible software keyboard. */
  async isKeyboardVisible(): Promise<boolean> {
    this.ensureSession();
    return (await this.findVisibleKeyboardIds()).length > 0;
  }

  /**
   * Send raw key events without trimming whitespace.
   * Unlike typeText(), this preserves spaces and newlines.
   * Used by the per-character typing delay path where each character
   * must be delivered exactly as-is.
   */
  async typeRawKeys(chars: string[]): Promise<void> {
    this.ensureSession();

    try {
      await this.makeRequest('POST', `/session/${this.sessionId}/wda/keys`, {
        value: chars,
      });
      debugIOS(`Sent raw keys: ${JSON.stringify(chars)}`);
    } catch (error) {
      debugIOS(`Failed to send raw keys ${JSON.stringify(chars)}: ${error}`);
      throw new Error(`Failed to send keys: ${error}`);
    }
  }

  async typeText(text: string): Promise<void> {
    this.ensureSession();

    try {
      // Clean the text to avoid unwanted trailing spaces
      const cleanText = text.trim();
      // Use WebDriverAgent's keys endpoint with array value
      await this.makeRequest('POST', `/session/${this.sessionId}/wda/keys`, {
        value: cleanText.split(''), // Must be an array of characters
      });
      debugIOS(`Typed text: "${text}"`);
    } catch (error) {
      debugIOS(`Failed to type text "${text}": ${error}`);
      throw new Error(`Failed to type text: ${error}`);
    }
  }

  async tap(x: number, y: number): Promise<void> {
    this.ensureSession();

    try {
      // New endpoint (WDA 6.0.0+): POST /session/{id}/wda/tap
      await this.makeRequest('POST', `/session/${this.sessionId}/wda/tap`, {
        x,
        y,
      });
      debugIOS(`Tapped at coordinates (${x}, ${y})`);
    } catch (error) {
      // Legacy endpoint (WDA 5.x): POST /session/{id}/wda/tap/0
      debugIOS(`New tap endpoint failed, trying legacy endpoint: ${error}`);
      try {
        await this.makeRequest('POST', `/session/${this.sessionId}/wda/tap/0`, {
          x,
          y,
        });
        debugIOS(`Tapped at coordinates (${x}, ${y}) using legacy endpoint`);
      } catch (fallbackError) {
        debugIOS(`Failed to tap at (${x}, ${y}): ${fallbackError}`);
        throw new Error(`Failed to tap at coordinates: ${fallbackError}`);
      }
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

    // Use W3C Actions API for better scroll support
    const actions = {
      actions: [
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            { type: 'pointerMove', duration: 0, x: fromX, y: fromY },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 100 },
            { type: 'pointerMove', duration, x: toX, y: toY },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    };

    await this.makeRequest(
      'POST',
      `/session/${this.sessionId}/actions`,
      actions,
    );
    debugIOS(
      `Swiped using W3C Actions from (${fromX}, ${fromY}) to (${toX}, ${toY}) in ${duration}ms`,
    );
  }

  async pinch(
    centerX: number,
    centerY: number,
    startDistance: number,
    endDistance: number,
    duration = 500,
  ): Promise<void> {
    this.ensureSession();

    const halfStart = startDistance / 2;
    const halfEnd = endDistance / 2;

    const actions = {
      actions: [
        {
          type: 'pointer',
          id: 'finger1',
          parameters: { pointerType: 'touch' },
          actions: [
            {
              type: 'pointerMove',
              duration: 0,
              x: centerX,
              y: Math.round(centerY - halfStart),
            },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 100 },
            {
              type: 'pointerMove',
              duration,
              x: centerX,
              y: Math.round(centerY - halfEnd),
            },
            { type: 'pointerUp', button: 0 },
          ],
        },
        {
          type: 'pointer',
          id: 'finger2',
          parameters: { pointerType: 'touch' },
          actions: [
            {
              type: 'pointerMove',
              duration: 0,
              x: centerX,
              y: Math.round(centerY + halfStart),
            },
            { type: 'pointerDown', button: 0 },
            { type: 'pause', duration: 100 },
            {
              type: 'pointerMove',
              duration,
              x: centerX,
              y: Math.round(centerY + halfEnd),
            },
            { type: 'pointerUp', button: 0 },
          ],
        },
      ],
    };

    await this.makeRequest(
      'POST',
      `/session/${this.sessionId}/actions`,
      actions,
    );
    debugIOS(
      `Pinched at (${centerX}, ${centerY}) from distance ${startDistance} to ${endDistance} in ${duration}ms`,
    );
  }

  async longPress(x: number, y: number, duration = 1000): Promise<void> {
    this.ensureSession();

    // Use WebDriverAgent's long press endpoint
    await this.makeRequest(
      'POST',
      `/session/${this.sessionId}/wda/touchAndHold`,
      {
        x,
        y,
        duration: duration / 1000, // WDA expects seconds
      },
    );
    debugIOS(`Long pressed at coordinates (${x}, ${y}) for ${duration}ms`);
  }

  async doubleTap(x: number, y: number): Promise<void> {
    this.ensureSession();

    // Use WebDriverAgent's double tap endpoint
    await this.makeRequest('POST', `/session/${this.sessionId}/wda/doubleTap`, {
      x,
      y,
    });
    debugIOS(`Double tapped at coordinates (${x}, ${y})`);
  }

  async tripleTap(x: number, y: number): Promise<void> {
    this.ensureSession();

    // Use WebDriverAgent's tapWithNumberOfTaps endpoint
    await this.makeRequest(
      'POST',
      `/session/${this.sessionId}/wda/tapWithNumberOfTaps`,
      {
        x,
        y,
        numberOfTaps: 3,
        numberOfTouches: 1,
      },
    );
    debugIOS(`Triple tapped at coordinates (${x}, ${y})`);
  }

  async getScreenScale(): Promise<number | null> {
    this.ensureSession();

    try {
      // Try GET /session/{id}/wda/screen (Python facebook-wda compatible)
      const screenResponse = await this.makeRequest(
        'GET',
        `/session/${this.sessionId}/wda/screen`,
      );
      if (screenResponse?.value?.scale) {
        debugIOS(
          `Got screen scale from WDA screen endpoint: ${screenResponse.value.scale}`,
        );
        return screenResponse.value.scale;
      }
    } catch (error) {
      debugIOS(`Failed to get screen scale from /wda/screen: ${error}`);
    }

    // Fallback: Calculate scale from screenshot size / window size (Python facebook-wda compatible)
    try {
      debugIOS('Calculating screen scale from screenshot and window size');
      const [screenshotBase64, windowSize] = await Promise.all([
        this.takeScreenshot(),
        this.getWindowSize(),
      ]);

      // Get screenshot dimensions from base64
      const { imageInfoOfBase64 } = await import('@midscene/shared/img');
      const { width: screenshotWidth, height: screenshotHeight } =
        await imageInfoOfBase64(screenshotBase64);

      // Calculate scale: max(screenshot.size) / max(window.size)
      const scale =
        Math.max(screenshotWidth, screenshotHeight) /
        Math.max(windowSize.width, windowSize.height);

      const roundedScale = Math.round(scale);
      debugIOS(
        `Calculated screen scale: ${roundedScale} (screenshot: ${screenshotWidth}x${screenshotHeight}, window: ${windowSize.width}x${windowSize.height})`,
      );
      return roundedScale;
    } catch (error) {
      debugIOS(`Failed to calculate screen scale: ${error}`);
    }

    debugIOS('No screen scale found');
    return null;
  }

  async createSession(capabilities?: any): Promise<any> {
    // iOS-specific default capabilities
    const defaultCapabilities = {
      platformName: 'iOS',
      automationName: 'XCUITest',
      // iOS-specific settings
      shouldUseSingletonTestManager: false,
      shouldUseTestManagerForVisibilityDetection: false,
      ...capabilities,
    };

    // Use parent's session creation with enhanced capabilities
    const session = await super.createSession(defaultCapabilities);

    // iOS-specific session post-setup
    await this.setupIOSSession();

    return session;
  }

  private async setupIOSSession(): Promise<void> {
    if (!this.sessionId) return;

    try {
      // Set iOS-specific session configuration + MJPEG server settings
      await this.makeRequest(
        'POST',
        `/session/${this.sessionId}/appium/settings`,
        {
          snapshotMaxDepth: 50,
          elementResponseAttributes:
            'type,label,name,value,rect,enabled,visible',
          mjpegServerScreenshotQuality: WDA_MJPEG_SCREENSHOT_QUALITY,
          mjpegServerFramerate: WDA_MJPEG_FRAMERATE,
          mjpegScalingFactor: WDA_MJPEG_SCALING_FACTOR,
        },
      );
      debugIOS('iOS session configuration applied (including MJPEG settings)');
    } catch (error) {
      debugIOS(`Failed to apply iOS session configuration: ${error}`);
      // Don't throw, this is optional configuration
    }
  }

  async setupExistingSession(): Promise<void> {
    this.ensureSession();
    await this.setupIOSSession();
  }

  /**
   * Execute a WebDriverAgent API request directly
   * This is the iOS equivalent of Android's runAdbShell
   * @param method HTTP method (GET, POST, DELETE, etc.)
   * @param endpoint WebDriver API endpoint
   * @param data Optional request body data
   * @returns Response from the WebDriver API
   */
  async executeRequest<TResult = any>(
    method: string,
    endpoint: string,
    data?: any,
  ): Promise<TResult> {
    return this.makeRequest(method, this.buildSessionEndpoint(endpoint), data);
  }
}
