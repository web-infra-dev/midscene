import { forceChromeSelectRendering } from '@/puppeteer/base-page';
import { describe, expect, it, vi } from 'vitest';

describe('forceChromeSelectRendering', () => {
  it('should work with Puppeteer-style page (multiple arguments support)', async () => {
    const evaluateFunc = vi.fn().mockResolvedValue(undefined);
    const mockPuppeteerPage = {
      evaluate: evaluateFunc,
      on: vi.fn(),
    } as any;

    forceChromeSelectRendering(mockPuppeteerPage);

    // Wait for evaluate to be called
    await vi.waitFor(() => {
      expect(evaluateFunc).toHaveBeenCalledTimes(1);
    });

    const [func, args] = evaluateFunc.mock.calls[0];
    expect(typeof func).toBe('function');
    expect(args).toEqual({
      id: 'midscene-force-select-rendering',
      content: expect.stringContaining('appearance: base-select'),
    });
  });

  it('should work with Playwright-style page (object argument)', async () => {
    const evaluateFunc = vi.fn().mockResolvedValue(undefined);
    const mockPlaywrightPage = {
      evaluate: evaluateFunc,
      on: vi.fn(),
    } as any;

    forceChromeSelectRendering(mockPlaywrightPage);

    // Wait for evaluate to be called
    await vi.waitFor(() => {
      expect(evaluateFunc).toHaveBeenCalledTimes(1);
    });

    const [func, args] = evaluateFunc.mock.calls[0];
    expect(typeof func).toBe('function');
    // Verify arguments are passed as a single object
    expect(args).toEqual({
      id: 'midscene-force-select-rendering',
      content: expect.stringContaining('appearance: base-select'),
    });
  });

  it('should handle evaluate errors gracefully', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const evaluateFunc = vi
      .fn()
      .mockRejectedValue(new Error('Evaluation failed'));
    const mockPage = {
      evaluate: evaluateFunc,
      on: vi.fn(),
    } as any;

    forceChromeSelectRendering(mockPage);

    // Wait for evaluate to be called and console.log to be invoked
    await vi.waitFor(() => {
      expect(evaluateFunc).toHaveBeenCalledTimes(1);
      expect(consoleLogSpy).toHaveBeenCalledWith(
        'Midscene - Failed to add base-select appearance style:',
        expect.any(Error),
      );
    });

    consoleLogSpy.mockRestore();
  });

  it('should register load event handler', () => {
    const onFunc = vi.fn();
    const mockPage = {
      evaluate: vi.fn().mockResolvedValue(undefined),
      on: onFunc,
    } as any;

    forceChromeSelectRendering(mockPage);

    expect(onFunc).toHaveBeenCalledWith('load', expect.any(Function));
  });
});
