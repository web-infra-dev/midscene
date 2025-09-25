import { getDebug } from '@midscene/shared/logger';
import { WebDriverClient } from '@midscene/webdriver';

const debugIOS = getDebug('webdriver:ios');

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
      // Use swipe gesture to trigger app switcher (as used in device.ts - original working approach)
      // Get window size for swipe coordinates
      const windowSize = await this.getWindowSize();

      // For iOS, use swipe up with slower/longer duration to trigger app switcher
      debugIOS('Triggering app switcher with slow swipe up gesture');

      // Swipe up from the very bottom of the screen to trigger app switcher
      const centerX = windowSize.width / 2;
      const startY = windowSize.height - 5; // Start from very bottom
      const endY = windowSize.height * 0.5; // Swipe to middle of screen

      // Use a slower, longer swipe to trigger app switcher without additional tapping
      await this.swipe(centerX, startY, centerX, endY, 1500); // Slower swipe

      await new Promise((resolve) => setTimeout(resolve, 800)); // Wait for app switcher to appear and stabilize
    } catch (error) {
      debugIOS(`App switcher failed: ${error}`);
      throw new Error(`Failed to trigger app switcher: ${error}`);
    }
  }

  async pressKey(key: string): Promise<void> {
    this.ensureSession();
    debugIOS(`Attempting to press key: ${key}`);

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

  private normalizeKeyName(key: string): string {
    // Convert to proper case for mapping (first letter uppercase, rest lowercase)
    return key.charAt(0).toUpperCase() + key.slice(1).toLowerCase();
  }

  async dismissKeyboard(keyNames?: string[]): Promise<boolean> {
    this.ensureSession();

    try {
      await this.makeRequest(
        'POST',
        `/session/${this.sessionId}/wda/keyboard/dismiss`,
        {
          keyNames: keyNames || ['done'],
        },
      );
      debugIOS('Dismissed keyboard using WDA API');
      return true;
    } catch (error) {
      debugIOS(`Failed to dismiss keyboard: ${error}`);
      return false;
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
      // Use WebDriverAgent's tap endpoint (most reliable)
      await this.makeRequest('POST', `/session/${this.sessionId}/wda/tap`, {
        x,
        y,
      });
      debugIOS(`Tapped at coordinates (${x}, ${y})`);
    } catch (error) {
      debugIOS(`Failed to tap at (${x}, ${y}): ${error}`);
      throw new Error(`Failed to tap at coordinates: ${error}`);
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
      // Use WebDriverAgent's drag endpoint (original working approach)
      await this.makeRequest(
        'POST',
        `/session/${this.sessionId}/wda/dragfromtoforduration`,
        {
          fromX,
          fromY,
          toX,
          toY,
          duration: duration / 1000, // WDA expects duration in seconds
        },
      );
      debugIOS(
        `Swiped from (${fromX}, ${fromY}) to (${toX}, ${toY}) in ${duration}ms`,
      );
    } catch (error) {
      debugIOS(
        `Failed to swipe from (${fromX}, ${fromY}) to (${toX}, ${toY}): ${error}`,
      );
      throw new Error(`Failed to swipe: ${error}`);
    }
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
      // Set iOS-specific session configuration
      await this.makeRequest(
        'POST',
        `/session/${this.sessionId}/appium/settings`,
        {
          snapshotMaxDepth: 50,
          elementResponseAttributes:
            'type,label,name,value,rect,enabled,visible',
        },
      );
      debugIOS('iOS session configuration applied');
    } catch (error) {
      debugIOS(`Failed to apply iOS session configuration: ${error}`);
      // Don't throw, this is optional configuration
    }
  }
}
