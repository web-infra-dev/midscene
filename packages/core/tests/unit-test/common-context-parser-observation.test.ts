import { commonContextParser } from '@/agent/utils';
import type { AbstractInterface } from '@/device';
import { imageInfoOfBase64 } from '@midscene/shared/img';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('@midscene/shared/img', () => ({
  createImgBase64ByFormat: rs.fn(),
  imageInfoOfBase64: rs.fn(),
  resizeBase64ImageToJpeg: rs.fn().mockResolvedValue('resized-image'),
}));

describe('paired screenshot observation', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });
  const fixture = () => ({
    interfaceType: 'test',
    actionSpace: () => [],
    size: rs.fn().mockResolvedValue({ width: 1440, height: 1000 }),
    screenshotBase64: rs.fn().mockResolvedValue('legacy-image'),
    screenshotWithSize: rs.fn().mockResolvedValue({
      size: { width: 800, height: 600 },
      screenshotBase64: 'paired-image',
    }),
  });

  it('uses the paired logical size without stale or duplicate reads', async () => {
    const device = fixture();
    rs.mocked(imageInfoOfBase64).mockResolvedValue({
      width: 1600,
      height: 1200,
    });
    const context = await commonContextParser(device, {
      screenshotShrinkFactor: 2,
    });
    expect(context.deprecatedDpr).toBe(2);
    expect(context.shrunkShotToLogicalRatio).toBe(1);
    expect(device.screenshotWithSize).toHaveBeenCalledOnce();
    expect(device.size).not.toHaveBeenCalled();
    expect(device.screenshotBase64).not.toHaveBeenCalled();
    expect(imageInfoOfBase64).toHaveBeenCalledWith('paired-image');
  });

  it('retains the existing size-then-screenshot path for other adapters', async () => {
    const { screenshotWithSize: _, ...device } = fixture();
    rs.mocked(imageInfoOfBase64).mockResolvedValue({
      width: 1440,
      height: 1000,
    });
    const context = await commonContextParser(device, {});
    expect(context.shrunkShotToLogicalRatio).toBe(1);
    expect(device.size).toHaveBeenCalledOnce();
    expect(device.screenshotBase64).toHaveBeenCalledOnce();
    expect(device.size.mock.invocationCallOrder[0]).toBeLessThan(
      device.screenshotBase64.mock.invocationCallOrder[0],
    );
  });

  it('propagates a failed observation without falling back to unsafe coordinates', async () => {
    const device = fixture();
    device.screenshotWithSize.mockRejectedValue(new Error('viewport changed'));
    await expect(
      commonContextParser(device as AbstractInterface, {}),
    ).rejects.toThrow('viewport changed');
    expect(device.screenshotBase64).not.toHaveBeenCalled();
    expect(imageInfoOfBase64).not.toHaveBeenCalled();
  });
});
