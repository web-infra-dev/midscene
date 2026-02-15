import { Page } from '@/puppeteer/base-page';
import { describe, expect, it, vi } from 'vitest';

// Mock necessary dependencies to avoid loading AI service dependencies
vi.mock('@midscene/shared/logger', () => ({
  getDebug: vi.fn(() => vi.fn()),
  logMsg: vi.fn(),
}));

vi.mock('@midscene/core/utils', async () => {
  const actual = await vi.importActual('@midscene/core/utils');
  return {
    ...actual,
    sleep: vi.fn(() => Promise.resolve()),
  };
});

vi.mock('@midscene/shared/node', () => ({
  getElementInfosScriptContent: vi.fn(() => ''),
  getExtraReturnLogic: vi.fn(() => Promise.resolve('() => ({})')),
}));

vi.mock('@/web-element', () => ({
  WebPageContextParser: vi.fn().mockResolvedValue({
    tree: { node: null, children: [] },
    shotSize: { width: 1024, height: 768 },
    screenshotBase64: 'mock-base64',
  }),
}));

vi.mock('@/web-page', () => ({
  commonWebActionsForWebPage: vi.fn(() => []),
}));

describe('Page - beforeInvokeAction and afterInvokeAction', () => {
  describe('beforeInvokeAction', () => {
    it('should call the beforeInvokeAction hook', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn().mockResolvedValue(true),
        waitForNetworkIdle: vi.fn().mockResolvedValue(true),
        evaluate: vi.fn(),
      } as any;

      const beforeHook = vi.fn();
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
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn().mockResolvedValue(true),
        waitForNetworkIdle: vi.fn().mockResolvedValue(true),
        evaluate: vi.fn(),
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
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => setTimeout(() => resolve(true), 100));
        }),
        waitForNetworkIdle: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => setTimeout(() => resolve(true), 100));
        }),
        evaluate: vi.fn(),
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
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn().mockResolvedValue(true),
        waitForNetworkIdle: vi.fn().mockResolvedValue(true),
        evaluate: vi.fn(),
      } as any;

      const callOrder: string[] = [];
      mockPage.waitForSelector = vi.fn().mockImplementation(() => {
        callOrder.push('waitForSelector');
        return Promise.resolve(true);
      });
      mockPage.waitForNetworkIdle = vi.fn().mockImplementation(() => {
        callOrder.push('waitForNetworkIdle');
        return Promise.resolve(true);
      });

      const beforeHook = vi.fn().mockImplementation(() => {
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
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn(),
        waitForNetworkIdle: vi.fn().mockResolvedValue(true),
        evaluate: vi.fn(),
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
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn().mockResolvedValue(true),
        waitForNetworkIdle: vi.fn().mockResolvedValue(true),
        evaluate: vi.fn(),
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
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn().mockResolvedValue(true),
        waitForNetworkIdle: vi.fn().mockResolvedValue(true),
        evaluate: vi.fn(),
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

    it('should wait for navigation and network idle sequentially', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => setTimeout(() => resolve(true), 100));
        }),
        waitForNetworkIdle: vi.fn().mockImplementation(() => {
          return new Promise((resolve) => setTimeout(() => resolve(true), 100));
        }),
        evaluate: vi.fn(),
      } as any;

      const page = new Page(mockPage, 'puppeteer');

      const startTime = Date.now();
      await page.afterInvokeAction('testAction', {});
      const duration = Date.now() - startTime;

      // Executed sequentially, should take ~200ms
      expect(duration).toBeGreaterThanOrEqual(180);
      expect(mockPage.waitForSelector).toHaveBeenCalledTimes(1);
      expect(mockPage.waitForNetworkIdle).toHaveBeenCalledTimes(1);
    });

    it('should call the afterInvokeAction hook after waiting', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn().mockResolvedValue(true),
        waitForNetworkIdle: vi.fn().mockResolvedValue(true),
        evaluate: vi.fn(),
      } as any;

      const callOrder: string[] = [];
      mockPage.waitForSelector = vi.fn().mockImplementation(() => {
        callOrder.push('waitForSelector');
        return Promise.resolve(true);
      });
      mockPage.waitForNetworkIdle = vi.fn().mockImplementation(() => {
        callOrder.push('waitForNetworkIdle');
        return Promise.resolve(true);
      });

      const afterHook = vi.fn().mockImplementation(() => {
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
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn(),
        waitForNetworkIdle: vi.fn().mockResolvedValue(true),
        evaluate: vi.fn(),
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
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn().mockResolvedValue(true),
        waitForNetworkIdle: vi.fn(),
        evaluate: vi.fn(),
      } as any;

      const page = new Page(mockPage, 'puppeteer', {
        waitForNetworkIdleTimeout: 0,
      });
      await page.afterInvokeAction('testAction', {});

      // waitForNetworkIdle should not be called when timeout is 0
      expect(mockPage.waitForNetworkIdle).not.toHaveBeenCalled();
    });

    it('should handle navigation timeout gracefully', async () => {
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi
          .fn()
          .mockRejectedValue(new Error('Timeout waiting for selector')),
        waitForNetworkIdle: vi.fn().mockResolvedValue(true),
        evaluate: vi.fn(),
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
      const consoleWarnSpy = vi
        .spyOn(console, 'warn')
        .mockImplementation(() => {});

      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn().mockResolvedValue(true),
        waitForNetworkIdle: vi
          .fn()
          .mockRejectedValue(new Error('Timeout waiting for network idle')),
        evaluate: vi.fn(),
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
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn().mockResolvedValue(true),
        evaluate: vi.fn(),
      } as any;

      const page = new Page(mockPage, 'playwright');
      await page.beforeInvokeAction('testAction', {});

      // beforeInvokeAction no longer waits
      expect(mockPage.waitForSelector).not.toHaveBeenCalled();
    });

    it('should work with playwright interface in afterInvokeAction', async () => {
      const mockPage = {
        url: () => 'http://example.com',
        mouse: { move: vi.fn() },
        keyboard: { down: vi.fn(), up: vi.fn(), press: vi.fn(), type: vi.fn() },
        waitForSelector: vi.fn().mockResolvedValue(true),
        evaluate: vi.fn(),
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
