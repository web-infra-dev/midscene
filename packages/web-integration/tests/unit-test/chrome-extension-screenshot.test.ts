import { describe, expect, it, vi } from 'vitest';
import { captureChromeExtensionScreenshot } from '../../src/chrome-extension/screenshot';

describe('Chrome extension screenshot format', () => {
  it('captures WebP at quality 90 by default', async () => {
    const sendCaptureCommand = vi
      .fn()
      .mockResolvedValue({ data: 'SCREENSHOT_BASE64' });

    await expect(
      captureChromeExtensionScreenshot(sendCaptureCommand),
    ).resolves.toBe('data:image/webp;base64,SCREENSHOT_BASE64');
    expect(sendCaptureCommand).toHaveBeenCalledWith({
      format: 'webp',
      quality: 90,
    });
  });

  it('allows an explicit JPEG fallback', async () => {
    const sendCaptureCommand = vi
      .fn()
      .mockResolvedValue({ data: 'SCREENSHOT_BASE64' });

    await expect(
      captureChromeExtensionScreenshot(sendCaptureCommand, 'jpeg'),
    ).resolves.toBe('data:image/jpeg;base64,SCREENSHOT_BASE64');
    expect(sendCaptureCommand).toHaveBeenCalledWith({
      format: 'jpeg',
      quality: 90,
    });
  });
});
