import { prepareModelImage } from '@/ai-model/workflows/image-preprocess';
import { buildSearchAreaConfig } from '@/ai-model/workflows/inspect';
import {
  cropByRect,
  paddingToMatchBlockByBase64,
  scaleImage,
} from '@midscene/shared/img';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@midscene/shared/img', () => ({
  compositeElementInfoImg: vi.fn(),
  cropByRect: vi.fn(),
  paddingToMatchBlockByBase64: vi.fn(),
  scaleImage: vi.fn(),
}));

describe('prepareModelImage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns the original image and size when no padding policy is configured', async () => {
    const image = await prepareModelImage({
      imageBase64: 'original-image',
      width: 101,
      height: 77,
      policy: {},
    });

    expect(image).toEqual({
      imageBase64: 'original-image',
      preparedSize: {
        width: 101,
        height: 77,
      },
      contentSize: {
        width: 101,
        height: 77,
      },
    });
    expect(paddingToMatchBlockByBase64).not.toHaveBeenCalled();
  });

  it('keeps contentSize as the original size after padding the model image', async () => {
    vi.mocked(paddingToMatchBlockByBase64).mockResolvedValue({
      imageBase64: 'padded-image',
      width: 112,
      height: 84,
    } as any);

    const image = await prepareModelImage({
      imageBase64: 'original-image',
      width: 101,
      height: 77,
      policy: {
        padBlockSize: 28,
      },
    });

    expect(paddingToMatchBlockByBase64).toHaveBeenCalledWith(
      'original-image',
      28,
    );
    expect(image).toEqual({
      imageBase64: 'padded-image',
      preparedSize: {
        width: 112,
        height: 84,
      },
      contentSize: {
        width: 101,
        height: 77,
      },
    });
  });
});

describe('buildSearchAreaConfig', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('crops the expanded area, scales it, and records offset/scale mapping', async () => {
    const cropCalls: unknown[] = [];
    vi.mocked(cropByRect).mockImplementation(async (_imageBase64, rect) => {
      cropCalls.push({ ...rect });
      return {
        imageBase64: 'cropped-image',
        width: 400,
        height: 400,
      } as any;
    });
    vi.mocked(scaleImage).mockResolvedValue({
      imageBase64: 'scaled-image',
      width: 800,
      height: 800,
    } as any);

    const searchArea = await buildSearchAreaConfig({
      context: {
        screenshot: {
          base64: 'full-screenshot',
        },
        shotSize: {
          width: 1000,
          height: 800,
        },
      } as any,
      baseRect: {
        left: 450,
        top: 350,
        width: 100,
        height: 100,
      },
    });

    expect(cropByRect).toHaveBeenCalledWith(
      'full-screenshot',
      expect.any(Object),
    );
    expect(cropCalls).toEqual([
      {
        left: 300,
        top: 200,
        width: 400,
        height: 400,
      },
    ]);
    expect(scaleImage).toHaveBeenCalledWith('cropped-image', 2);
    expect(searchArea).toEqual({
      rect: {
        left: 300,
        top: 200,
        width: 800,
        height: 800,
      },
      image: {
        imageBase64: 'scaled-image',
        width: 800,
        height: 800,
      },
      mapping: {
        offset: {
          x: 300,
          y: 200,
        },
        scale: 2,
      },
    });
  });
});
