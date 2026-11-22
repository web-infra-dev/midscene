import { prepareReferenceImages } from '@/ai-model/shared/multimodal-prompt';
import { preProcessImageUrl } from '@midscene/shared/img';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

rs.mock('@midscene/shared/img', () => ({
  preProcessImageUrl: rs.fn(),
}));

describe('prepareReferenceImages', () => {
  beforeEach(() => {
    rs.mocked(preProcessImageUrl).mockReset();
  });

  it('prepares up to five unique URLs concurrently and preserves image order and names', async () => {
    const urls = Array.from(
      { length: 7 },
      (_, i) => `https://example.com/${i}.png`,
    );
    const images = [
      { name: 'first', url: urls[0] },
      { name: 'duplicate', url: urls[0] },
      ...urls.slice(1).map((url, i) => ({ name: `image-${i + 1}`, url })),
    ];
    const pending = new Map<string, (value: string) => void>();
    const active = new Set<string>();
    const concurrency: number[] = [];
    rs.mocked(preProcessImageUrl).mockImplementation((url) => {
      active.add(url);
      concurrency.push(active.size);
      return new Promise<string>((resolve) => {
        pending.set(url, (value) => {
          active.delete(url);
          resolve(value);
        });
      });
    });

    const result = prepareReferenceImages({
      images,
      convertHttpImage2Base64: true,
    });
    await rs.waitFor(() => expect([...active]).toEqual(urls.slice(0, 5)));

    // A finished download admits the next URL without waiting for the whole batch.
    pending.get(urls[3])!('prepared-3');
    await rs.waitFor(() => expect(active.has(urls[5])).toBe(true));
    expect(active.has(urls[6])).toBe(false);
    pending.get(urls[1])!('prepared-1');
    await rs.waitFor(() => expect(active.has(urls[6])).toBe(true));

    for (const index of [6, 4, 2, 5, 0]) {
      pending.get(urls[index])!(`prepared-${index}`);
    }
    expect(await result).toEqual(
      images.map(({ name, url }) => ({
        name,
        url: `prepared-${urls.indexOf(url)}`,
      })),
    );
    expect(Math.max(...concurrency)).toBe(5);
    expect(preProcessImageUrl).toHaveBeenCalledTimes(7);
    for (const url of urls) {
      expect(preProcessImageUrl).toHaveBeenCalledWith(url, true);
    }
    expect(images[0].url).toBe(urls[0]);
  });

  it('preserves the default HTTP conversion option', async () => {
    const url = 'https://example.com/image.png';
    rs.mocked(preProcessImageUrl).mockResolvedValue(url);
    expect(
      await prepareReferenceImages({ images: [{ name: 'reference', url }] }),
    ).toEqual([{ name: 'reference', url }]);
    expect(preProcessImageUrl).toHaveBeenCalledWith(url, false);
  });

  it('returns no images without starting work for empty input', async () => {
    expect(await prepareReferenceImages()).toEqual([]);
    expect(await prepareReferenceImages({ images: [] })).toEqual([]);
    expect(preProcessImageUrl).not.toHaveBeenCalled();
  });

  it('propagates image preparation failures', async () => {
    const error = new Error('download failed');
    rs.mocked(preProcessImageUrl).mockRejectedValue(error);
    await expect(
      prepareReferenceImages({
        images: [{ name: 'reference', url: 'https://example.com/image.png' }],
      }),
    ).rejects.toBe(error);
  });
});
