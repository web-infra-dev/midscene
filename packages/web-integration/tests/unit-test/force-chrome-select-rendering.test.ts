import { forceChromeSelectRendering } from '@/puppeteer/base-page';
import { describe, expect, it, vi } from 'vitest';

const createMockPage = () =>
  ({
    evaluate: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  }) as any;

describe('forceChromeSelectRendering', () => {
  it('injects the style and registers a single load listener per page', async () => {
    const page = createMockPage();

    forceChromeSelectRendering(page);
    // allow the immediate (async) injection to settle
    await Promise.resolve();

    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(page.on).toHaveBeenCalledTimes(1);
    expect(page.on).toHaveBeenCalledWith('load', expect.any(Function));
  });

  it('is a no-op when called again for the same page', async () => {
    const page = createMockPage();

    forceChromeSelectRendering(page);
    forceChromeSelectRendering(page);
    forceChromeSelectRendering(page);
    await Promise.resolve();

    // still only injected once and only one load listener attached
    expect(page.evaluate).toHaveBeenCalledTimes(1);
    expect(page.on).toHaveBeenCalledTimes(1);
  });

  it('wires up each distinct page independently', async () => {
    const pageA = createMockPage();
    const pageB = createMockPage();

    forceChromeSelectRendering(pageA);
    forceChromeSelectRendering(pageB);
    await Promise.resolve();

    expect(pageA.on).toHaveBeenCalledTimes(1);
    expect(pageB.on).toHaveBeenCalledTimes(1);
  });
});
