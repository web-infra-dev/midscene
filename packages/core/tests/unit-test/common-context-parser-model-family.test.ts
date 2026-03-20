import { commonContextParser } from '@/agent/utils';
import type { AbstractInterface } from '@/device';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/shared/img', () => ({
  imageInfoOfBase64: vi.fn(),
  resizeImgBase64: vi.fn().mockResolvedValue('mock-resized-base64-data'),
}));

import { imageInfoOfBase64, resizeImgBase64 } from '@midscene/shared/img';

const mockedImageInfo = vi.mocked(imageInfoOfBase64);
const mockedResizeImg = vi.mocked(resizeImgBase64);

function createMockInterface(
  logicalWidth: number,
  logicalHeight: number,
): AbstractInterface {
  return {
    screenshotBase64: vi.fn().mockResolvedValue('mock-base64-data'),
    size: vi
      .fn()
      .mockResolvedValue({ width: logicalWidth, height: logicalHeight }),
    actionSpace: vi.fn(() => []),
    describe: vi.fn(() => ''),
  } as unknown as AbstractInterface;
}

describe('commonContextParser modelFamily-based auto shrink', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('does not auto-shrink large screenshots for gpt-5', async () => {
    const mockInterface = createMockInterface(800, 400);
    mockedImageInfo.mockResolvedValue({ width: 2400, height: 1200 });

    const result = await commonContextParser(mockInterface, {
      modelFamily: 'gpt-5',
    });

    expect(mockedResizeImg).not.toHaveBeenCalled();
    expect(result.shotSize).toEqual({ width: 2400, height: 1200 });
  });

  it('does not auto-shrink for non-gpt-5 modelFamily', async () => {
    const mockInterface = createMockInterface(800, 400);
    mockedImageInfo.mockResolvedValue({ width: 2400, height: 1200 });

    const result = await commonContextParser(mockInterface, {
      modelFamily: 'qwen2.5-vl',
    });

    expect(mockedResizeImg).not.toHaveBeenCalled();
    expect(result.shotSize).toEqual({ width: 2400, height: 1200 });
  });

  it('should not auto-shrink when no modelFamily is provided', async () => {
    const mockInterface = createMockInterface(800, 400);
    mockedImageInfo.mockResolvedValue({ width: 2400, height: 1200 });

    const result = await commonContextParser(mockInterface, {});

    expect(mockedResizeImg).not.toHaveBeenCalled();
    expect(result.shotSize).toEqual({ width: 2400, height: 1200 });
  });

  it('should use screenshotShrinkFactor when modelFamily is not gpt-5', async () => {
    const mockInterface = createMockInterface(800, 400);
    mockedImageInfo.mockResolvedValue({ width: 2400, height: 1200 });

    const result = await commonContextParser(mockInterface, {
      screenshotShrinkFactor: 2,
      modelFamily: 'gemini',
    });

    expect(mockedResizeImg).toHaveBeenCalledWith('mock-base64-data', {
      width: 1200,
      height: 600,
    });
    expect(result.shotSize).toEqual({ width: 1200, height: 600 });
  });

  it('uses screenshotShrinkFactor even when modelFamily is gpt-5', async () => {
    const mockInterface = createMockInterface(800, 400);
    mockedImageInfo.mockResolvedValue({ width: 2400, height: 1200 });

    const result = await commonContextParser(mockInterface, {
      screenshotShrinkFactor: 3,
      modelFamily: 'gpt-5',
    });

    expect(result.shotSize).toEqual({
      width: 800,
      height: 400,
    });
  });
});
