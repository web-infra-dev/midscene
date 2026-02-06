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
  callAIWithObjectResponse: vi.fn(),
}));

vi.mock('@midscene/shared/logger', () => ({
  getDebug: vi.fn(() => vi.fn()),
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
    it('should return xpaths for a valid point', async () => {
      const mockXpaths = ['/html/body/div[1]', '/html/body/div[1]/button[1]'];
      vi.spyOn(page, 'getXpathsByPoint').mockResolvedValue(mockXpaths);

      const result = await page.cacheFeatureForPoint([100, 200]);

      expect(result).toEqual({ xpaths: mockXpaths });
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

      expect(result).toEqual({ xpaths: ['/valid/xpath', '/another/valid'] });
    });

    it('should return empty xpaths when getXpathsByPoint fails', async () => {
      vi.spyOn(page, 'getXpathsByPoint').mockRejectedValue(
        new Error('CDP error'),
      );

      const result = await page.cacheFeatureForPoint([100, 200]);

      expect(result).toEqual({ xpaths: [] });
    });

    it('should call AiJudgeOrderSensitive when targetDescription and modelConfig are provided', async () => {
      const mockXpaths = ['/html/body/div[1]'];
      vi.spyOn(page, 'getXpathsByPoint').mockResolvedValue(mockXpaths);
      vi.mocked(AiJudgeOrderSensitive).mockResolvedValue({
        isOrderSensitive: true,
      });

      const modelConfig = { modelName: 'test-model' } as any;
      await page.cacheFeatureForPoint([100, 200], {
        targetDescription: 'Click the submit button',
        modelConfig,
      });

      expect(AiJudgeOrderSensitive).toHaveBeenCalledWith(
        'Click the submit button',
        expect.any(Function),
        modelConfig,
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
        modelConfig: { modelName: 'test-model' } as any,
      });

      expect(page.getXpathsByPoint).toHaveBeenCalledWith(
        { left: 100, top: 200 },
        false,
      );
    });

    it('should handle non-array response from getXpathsByPoint', async () => {
      vi.spyOn(page, 'getXpathsByPoint').mockResolvedValue(null as any);

      const result = await page.cacheFeatureForPoint([100, 200]);

      expect(result).toEqual({ xpaths: [] });
    });
  });

  describe('rectMatchesCacheFeature', () => {
    it('should return rect when xpath matches an element', async () => {
      const mockElementInfo = {
        rect: { left: 10, top: 20, width: 100, height: 50 },
      };
      vi.spyOn(page, 'getElementInfoByXpath').mockResolvedValue(
        mockElementInfo as any,
      );

      const result = await page.rectMatchesCacheFeature({
        xpaths: ['/html/body/button[1]'],
      });

      expect(result).toEqual({
        left: 10,
        top: 20,
        width: 100,
        height: 50,
      });
    });

    it('should include dpr when viewportSize has dpr', async () => {
      const mockElementInfo = {
        rect: { left: 10, top: 20, width: 100, height: 50 },
      };
      vi.spyOn(page, 'getElementInfoByXpath').mockResolvedValue(
        mockElementInfo as any,
      );
      // Set viewportSize with dpr
      (page as any).viewportSize = { width: 1920, height: 1080, dpr: 2 };

      const result = await page.rectMatchesCacheFeature({
        xpaths: ['/html/body/button[1]'],
      });

      expect(result).toEqual({
        left: 10,
        top: 20,
        width: 100,
        height: 50,
        dpr: 2,
      });
    });

    it('should try multiple xpaths and return first match', async () => {
      vi.spyOn(page, 'getElementInfoByXpath')
        .mockResolvedValueOnce(null as any) // First xpath fails
        .mockResolvedValueOnce({
          rect: { left: 5, top: 10, width: 50, height: 25 },
        } as any);

      const result = await page.rectMatchesCacheFeature({
        xpaths: ['/invalid/xpath', '/valid/xpath'],
      });

      expect(result).toEqual({
        left: 5,
        top: 10,
        width: 50,
        height: 25,
      });
      expect(page.getElementInfoByXpath).toHaveBeenCalledTimes(2);
    });

    it('should throw error when no xpath matches', async () => {
      vi.spyOn(page, 'getElementInfoByXpath').mockResolvedValue(null as any);

      await expect(
        page.rectMatchesCacheFeature({
          xpaths: ['/xpath1', '/xpath2'],
        }),
      ).rejects.toThrow(
        'No matching element rect found for cache feature (tried 2 xpath(s))',
      );
    });

    it('should handle xpath lookup errors gracefully', async () => {
      vi.spyOn(page, 'getElementInfoByXpath')
        .mockRejectedValueOnce(new Error('Lookup error'))
        .mockResolvedValueOnce({
          rect: { left: 1, top: 2, width: 3, height: 4 },
        } as any);

      const result = await page.rectMatchesCacheFeature({
        xpaths: ['/error/xpath', '/valid/xpath'],
      });

      expect(result).toEqual({
        left: 1,
        top: 2,
        width: 3,
        height: 4,
      });
    });

    it('should filter out invalid xpaths before processing', async () => {
      vi.spyOn(page, 'getElementInfoByXpath').mockResolvedValue({
        rect: { left: 0, top: 0, width: 10, height: 10 },
      } as any);

      const feature = {
        xpaths: ['', null, '/valid/xpath', undefined, 123] as any,
      };

      await page.rectMatchesCacheFeature(feature);

      expect(page.getElementInfoByXpath).toHaveBeenCalledTimes(1);
      expect(page.getElementInfoByXpath).toHaveBeenCalledWith('/valid/xpath');
    });

    it('should throw error for empty xpaths array', async () => {
      await expect(
        page.rectMatchesCacheFeature({ xpaths: [] }),
      ).rejects.toThrow(
        'No matching element rect found for cache feature (tried 0 xpath(s))',
      );
    });

    it('should throw error when xpaths is not an array', async () => {
      await expect(
        page.rectMatchesCacheFeature({ xpaths: 'invalid' } as any),
      ).rejects.toThrow(
        'No matching element rect found for cache feature (tried 0 xpath(s))',
      );
    });
  });
});
