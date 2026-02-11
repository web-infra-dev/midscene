import { existsSync } from 'node:fs';
import { readFile, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { puppeteerBrowserManager } from '@/session';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
  unlink: vi.fn(),
}));

vi.mock('puppeteer', () => {
  const mockBrowser = {
    close: vi.fn(),
    disconnect: vi.fn(),
    pages: vi.fn().mockResolvedValue([]),
  };
  return {
    default: {
      connect: vi.fn().mockResolvedValue(mockBrowser),
      executablePath: vi.fn().mockReturnValue('/usr/bin/chrome'),
    },
  };
});

describe('puppeteerBrowserManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    puppeteerBrowserManager.activeBrowser = null;
  });

  describe('hasActiveSession', () => {
    test('should return true when endpoint file exists', () => {
      vi.mocked(existsSync).mockReturnValue(true);
      expect(puppeteerBrowserManager.hasActiveSession()).toBe(true);
    });

    test('should return false when endpoint file does not exist', () => {
      vi.mocked(existsSync).mockReturnValue(false);
      expect(puppeteerBrowserManager.hasActiveSession()).toBe(false);
    });
  });

  describe('endpointFile', () => {
    test('should be in tmpdir', () => {
      expect(puppeteerBrowserManager.endpointFile).toBe(
        join(tmpdir(), 'midscene-puppeteer-endpoint'),
      );
    });
  });

  describe('getOrLaunch', () => {
    test('should reconnect to existing browser when endpoint file exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue('ws://127.0.0.1:9222/devtools');

      const puppeteer = (await import('puppeteer')).default;
      const result = await puppeteerBrowserManager.getOrLaunch();

      expect(puppeteer.connect).toHaveBeenCalledWith({
        browserWSEndpoint: 'ws://127.0.0.1:9222/devtools',
        defaultViewport: null,
      });
      expect(result.reused).toBe(true);
    });
  });

  describe('closeBrowser', () => {
    test('should do nothing when no endpoint file exists', async () => {
      vi.mocked(existsSync).mockReturnValue(false);
      await puppeteerBrowserManager.closeBrowser();
      const puppeteer = (await import('puppeteer')).default;
      expect(puppeteer.connect).not.toHaveBeenCalled();
    });

    test('should connect and close browser when endpoint exists', async () => {
      vi.mocked(existsSync).mockReturnValue(true);
      vi.mocked(readFile).mockResolvedValue('ws://127.0.0.1:9222/devtools');

      const puppeteer = (await import('puppeteer')).default;
      await puppeteerBrowserManager.closeBrowser();

      expect(puppeteer.connect).toHaveBeenCalledWith({
        browserWSEndpoint: 'ws://127.0.0.1:9222/devtools',
      });
      const mockBrowser = await puppeteer.connect({} as any);
      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });

  describe('disconnect', () => {
    test('should disconnect active browser', () => {
      const mockBrowser = { disconnect: vi.fn() } as any;
      puppeteerBrowserManager.activeBrowser = mockBrowser;

      puppeteerBrowserManager.disconnect();

      expect(mockBrowser.disconnect).toHaveBeenCalled();
      expect(puppeteerBrowserManager.activeBrowser).toBeNull();
    });

    test('should do nothing when no active browser', () => {
      puppeteerBrowserManager.activeBrowser = null;
      puppeteerBrowserManager.disconnect(); // should not throw
    });
  });
});
