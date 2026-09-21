import { Page } from '@/puppeteer/base-page';
import * as coreUtilsActual from '@midscene/core/utils' with {
  rstest: 'importActual',
};
import { describe, expect, it, rs } from '@rstest/core';

// Mock necessary dependencies to avoid loading AI service dependencies
rs.mock('@midscene/shared/logger', () => ({
  getDebug: rs.fn(() => rs.fn()),
  logMsg: rs.fn(),
}));

rs.mock('@midscene/core/utils', () => ({
  ...coreUtilsActual,
  sleep: rs.fn(() => Promise.resolve()),
}));

rs.mock('@midscene/shared/node', () => ({
  getElementInfosScriptContent: rs.fn(() => ''),
  getExtraReturnLogic: rs.fn(() => Promise.resolve('() => ({})')),
}));

rs.mock('@/web-element', () => ({
  WebPageContextParser: rs.fn().mockResolvedValue({
    tree: { node: null, children: [] },
    shotSize: { width: 1024, height: 768 },
    shrunkShotToLogicalRatio: 1,
    screenshotBase64: 'mock-base64',
  }),
}));

rs.mock('@/web-page', () => ({
  commonWebActionsForWebPage: rs.fn(() => []),
}));

describe('Page - beforeInvokeAction and afterInvokeAction', () => {
  describe('beforeInvokeAction', () => {
    it('should call the beforeInvokeAction hook', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn().mockResolvedValue(true),
        waitForNetworkIdle: rs.fn().mockResolvedValue(true),
        evaluate: rs.fn(),
      } as any;

      const beforeHook = rs.fn();
      const page = new Page(mockPage, 'puppeteer', {
        beforeInvokeAction: beforeHook,
      });
      await page.beforeInvokeAction('testAction', { foo: 'bar' });

      expect(beforeHook).toHaveBeenCalledTimes(1);
      expect(beforeHook).toHaveBeenCalledWith('testAction', { foo: 'bar' });
    });

    it('should not wait for network idle in beforeInvokeAction', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn().mockResolvedValue(true),
        waitForNetworkIdle: rs.fn().mockResolvedValue(true),
        evaluate: rs.fn(),
      } as any;

      const page = new Page(mockPage, 'puppeteer');
      await page.beforeInvokeAction('testAction', {});

      // beforeInvokeAction no longer waits for network idle
      expect(mockPage.waitForNetworkIdle).not.toHaveBeenCalled();
      expect(mockPage.waitForSelector).not.toHaveBeenCalled();
    });

    it('should execute immediately without waiting', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn().mockImplementation(() => {
          return new Promise((resolve) => setTimeout(() => resolve(true), 100));
        }),
        waitForNetworkIdle: rs.fn().mockImplementation(() => {
          return new Promise((resolve) => setTimeout(() => resolve(true), 100));
        }),
        evaluate: rs.fn(),
      } as any;

      const page = new Page(mockPage, 'puppeteer');

      const startTime = Date.now();
      await page.beforeInvokeAction('testAction', {});
      const duration = Date.now() - startTime;

      // Should execute immediately without waiting
      expect(duration).toBeLessThan(50);
      expect(mockPage.waitForSelector).not.toHaveBeenCalled();
      expect(mockPage.waitForNetworkIdle).not.toHaveBeenCalled();
    });

    it('should call the beforeInvokeAction hook without waiting', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn().mockResolvedValue(true),
        waitForNetworkIdle: rs.fn().mockResolvedValue(true),
        evaluate: rs.fn(),
      } as any;

      const callOrder: string[] = [];
      mockPage.waitForSelector = rs.fn().mockImplementation(() => {
        callOrder.push('waitForSelector');
        return Promise.resolve(true);
      });
      mockPage.waitForNetworkIdle = rs.fn().mockImplementation(() => {
        callOrder.push('waitForNetworkIdle');
        return Promise.resolve(true);
      });

      const beforeHook = rs.fn().mockImplementation(() => {
        callOrder.push('beforeHook');
      });

      const page = new Page(mockPage, 'puppeteer', {
        beforeInvokeAction: beforeHook,
      });

      await page.beforeInvokeAction('testAction', { foo: 'bar' });

      // beforeInvokeAction should only call the hook, no waiting
      expect(callOrder).toEqual(['beforeHook']);
      expect(beforeHook).toHaveBeenCalledWith('testAction', { foo: 'bar' });
    });

    it('should work without hook configured', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn(),
        waitForNetworkIdle: rs.fn().mockResolvedValue(true),
        evaluate: rs.fn(),
      } as any;

      const page = new Page(mockPage, 'puppeteer');
      await page.beforeInvokeAction('testAction', {});

      // Should complete without error even when no hook is configured
      expect(mockPage.waitForSelector).not.toHaveBeenCalled();
      expect(mockPage.waitForNetworkIdle).not.toHaveBeenCalled();
    });
  });

  describe('afterInvokeAction', () => {
    it('should wait for navigation with default timeout', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn().mockResolvedValue(true),
        waitForNetworkIdle: rs.fn().mockResolvedValue(true),
        evaluate: rs.fn(),
      } as any;

      const page = new Page(mockPage, 'puppeteer');
      await page.afterInvokeAction('testAction', {});

      expect(mockPage.waitForSelector).toHaveBeenCalledTimes(1);
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('html', {
        timeout: 5000, // DEFAULT_WAIT_FOR_NAVIGATION_TIMEOUT
      });
    });

    it('should wait for network idle for puppeteer', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn().mockResolvedValue(true),
        waitForNetworkIdle: rs.fn().mockResolvedValue(true),
        evaluate: rs.fn(),
      } as any;

      const page = new Page(mockPage, 'puppeteer');
      await page.afterInvokeAction('testAction', {});

      expect(mockPage.waitForNetworkIdle).toHaveBeenCalledTimes(1);
      expect(mockPage.waitForNetworkIdle).toHaveBeenCalledWith({
        idleTime: 200,
        concurrency: 2, // DEFAULT_WAIT_FOR_NETWORK_IDLE_CONCURRENCY
        timeout: 2000, // DEFAULT_WAIT_FOR_NETWORK_IDLE_TIMEOUT
      });
    });

    it('should call the afterInvokeAction hook after waiting', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn().mockResolvedValue(true),
        waitForNetworkIdle: rs.fn().mockResolvedValue(true),
        evaluate: rs.fn(),
      } as any;

      const callOrder: string[] = [];
      mockPage.waitForSelector = rs.fn().mockImplementation(() => {
        callOrder.push('waitForSelector');
        return Promise.resolve(true);
      });
      mockPage.waitForNetworkIdle = rs.fn().mockImplementation(() => {
        callOrder.push('waitForNetworkIdle');
        return Promise.resolve(true);
      });

      const afterHook = rs.fn().mockImplementation(() => {
        callOrder.push('afterHook');
      });

      const page = new Page(mockPage, 'puppeteer', {
        afterInvokeAction: afterHook,
      });

      await page.afterInvokeAction('testAction', { foo: 'bar' });

      // Both wait methods should be called before the hook
      expect(callOrder).toContain('waitForSelector');
      expect(callOrder).toContain('waitForNetworkIdle');
      expect(callOrder).toContain('afterHook');

      const afterHookIndex = callOrder.indexOf('afterHook');
      const waitSelectorIndex = callOrder.indexOf('waitForSelector');
      const waitNetworkIndex = callOrder.indexOf('waitForNetworkIdle');

      expect(waitSelectorIndex).toBeLessThan(afterHookIndex);
      expect(waitNetworkIndex).toBeLessThan(afterHookIndex);
      expect(afterHook).toHaveBeenCalledWith('testAction', { foo: 'bar' });
    });

    it('should skip waiting for navigation when timeout is 0', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn(),
        waitForNetworkIdle: rs.fn().mockResolvedValue(true),
        evaluate: rs.fn(),
      } as any;

      const page = new Page(mockPage, 'puppeteer', {
        waitForNavigationTimeout: 0,
      });
      await page.afterInvokeAction('testAction', {});

      // waitForSelector should not be called when timeout is 0
      expect(mockPage.waitForSelector).not.toHaveBeenCalled();
    });

    it('should skip waiting for network idle when timeout is 0', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn().mockResolvedValue(true),
        waitForNetworkIdle: rs.fn(),
        evaluate: rs.fn(),
      } as any;

      const page = new Page(mockPage, 'puppeteer', {
        waitForNetworkIdleTimeout: 0,
      });
      await page.afterInvokeAction('testAction', {});

      // waitForNetworkIdle should not be called when timeout is 0
      expect(mockPage.waitForNetworkIdle).not.toHaveBeenCalled();
    });

    it('should use the configured network idle timeout', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn().mockResolvedValue(true),
        waitForNetworkIdle: rs.fn().mockResolvedValue(true),
        evaluate: rs.fn(),
      } as any;

      const page = new Page(mockPage, 'puppeteer', {
        waitForNetworkIdleTimeout: 4321,
      });
      await page.afterInvokeAction('testAction', {});

      expect(mockPage.waitForNetworkIdle).toHaveBeenCalledWith({
        idleTime: 200,
        concurrency: 2,
        timeout: 4321,
      });
    });

    it('should handle navigation timeout gracefully', async () => {
      const consoleWarnSpy = rs
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs
          .fn()
          .mockRejectedValue(new Error('Timeout waiting for selector')),
        waitForNetworkIdle: rs.fn().mockResolvedValue(true),
        evaluate: rs.fn(),
      } as any;

      const page = new Page(mockPage, 'puppeteer');

      // Should not throw error when navigation times out
      await expect(
        page.afterInvokeAction('testAction', {}),
      ).resolves.toBeUndefined();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Waiting for the "navigation" has timed out'),
      );

      consoleWarnSpy.mockRestore();
    });

    it('should handle network idle timeout gracefully', async () => {
      const consoleWarnSpy = rs
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn().mockResolvedValue(true),
        waitForNetworkIdle: rs
          .fn()
          .mockRejectedValue(new Error('Timeout waiting for network idle')),
        evaluate: rs.fn(),
      } as any;

      const page = new Page(mockPage, 'puppeteer');

      // Should not throw error when network idle times out
      await expect(
        page.afterInvokeAction('testAction', {}),
      ).resolves.toBeUndefined();

      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('Waiting for the "network idle" has timed out'),
      );

      consoleWarnSpy.mockRestore();
    });
  });

  describe('playwright interface', () => {
    it('should work with playwright interface in beforeInvokeAction', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn().mockResolvedValue(true),
        evaluate: rs.fn(),
      } as any;

      const page = new Page(mockPage, 'playwright');
      await page.beforeInvokeAction('testAction', {});

      // beforeInvokeAction no longer waits
      expect(mockPage.waitForSelector).not.toHaveBeenCalled();
    });

    it('should work with playwright interface in afterInvokeAction', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: rs.fn() },
        keyboard: { down: rs.fn(), up: rs.fn(), press: rs.fn(), type: rs.fn() },
        waitForSelector: rs.fn().mockResolvedValue(true),
        evaluate: rs.fn(),
      } as any;

      const page = new Page(mockPage, 'playwright');
      await page.afterInvokeAction('testAction', {});

      // Should call waitForSelector for playwright
      expect(mockPage.waitForSelector).toHaveBeenCalledWith('html', {
        timeout: 5000,
      });
    });
  });
});
