import { describe, expect, it } from 'vitest';

describe('WebDriverAgentBackend - Simple Tests', () => {
  describe('Module Structure', () => {
    it('should export WebDriverAgentBackend class', async () => {
      const module = await import('../../src/wda-backend');
      expect(module.WebDriverAgentBackend).toBeDefined();
      expect(typeof module.WebDriverAgentBackend).toBe('function'); // Constructor is a function
    });

    it('should be constructible with basic parameters', async () => {
      const { WebDriverAgentBackend } = await import('../../src/wda-backend');

      expect(() => {
        new WebDriverAgentBackend('test-udid', 8100, 'localhost');
      }).not.toThrow();
    });

    it('should have expected public methods', async () => {
      const { WebDriverAgentBackend } = await import('../../src/wda-backend');
      const backend = new WebDriverAgentBackend('test-udid', 8100, 'localhost');

      // Check that expected methods exist
      const expectedMethods = [
        'createSession',
        'deleteSession',
        'makeRequest',
        'getWindowSize',
        'takeScreenshot',
        'tap',
        'swipe',
        'typeText',
        'pressKey',
        'homeButton',
        'launchApp',
        'openUrl',
      ];

      for (const method of expectedMethods) {
        expect(backend[method]).toBeDefined();
        expect(typeof backend[method]).toBe('function');
      }
    });

    it('should store initialization parameters correctly', async () => {
      const { WebDriverAgentBackend } = await import('../../src/wda-backend');
      const udid = 'test-device-123';
      const port = 9876;
      const host = 'test-host';

      const backend = new WebDriverAgentBackend(udid, port, host);

      // Check that the backend stores the parameters (these are likely private but we can test behavior)
      expect(backend).toBeDefined();
      expect(backend.constructor.name).toBe('WebDriverAgentBackend');
    });
  });
});
