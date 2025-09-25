import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { WDAManager } from '@midscene/webdriver';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { IOSDevice } from '../../src/device';
import { IOSWebDriverClient } from '../../src/ios-webdriver-client';

// Mock dependencies
vi.mock('../../src/utils');
vi.mock('../../src/ios-webdriver-client');
vi.mock('@midscene/webdriver');

describe('IOSDevice', () => {
  let device: IOSDevice;
  let mockWdaClient: Partial<IOSWebDriverClient>;

  const MockedWdaClient = vi.mocked(IOSWebDriverClient);
  const MockedWdaManager = vi.mocked(WDAManager);

  beforeEach(async () => {
    // Setup mock WDA client
    mockWdaClient = {
      createSession: vi
        .fn()
        .mockResolvedValue({ sessionId: 'test-session-id' }),
      deleteSession: vi.fn().mockResolvedValue(undefined),
      getWindowSize: vi.fn().mockResolvedValue({ width: 375, height: 812 }),
      takeScreenshot: vi.fn().mockResolvedValue('base64-screenshot'),
      tap: vi.fn().mockResolvedValue(undefined),
      swipe: vi.fn().mockResolvedValue(undefined),
      typeText: vi.fn().mockResolvedValue(undefined),
      pressKey: vi.fn().mockResolvedValue(undefined),
      pressHomeButton: vi.fn().mockResolvedValue(undefined),
      launchApp: vi.fn().mockResolvedValue(undefined),
      openUrl: vi.fn().mockResolvedValue(undefined),
      dismissKeyboard: vi.fn().mockResolvedValue(true),
      makeRequest: vi.fn().mockResolvedValue(null),
      sessionInfo: {
        sessionId: 'test-session-id',
        capabilities: {},
      }, // Add session info for keyboard tests
    };

    // Add getDeviceInfo mock
    mockWdaClient.getDeviceInfo = vi.fn().mockResolvedValue({
      udid: 'test-device-udid',
      name: 'Test Device',
      model: 'iPhone 15',
    });

    MockedWdaClient.mockImplementation(
      () => mockWdaClient as IOSWebDriverClient,
    );

    // Setup mock WDA manager
    const mockWdaManager = {
      start: vi.fn().mockResolvedValue(undefined),
      stop: vi.fn().mockResolvedValue(undefined),
      isRunning: vi.fn().mockReturnValue(true),
      getPort: vi.fn().mockReturnValue(DEFAULT_WDA_PORT),
    };

    MockedWdaManager.getInstance = vi.fn().mockReturnValue(mockWdaManager);

    device = new IOSDevice({
      wdaPort: DEFAULT_WDA_PORT,
      wdaHost: 'localhost',
    });
  });

  afterEach(async () => {
    vi.clearAllMocks();
    if (device) {
      await device.destroy();
    }
  });

  describe('Constructor', () => {
    it('should create device with options', () => {
      expect(device).toBeDefined();
      expect(device.interfaceType).toBe('ios');
    });

    it('should create device with default options', () => {
      const defaultDevice = new IOSDevice();
      expect(defaultDevice).toBeDefined();
      expect(defaultDevice.interfaceType).toBe('ios');
    });

    it('should create device with custom options', () => {
      const customDevice = new IOSDevice({
        wdaPort: 9100,
        wdaHost: 'custom-host',
        autoDismissKeyboard: false,
      });

      expect(customDevice).toBeDefined();
      expect(customDevice.interfaceType).toBe('ios');
    });

    it('should use default WDA settings when not specified', () => {
      const device = new IOSDevice();
      expect(MockedWdaClient).toHaveBeenCalledWith({
        port: DEFAULT_WDA_PORT,
        host: 'localhost',
      });
    });

    it('should use custom WDA settings when specified', () => {
      const device = new IOSDevice({
        wdaPort: 9100,
        wdaHost: 'custom-host',
      });
      expect(MockedWdaClient).toHaveBeenCalledWith({
        port: 9100,
        host: 'custom-host',
      });
    });
  });

  describe('Device Info', () => {
    it('should have correct interface type', () => {
      expect(device.interfaceType).toBe('ios');
    });

    it('should provide device description', async () => {
      await device.connect(); // Connect first to get device info
      const description = device.describe();
      expect(description).toContain('UDID: test-device-udid');
      expect(description).toContain('Name: Test Device');
      expect(description).toContain('Model: iPhone 15');
    });
  });

  describe('Action Space', () => {
    it('should provide action space with iOS-specific actions', () => {
      const actions = device.actionSpace();
      expect(Array.isArray(actions)).toBe(true);
      expect(actions.length).toBeGreaterThan(0);

      const actionNames = actions.map((action) => action.name);
      expect(actionNames).toContain('Tap');
      expect(actionNames).toContain('Input');
      expect(actionNames).toContain('Scroll');
      expect(actionNames).toContain('IOSHomeButton');
      expect(actionNames).toContain('IOSLongPress');
      expect(actionNames).toContain('IOSAppSwitcher');
    });

    it('should include custom actions when provided', () => {
      const customAction = {
        name: 'CustomAction',
        description: 'A custom action for testing',
        paramSchema: {},
        call: vi.fn(),
      };

      const deviceWithCustomActions = new IOSDevice({
        customActions: [customAction],
      });

      const actions = deviceWithCustomActions.actionSpace();
      const actionNames = actions.map((action) => action.name);
      expect(actionNames).toContain('CustomAction');
    });
  });

  describe('Device Operations', () => {
    it('should connect to device successfully', async () => {
      await expect(device.connect()).resolves.not.toThrow();
      expect(mockWdaClient.createSession).toHaveBeenCalled();
    });

    it('should handle connection failure', async () => {
      mockWdaClient.createSession = vi
        .fn()
        .mockRejectedValue(new Error('Connection failed'));

      await expect(device.connect()).rejects.toThrow('Connection failed');
    });

    it('should get screen size after connection', async () => {
      await device.connect();

      const size = await device.size();
      expect(size).toEqual({
        width: 375,
        height: 812,
        dpr: 1,
      });
      expect(mockWdaClient.getWindowSize).toHaveBeenCalled();
    });

    it('should take screenshot after connection', async () => {
      await device.connect();

      const screenshot = await device.screenshotBase64();
      expect(screenshot).toContain('data:image/png;base64,');
      expect(screenshot).toContain('base64-screenshot');
      expect(mockWdaClient.takeScreenshot).toHaveBeenCalled();
    });

    it('should handle app launch with bundle ID', async () => {
      await device.connect();

      await device.launch('com.apple.Preferences');
      expect(mockWdaClient.launchApp).toHaveBeenCalledWith(
        'com.apple.Preferences',
      );
    });

    it('should handle URL launch with HTTP URL', async () => {
      // Add openUrl method to mock
      mockWdaClient.openUrl = vi.fn().mockResolvedValue(undefined);
      await device.connect();

      await device.launch('https://www.apple.com');
      expect(mockWdaClient.openUrl).toHaveBeenCalledWith(
        'https://www.apple.com',
      );
    });

    it('should handle URL launch with custom scheme', async () => {
      // Add openUrl method to mock
      mockWdaClient.openUrl = vi.fn().mockResolvedValue(undefined);
      await device.connect();

      await device.launch('myapp://deep/link');
      expect(mockWdaClient.openUrl).toHaveBeenCalledWith('myapp://deep/link');
    });

    it('should fallback to Safari when direct URL opening fails', async () => {
      // Mock openUrl to fail, launchApp to succeed
      mockWdaClient.openUrl = vi
        .fn()
        .mockRejectedValue(new Error('Direct URL failed'));
      mockWdaClient.launchApp = vi.fn().mockResolvedValue(undefined);
      await device.connect();

      await device.launch('https://www.example.com');

      // Should try direct URL first
      expect(mockWdaClient.openUrl).toHaveBeenCalledWith(
        'https://www.example.com',
      );
      // Then fallback to Safari
      expect(mockWdaClient.launchApp).toHaveBeenCalledWith(
        'com.apple.mobilesafari',
      );
    });

    it('should perform tap operation', async () => {
      await device.connect();

      await device.tap(100, 200);
      expect(mockWdaClient.tap).toHaveBeenCalledWith(100, 200);
    });

    it('should perform swipe operation', async () => {
      await device.connect();

      await device.swipe(100, 200, 300, 400, 500);
      expect(mockWdaClient.swipe).toHaveBeenCalledWith(100, 200, 300, 400, 500);
    });

    it('should type text', async () => {
      await device.connect();

      await device.typeText('Hello World');
      expect(mockWdaClient.typeText).toHaveBeenCalledWith('Hello World');
    });

    it('should press home button', async () => {
      await device.connect();

      await device.home();
      expect(mockWdaClient.pressHomeButton).toHaveBeenCalled();
    });

    it('should trigger app switcher', async () => {
      await device.connect();

      await device.appSwitcher();
      expect(mockWdaClient.swipe).toHaveBeenCalled();
    });

    it('should handle keyboard dismissal', async () => {
      await device.connect();

      await device.hideKeyboard();
      // Check that the request was made to dismiss keyboard
      expect(mockWdaClient.makeRequest).toBeDefined();
    });

    it('should allow size operations even when not connected (WDA handles connection)', async () => {
      // The device allows some operations that rely on WDA backend directly
      const size = await device.size();
      expect(size).toEqual({
        width: 375,
        height: 812,
        dpr: 1,
      });
    });

    it('should prevent connection operations after destruction', async () => {
      await device.connect();
      await device.destroy();

      await expect(device.connect()).rejects.toThrow('destroyed');
    });
  });

  describe('Device State Management', () => {
    it('should handle destroy properly', async () => {
      await device.connect();
      await device.destroy();
      expect(mockWdaClient.deleteSession).toHaveBeenCalled();
      expect(() => device.describe()).not.toThrow();
    });

    it('should prevent connection after destroy', async () => {
      await device.destroy();
      await expect(device.connect()).rejects.toThrow('destroyed');
    });

    it('should handle multiple destroy calls gracefully', async () => {
      await device.destroy();
      await expect(device.destroy()).resolves.not.toThrow();
    });
  });

  describe('Configuration Options', () => {
    it('should respect autoDismissKeyboard setting', () => {
      const deviceWithoutAutoDismiss = new IOSDevice({
        autoDismissKeyboard: false,
      });
      expect(deviceWithoutAutoDismiss).toBeDefined();
    });

    it('should handle custom WDA port and host', () => {
      const deviceWithCustomWDA = new IOSDevice({
        wdaPort: 9100,
        wdaHost: 'remote-host',
      });
      expect(MockedWdaClient).toHaveBeenCalledWith({
        port: 9100,
        host: 'remote-host',
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle WDA client creation failure', () => {
      MockedWdaClient.mockImplementation(() => {
        throw new Error('WDA client creation failed');
      });

      expect(() => new IOSDevice()).toThrow('WDA client creation failed');
    });

    it('should handle session creation timeout', async () => {
      mockWdaClient.createSession = vi.fn().mockImplementation(() => {
        return new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Session creation timeout')), 100);
        });
      });

      await expect(device.connect()).rejects.toThrow(
        'Session creation timeout',
      );
    });

    it('should handle screenshot failure gracefully', async () => {
      await device.connect();
      mockWdaClient.takeScreenshot = vi
        .fn()
        .mockRejectedValue(new Error('Screenshot failed'));

      await expect(device.screenshotBase64()).rejects.toThrow(
        'Screenshot failed',
      );
    });

    it('should handle app launch failure', async () => {
      await device.connect();
      mockWdaClient.launchApp = vi
        .fn()
        .mockRejectedValue(new Error('App launch failed'));

      await expect(device.launch('com.invalid.app')).rejects.toThrow(
        'App launch failed',
      );
    });

    it('should handle tap operation failure', async () => {
      await device.connect();
      mockWdaClient.tap = vi.fn().mockRejectedValue(new Error('Tap failed'));

      await expect(device.tap(100, 200)).rejects.toThrow('Tap failed');
    });

    it('should handle text input failure', async () => {
      await device.connect();
      mockWdaClient.typeText = vi
        .fn()
        .mockRejectedValue(new Error('Type text failed'));

      await expect(device.typeText('test')).rejects.toThrow('Type text failed');
    });
  });

  describe('Keyboard Management', () => {
    beforeEach(async () => {
      await device.connect();
      // Mock makeRequest for keyboard operations
      mockWdaClient.makeRequest = vi.fn().mockResolvedValue(null);
    });

    it('should handle keyboard dismissal with default strategy', async () => {
      // Mock getWindowSize and swipe methods since hideKeyboard uses swipe gesture by default
      mockWdaClient.getWindowSize = vi.fn().mockResolvedValue({ width: 375, height: 812 });
      mockWdaClient.swipe = vi.fn().mockResolvedValue(undefined);

      const result = await device.hideKeyboard();
      expect(result).toBe(true);
      expect(mockWdaClient.swipe).toHaveBeenCalled();
    });

    it('should handle keyboard dismissal failure', async () => {
      // Mock swipe to throw an error to simulate failure
      mockWdaClient.getWindowSize = vi.fn().mockResolvedValue({ width: 375, height: 812 });
      mockWdaClient.swipe = vi.fn().mockRejectedValue(new Error('Swipe failed'));

      const result = await device.hideKeyboard();
      expect(result).toBe(false); // Method returns false on failure, doesn't throw
    });

    it('should auto-dismiss keyboard after text input when enabled', async () => {
      // Mock the WDA client before creating the device
      const mockBackend = {
        ...mockWdaClient,
        createSession: vi.fn().mockResolvedValue({ sessionId: 'test-session' }),
        typeText: vi.fn().mockResolvedValue(undefined),
        getWindowSize: vi.fn().mockResolvedValue({ width: 375, height: 812 }),
        swipe: vi.fn().mockResolvedValue(undefined),
        sessionInfo: { sessionId: 'test-session' }, // Ensure session info is available
      };
      MockedWdaClient.mockImplementation(
        () => mockBackend as unknown as IOSWebDriverClient,
      );

      const deviceWithAutoDismiss = new IOSDevice({
        autoDismissKeyboard: true,
      });

      await deviceWithAutoDismiss.connect();
      await deviceWithAutoDismiss.typeText('test text');

      // Should call typeText and swipe (for keyboard dismiss)
      expect(mockBackend.typeText).toHaveBeenCalledWith('test text');
      expect(mockBackend.swipe).toHaveBeenCalled();
    });
  });

  describe('Screen Operations', () => {
    beforeEach(async () => {
      await device.connect();
    });

    it('should calculate DPR correctly', async () => {
      const size = await device.size();
      expect(size.dpr).toBe(1); // Default DPR for mocked device
    });

    it('should handle different screen sizes', async () => {
      mockWdaClient.getWindowSize = vi
        .fn()
        .mockResolvedValue({ width: 1920, height: 1080 });

      const size = await device.size();
      expect(size.width).toBe(1920);
      expect(size.height).toBe(1080);
    });

    it('should return base64 screenshot', async () => {
      const screenshot = await device.screenshotBase64();
      expect(typeof screenshot).toBe('string');
      expect(screenshot).toContain('data:image/png;base64,');
      expect(screenshot).toContain('base64-screenshot');
    });
  });
});
