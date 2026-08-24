import { AlertVirtualSurface } from '@/puppeteer/alert-virtual-surface';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { describe, expect, it, vi } from 'vitest';

describe('AlertVirtualSurface', () => {
  it('renders a full viewport JPEG without requiring an element tree', async () => {
    const surface = new AlertVirtualSurface('Alert blocking fixture', {
      width: 640,
      height: 480,
    });

    const screenshot = await surface.screenshotBase64();

    expect(screenshot).toMatch(/^data:image\/jpeg;base64,/);
    await expect(imageInfoOfBase64(screenshot)).resolves.toEqual({
      width: 640,
      height: 480,
    });
    await expect(surface.getElementsNodeTree()).resolves.toEqual({
      node: null,
      children: [],
    });
    expect(surface.confirmRect.top).toBeLessThan(200);
  });

  it('accepts only a left click inside the OK button hot area', async () => {
    const surface = new AlertVirtualSurface('Alert blocking fixture', {
      width: 640,
      height: 480,
    });
    const decision = vi.fn();
    void surface.waitForDecision().then(decision);

    await surface.dispatchAction({
      type: 'mouse.click',
      x: 10,
      y: 10,
      button: 'left',
      count: 1,
    });
    expect(decision).not.toHaveBeenCalled();

    await surface.dispatchAction({
      type: 'mouse.click',
      x: surface.confirmRect.left + surface.confirmRect.width / 2,
      y: surface.confirmRect.top + surface.confirmRect.height / 2,
      button: 'left',
      count: 1,
    });

    await expect(surface.waitForDecision()).resolves.toEqual({
      type: 'accept',
    });
    expect(decision).toHaveBeenCalledTimes(1);
  });
});
