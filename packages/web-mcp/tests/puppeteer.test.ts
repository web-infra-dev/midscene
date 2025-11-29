import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { ensureBrowser } from '../src/puppeteer';

// Mock external dependencies
vi.mock('puppeteer-core', () => ({
  default: {
    launch: vi.fn(),
  },
}));

vi.mock('@midscene/web/puppeteer', () => ({
  PuppeteerAgent: vi.fn(),
}));

vi.mock('../src/utils', () => ({
  deepMerge: vi.fn((target, source) => ({ ...target, ...source })),
  getChromePathFromEnv: vi.fn(() => '/mock/chrome/path'),
}));

// Mock browser and page objects
const mockPage = {
  evaluate: vi.fn(),
  navigate: vi.fn(),
  url: vi.fn(() => 'https://example.com'),
  title: vi.fn().mockResolvedValue('Test Page'),
  mainFrame: vi.fn(() => ({ _id: 'frame-123' })),
  bringToFront: vi.fn(),
};

const mockBrowser = {
  connected: true,
  close: vi.fn(),
  pages: vi.fn().mockResolvedValue([mockPage]),
  newPage: vi.fn().mockResolvedValue(mockPage),
} as any;

describe('Puppeteer Module', () => {
  let consoleWarnSpy: any;

  beforeEach(() => {
    vi.clearAllMocks();
    // Mock console.warn to suppress expected error messages in tests
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Reset environment
    process.env.DOCKER_CONTAINER = undefined;
    process.env.PUPPETEER_LAUNCH_OPTIONS = undefined;
    process.env.ALLOW_DANGEROUS = undefined;
  });

  afterEach(() => {
    consoleWarnSpy?.mockRestore();
  });

  describe('ensureBrowser', () => {
    test('should launch browser with default options', async () => {
      const puppeteer = await import('puppeteer-core');
      vi.mocked(puppeteer.default.launch).mockResolvedValue(mockBrowser);
      mockBrowser.pages.mockResolvedValue([mockPage]);

      const result = await ensureBrowser({});

      expect(puppeteer.default.launch).toHaveBeenCalled();
      expect(result.browser).toBe(mockBrowser);
      expect(result.pages).toEqual([mockPage]);
    });

    test('should use Docker options when in Docker container', async () => {
      process.env.DOCKER_CONTAINER = 'true';
      const puppeteer = await import('puppeteer-core');
      vi.mocked(puppeteer.default.launch).mockResolvedValue(mockBrowser);

      await ensureBrowser({});

      expect(puppeteer.default.launch).toHaveBeenCalled();
      const launchCall = vi.mocked(puppeteer.default.launch).mock.calls[0]?.[0];
      expect(launchCall?.headless).toBe(true);
      expect(launchCall?.args).toContain('--no-sandbox');
    });

    test('should handle invalid JSON in environment options', async () => {
      process.env.PUPPETEER_LAUNCH_OPTIONS = 'invalid json';
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const puppeteer = await import('puppeteer-core');
      vi.mocked(puppeteer.default.launch).mockResolvedValue(mockBrowser);

      await ensureBrowser({});

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to parse PUPPETEER_LAUNCH_OPTIONS:',
        expect.any(String),
      );
      consoleSpy.mockRestore();
    });

    test('should throw error for dangerous args without permission', async () => {
      const launchOptions = {
        args: ['--no-sandbox', '--disable-web-security'],
      };

      await expect(ensureBrowser({ launchOptions })).rejects.toThrow(
        'Dangerous browser arguments detected',
      );
    });

    test('should allow dangerous args with allowDangerous flag', async () => {
      const launchOptions = {
        args: ['--no-sandbox', '--disable-web-security'],
      };
      const puppeteer = await import('puppeteer-core');
      vi.mocked(puppeteer.default.launch).mockResolvedValue(mockBrowser);

      await ensureBrowser({ launchOptions, allowDangerous: true });

      expect(puppeteer.default.launch).toHaveBeenCalled();
    });

    test('should reuse existing connected browser', async () => {
      const puppeteer = await import('puppeteer-core');
      vi.mocked(puppeteer.default.launch).mockResolvedValue(mockBrowser);

      // First call
      await ensureBrowser({});
      // Second call with same options
      await ensureBrowser({});

      expect(puppeteer.default.launch).toHaveBeenCalledTimes(1);
    });

    test('should handle environment chrome path configuration', async () => {
      const { getChromePathFromEnv } = await import('../src/utils');
      vi.mocked(getChromePathFromEnv).mockReturnValue('/custom/chrome');

      const puppeteer = await import('puppeteer-core');
      vi.mocked(puppeteer.default.launch).mockResolvedValue(mockBrowser);

      await ensureBrowser({});

      expect(puppeteer.default.launch).toHaveBeenCalled();
      const launchCall = vi.mocked(puppeteer.default.launch).mock.calls[0]?.[0];
      expect(launchCall?.executablePath).toBe('/custom/chrome');
    });

    test('should call deepMerge for configuration merging', async () => {
      const { deepMerge } = await import('../src/utils');
      const puppeteer = await import('puppeteer-core');
      vi.mocked(puppeteer.default.launch).mockResolvedValue(mockBrowser);

      const customOptions = { headless: false };
      const result = await ensureBrowser({ launchOptions: customOptions });

      // deepMerge should be called during configuration processing
      expect(deepMerge).toHaveBeenCalled();
      expect(result.browser).toBeDefined();
    });

    test('should validate dangerous arguments', async () => {
      const dangerousOptions = {
        args: ['--disable-web-security', '--ignore-certificate-errors'],
      };

      await expect(
        ensureBrowser({ launchOptions: dangerousOptions }),
      ).rejects.toThrow('Dangerous browser arguments detected');
    });

    test('should use environment ALLOW_DANGEROUS flag', async () => {
      process.env.ALLOW_DANGEROUS = 'true';
      const dangerousOptions = {
        args: ['--no-sandbox'],
      };
      const puppeteer = await import('puppeteer-core');
      vi.mocked(puppeteer.default.launch).mockResolvedValue(mockBrowser);

      await expect(
        ensureBrowser({ launchOptions: dangerousOptions }),
      ).resolves.not.toThrow();

      expect(puppeteer.default.launch).toHaveBeenCalled();
    });
  });
});
