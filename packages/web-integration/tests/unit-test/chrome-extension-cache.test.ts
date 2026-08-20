import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock chrome API
vi.stubGlobal('chrome', {
  tabs: {
    update: vi.fn(),
  },
  debugger: {
    attach: vi.fn(),
    detach: vi.fn(),
    sendCommand: vi.fn(),
  },
});

// Mock dependencies
vi.mock('@midscene/core/ai-model', () => ({
  AiJudgeOrderSensitive: vi.fn(),
}));

vi.mock('@midscene/shared/logger', () => ({
  getDebug: vi.fn(() => vi.fn()),
}));

vi.mock('../../src/chrome-extension/dynamic-scripts', () => ({
  getHtmlElementScript: vi.fn().mockResolvedValue(''),
}));

import { AiJudgeOrderSensitive } from '@midscene/core/ai-model';
import ChromeExtensionProxyPage from '../../src/chrome-extension/page';

describe('ChromeExtensionProxyPage cache methods', () => {
  let page: ChromeExtensionProxyPage;

  beforeEach(() => {
    vi.clearAllMocks();
    page = new ChromeExtensionProxyPage(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('cacheFeatureForPoint', () => {
    it('should return locator targets for a valid point', async () => {
      const mockXpaths = ['/html/body/div[1]', '/html/body/div[1]/button[1]'];
      vi.spyOn(page, 'getXpathsByPoint').mockResolvedValue(mockXpaths);

      const result = await page.cacheFeatureForPoint([100, 200]);

      expect(result).toEqual({
        targets: mockXpaths.map((selector) => ({
          strategy: 'xpath',
          selector,
        })),
      });
      expect(page.getXpathsByPoint).toHaveBeenCalledWith(
        { left: 100, top: 200 },
        false,
      );
    });

    it('should filter out invalid xpaths', async () => {
      const mockXpaths = [
        '/valid/xpath',
        '',
        null,
        undefined,
        123,
        '/another/valid',
      ];
      vi.spyOn(page, 'getXpathsByPoint').mockResolvedValue(mockXpaths as any);

      const result = await page.cacheFeatureForPoint([50, 50]);

      expect(result).toEqual({
        targets: [
          { strategy: 'xpath', selector: '/valid/xpath' },
          { strategy: 'xpath', selector: '/another/valid' },
        ],
      });
    });

    it('should return empty targets when getXpathsByPoint fails', async () => {
      vi.spyOn(page, 'getXpathsByPoint').mockRejectedValue(
        new Error('CDP error'),
      );

      const result = await page.cacheFeatureForPoint([100, 200]);

      expect(result).toEqual({ targets: [] });
    });

    it('should call AiJudgeOrderSensitive when targetDescription and modelRuntime are provided', async () => {
      const mockXpaths = ['/html/body/div[1]'];
      vi.spyOn(page, 'getXpathsByPoint').mockResolvedValue(mockXpaths);
      vi.mocked(AiJudgeOrderSensitive).mockResolvedValue({
        isOrderSensitive: true,
      });

      const modelRuntime = {
        config: { modelName: 'test-model' },
        adapter: {},
      } as any;
      await page.cacheFeatureForPoint([100, 200], {
        targetDescription: 'Click the submit button',
        modelRuntime,
      });

      expect(AiJudgeOrderSensitive).toHaveBeenCalledWith(
        'Click the submit button',
        modelRuntime,
      );
      expect(page.getXpathsByPoint).toHaveBeenCalledWith(
        { left: 100, top: 200 },
        true,
      );
    });

    it('should fall back to isOrderSensitive=false when AiJudgeOrderSensitive fails', async () => {
      const mockXpaths = ['/html/body/div[1]'];
      vi.spyOn(page, 'getXpathsByPoint').mockResolvedValue(mockXpaths);
      vi.mocked(AiJudgeOrderSensitive).mockRejectedValue(new Error('AI error'));

      await page.cacheFeatureForPoint([100, 200], {
        targetDescription: 'Click the submit button',
        modelRuntime: {
          config: { modelName: 'test-model' },
          adapter: {},
        } as any,
      });

      expect(page.getXpathsByPoint).toHaveBeenCalledWith(
        { left: 100, top: 200 },
        false,
      );
    });

    it('should handle non-array response from getXpathsByPoint', async () => {
      vi.spyOn(page, 'getXpathsByPoint').mockResolvedValue(null as any);

      const result = await page.cacheFeatureForPoint([100, 200]);

      expect(result).toEqual({ targets: [] });
    });
  });

  describe('rectMatchesCacheFeature', () => {
    it('should return rect when a target resolves', async () => {
      vi.spyOn(page, 'resolveLocatorTarget').mockResolvedValue({
        left: 10,
        top: 20,
        width: 100,
        height: 50,
      });

      const result = await page.rectMatchesCacheFeature({
        targets: [{ strategy: 'xpath', selector: '/html/body/button[1]' }],
      });

      expect(result).toEqual({
        left: 10,
        top: 20,
        width: 100,
        height: 50,
      });
    });

    it('should try multiple targets and return the first match', async () => {
      vi.spyOn(page, 'resolveLocatorTarget')
        .mockRejectedValueOnce(new Error('not found'))
        .mockResolvedValueOnce({ left: 5, top: 10, width: 50, height: 25 });

      const result = await page.rectMatchesCacheFeature({
        targets: [
          { strategy: 'xpath', selector: '/invalid/xpath' },
          { strategy: 'xpath', selector: '/valid/xpath' },
        ],
      });

      expect(result).toEqual({
        left: 5,
        top: 10,
        width: 50,
        height: 25,
      });
      expect(page.resolveLocatorTarget).toHaveBeenCalledTimes(2);
    });

    it('should throw error when no target matches', async () => {
      vi.spyOn(page, 'resolveLocatorTarget').mockRejectedValue(
        new Error('not found'),
      );

      await expect(
        page.rectMatchesCacheFeature({
          targets: [
            { strategy: 'xpath', selector: '/xpath1' },
            { strategy: 'xpath', selector: '/xpath2' },
          ],
        }),
      ).rejects.toThrow(
        'No matching element rect found for cache feature (tried 2 target(s))',
      );
    });

    it('should handle target lookup errors gracefully', async () => {
      vi.spyOn(page, 'resolveLocatorTarget')
        .mockRejectedValueOnce(new Error('Lookup error'))
        .mockResolvedValueOnce({ left: 1, top: 2, width: 3, height: 4 });

      const result = await page.rectMatchesCacheFeature({
        targets: [
          { strategy: 'xpath', selector: '/error/xpath' },
          { strategy: 'xpath', selector: '/valid/xpath' },
        ],
      });

      expect(result).toEqual({
        left: 1,
        top: 2,
        width: 3,
        height: 4,
      });
    });

    it('should read legacy xpaths and filter invalid entries', async () => {
      vi.spyOn(page, 'resolveLocatorTarget').mockResolvedValue({
        left: 0,
        top: 0,
        width: 10,
        height: 10,
      });

      const feature = {
        xpaths: ['', null, '/valid/xpath', undefined, 123] as any,
      };

      await page.rectMatchesCacheFeature(feature);

      expect(page.resolveLocatorTarget).toHaveBeenCalledTimes(1);
      expect(page.resolveLocatorTarget).toHaveBeenCalledWith({
        strategy: 'xpath',
        selector: '/valid/xpath',
      });
    });

    it('should fall back to legacy xpaths when targets contain no valid entry', async () => {
      vi.spyOn(page, 'resolveLocatorTarget').mockResolvedValue({
        left: 0,
        top: 0,
        width: 10,
        height: 10,
      });

      await page.rectMatchesCacheFeature({
        targets: [{ strategy: 'xpath', selector: '' }] as any,
        xpaths: ['/legacy/valid/xpath'],
      });

      expect(page.resolveLocatorTarget).toHaveBeenCalledOnce();
      expect(page.resolveLocatorTarget).toHaveBeenCalledWith({
        strategy: 'xpath',
        selector: '/legacy/valid/xpath',
      });
    });

    it('should throw error for empty xpaths array', async () => {
      await expect(
        page.rectMatchesCacheFeature({ xpaths: [] }),
      ).rejects.toThrow(
        'No matching element rect found for cache feature (tried 0 target(s))',
      );
    });

    it('should throw error when xpaths is not an array', async () => {
      await expect(
        page.rectMatchesCacheFeature({ xpaths: 'invalid' } as any),
      ).rejects.toThrow(
        'No matching element rect found for cache feature (tried 0 target(s))',
      );
    });
  });

  describe('locator targets', () => {
    it('probes XPath existence without invoking the execution resolver', async () => {
      const sendCommand = vi
        .spyOn(page as any, 'sendCommandToDebugger')
        .mockResolvedValue({ result: { value: [true] } });
      const resolveSpy = vi.spyOn(page, 'resolveLocatorTarget');

      await expect(
        page.probeLocatorTargets([
          {
            strategy: 'xpath',
            selector: '//button[@id="confirm"]',
          },
        ]),
      ).resolves.toEqual([true]);
      expect(resolveSpy).not.toHaveBeenCalled();
      const evaluateOptions = sendCommand.mock.calls[1][1] as {
        expression: string;
      };
      expect(evaluateOptions.expression).toContain('getNodeCountByXpath');
      expect(evaluateOptions.expression).not.toContain('scrollIntoView');
    });

    it('uses the execution resolver only when the target is selected', async () => {
      const sendCommand = vi
        .spyOn(page as any, 'sendCommandToDebugger')
        .mockResolvedValue({
          result: {
            value: {
              rect: { left: 10, top: 20, width: 100, height: 50 },
            },
          },
        });

      await expect(
        page.resolveLocatorTarget({
          strategy: 'xpath',
          selector: '//button[@id="confirm"]',
        }),
      ).resolves.toEqual({ left: 10, top: 20, width: 100, height: 50 });
      const evaluateOptions = sendCommand.mock.calls[1][1] as {
        expression: string;
      };
      expect(evaluateOptions.expression).toContain('getElementInfoByXpath');
      expect(evaluateOptions.expression).toContain(
        '//button[@id=\\"confirm\\"]',
      );
    });

    it('rejects an invalid execution rect so callers can fall back', async () => {
      vi.spyOn(page as any, 'sendCommandToDebugger').mockResolvedValue({
        result: {
          value: {
            rect: { left: 10, top: 20, width: 0, height: 50 },
          },
        },
      });

      await expect(
        page.resolveLocatorTarget({
          strategy: 'xpath',
          selector: '//button[@id="confirm"]',
        }),
      ).rejects.toThrow('Element info contains an invalid rect');
    });
  });
});
