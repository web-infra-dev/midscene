import { prepareUserPrompt } from '@/ai-model/shared/multimodal-prompt';
import { transformImage } from '@midscene/shared/img';
import * as imgActual from '@midscene/shared/img' with {
  rstest: 'importActual',
};
import { beforeEach, describe, expect, it, rs } from '@rstest/core';
rs.mock('@midscene/shared/img', () => ({
  ...imgActual,
  transformImage: rs.fn(imgActual.transformImage),
}));
const pngDataUrl =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAGCAIAAABxZ0isAAAACXBIWXMAAAPoAAAD6AG1e1JrAAAAEUlEQVR4nGMQqbiDFTEMpAQAorNDgTX/VEoAAAAASUVORK5CYII=';
const webpDataUrl =
  'data:image/webp;base64,UklGRjQAAABXRUJQVlA4ICgAAACQAQCdASoCAAMAAMASJQBOl0AAjNAA/v4icv1difCfoP7mxzi2QwAA';

describe('reference image preparation before message serialization', () => {
  beforeEach(() => {
    rs.clearAllMocks();
  });
  const prepare = (urls: string[]) =>
    prepareUserPrompt({
      prompt: 'inspect',
      images: urls.map((url, index) => ({ name: String(index), url })),
    });
  it('compresses PNG before building model messages', async () => {
    const result = await prepare([pngDataUrl]);
    expect(result.referenceImages[0].url).toMatch(/^data:image\/webp;base64,/);
  });
  it('preserves existing WebP bytes', async () => {
    const result = await prepare([webpDataUrl]);
    expect(result.referenceImages[0].url).toBe(webpDataUrl);
  });
  it('does not fetch remote URLs unless requested', async () => {
    const url = 'https://example.com/image.png';
    expect((await prepare([url])).referenceImages[0].url).toBe(url);
    expect(transformImage).not.toHaveBeenCalled();
  });
  it('prepares a repeated reference once while retaining its names and order', async () => {
    const result = await prepare([pngDataUrl, pngDataUrl]);
    expect(transformImage).toHaveBeenCalledTimes(1);
    expect(result.referenceImages[0].url).toBe(result.referenceImages[1].url);
    expect(result.referenceImages.map((image) => image.name)).toEqual([
      '0',
      '1',
    ]);
  });
});
