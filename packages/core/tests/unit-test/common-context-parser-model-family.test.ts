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

  it('should auto-shrink when modelFamily is gpt-5 and longest side exceeds 1600', async () => {
    // Screenshot: 2400x1200, longest side = 2400 > 1600
    // Expected shrink = 2400 / 1600 = 1.5
    const mockInterface = createMockInterface(800, 400);
    mockedImageInfo.mockResolvedValue({ width: 2400, height: 1200 });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await commonContextParser(mockInterface, {
      modelFamily: 'gpt-5',
    });

    expect(mockedResizeImg).toHaveBeenCalledWith('mock-base64-data', {
      width: Math.round(2400 / 1.5),
      height: Math.round(1200 / 1.5),
    });
    expect(result.shotSize).toEqual({
      width: Math.round(2400 / 1.5),
      height: Math.round(1200 / 1.5),
    });
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('GPT-5 models'),
    );
    warnSpy.mockRestore();
  });

  it('should not shrink when modelFamily is gpt-5 but longest side is within 1600', async () => {
    // Screenshot: 1200x800, longest side = 1200 <= 1600
    const mockInterface = createMockInterface(600, 400);
    mockedImageInfo.mockResolvedValue({ width: 1200, height: 800 });

    const result = await commonContextParser(mockInterface, {
      modelFamily: 'gpt-5',
    });

    expect(mockedResizeImg).not.toHaveBeenCalled();
    expect(result.shotSize).toEqual({ width: 1200, height: 800 });
  });

  it('should not auto-shrink for non-gpt-5 modelFamily', async () => {
    // Same large screenshot, but with a different model family
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

  it('should use gpt-5 auto-shrink and ignore screenshotShrinkFactor when modelFamily is gpt-5', async () => {
    // When modelFamily is gpt-5, the auto-shrink logic takes over
    // screenshotShrinkFactor is not applied
    const mockInterface = createMockInterface(800, 400);
    mockedImageInfo.mockResolvedValue({ width: 2400, height: 1200 });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await commonContextParser(mockInterface, {
      screenshotShrinkFactor: 3,
      modelFamily: 'gpt-5',
    });

    // gpt-5 shrink: 2400/1600 = 1.5, not 3
    const expectedShrink = 2400 / 1600;
    expect(result.shotSize).toEqual({
      width: Math.round(2400 / expectedShrink),
      height: Math.round(1200 / expectedShrink),
    });
    warnSpy.mockRestore();
  });

  it('should handle gpt-5 auto-shrink with portrait screenshot', async () => {
    // Portrait: 1200x2400, longest side = 2400 > 1600
    const mockInterface = createMockInterface(400, 800);
    mockedImageInfo.mockResolvedValue({ width: 1200, height: 2400 });

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = await commonContextParser(mockInterface, {
      modelFamily: 'gpt-5',
    });

    const expectedShrink = 2400 / 1600;
    expect(result.shotSize).toEqual({
      width: Math.round(1200 / expectedShrink),
      height: Math.round(2400 / expectedShrink),
    });
    warnSpy.mockRestore();
  });
});
