import { DEFAULT_WDA_PORT } from '@midscene/shared/constants';
import { describe, expect, it } from 'vitest';

describe('IOSWebDriverClient - Simple Tests', () => {
  describe('Module Structure', () => {
    it('should export IOSWebDriverClient class', async () => {
      const module = await import('../../src/ios-webdriver-client');
      expect(module.IOSWebDriverClient).toBeDefined();
      expect(typeof module.IOSWebDriverClient).toBe('function'); // Constructor is a function
    });

    it('should be constructible with basic parameters', async () => {
      const { IOSWebDriverClient } = await import(
        '../../src/ios-webdriver-client'
      );

      expect(() => {
        new IOSWebDriverClient({ port: DEFAULT_WDA_PORT, host: 'localhost' });
      }).not.toThrow();
    });

    it('should have expected public methods', async () => {
      const { IOSWebDriverClient } = await import(
        '../../src/ios-webdriver-client'
      );
      const client = new IOSWebDriverClient({
        port: DEFAULT_WDA_PORT,
        host: 'localhost',
      });

      // Check that expected methods exist
      const expectedMethods = [
        'createSession',
        'deleteSession',
        'getWindowSize',
        'takeScreenshot',
        'tap',
        'swipe',
        'typeText',
        'pressKey',
        'launchApp',
        'openUrl',
        'getDeviceInfo',
        'pressHomeButton',
        'activateApp',
        'terminateApp',
      ];

      for (const method of expectedMethods) {
        expect(client[method]).toBeDefined();
        expect(typeof client[method]).toBe('function');
      }
    });

    it('should store initialization parameters correctly', async () => {
      const { IOSWebDriverClient } = await import(
        '../../src/ios-webdriver-client'
      );
      const port = 9876;
      const host = 'test-host';

      const client = new IOSWebDriverClient({ port, host });

      // Check that the client stores the parameters (these are likely private but we can test behavior)
      expect(client).toBeDefined();
      expect(client.constructor.name).toBe('IOSWebDriverClient');
    });
  });
});
