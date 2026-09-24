import { captureDeviceScreenshot } from '@/device';
import { EncodedImage } from '@midscene/shared/img';
import { describe, expect, it, rs } from '@rstest/core';

const png =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQqbiDFTEMpAQAorNDgTX/VEoAAAAASUVORK5CYII=';

describe('device screenshot compatibility boundary', () => {
  it('prefers byte-native capture without calling the Base64 adapter', async () => {
    const image = EncodedImage.fromBase64(png);
    const device = {
      screenshot: rs.fn(async () => image),
      screenshotBase64: rs.fn(),
    };
    const result = await captureDeviceScreenshot(device);
    expect(result.bytes).toBe(image.bytes);
    expect(device.screenshotBase64).not.toHaveBeenCalled();
  });
  it('supports existing adapters with only screenshotBase64', async () => {
    expect(
      (
        await captureDeviceScreenshot({ screenshotBase64: async () => png })
      ).toBase64(),
    ).toBe(png);
  });
  it('rejects a native format mismatch instead of falling back silently', async () => {
    const legacy = rs.fn();
    await expect(
      captureDeviceScreenshot({
        screenshot: async () => ({
          bytes: EncodedImage.fromBase64(png).bytes,
          format: 'jpeg',
        }),
        screenshotBase64: legacy,
      }),
    ).rejects.toThrow(/declares/);
    expect(legacy).not.toHaveBeenCalled();
  });
});
