import { BlobUrlCache } from '@/utils/image-blob-cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('BlobUrlCache', () => {
  let nextId = 0;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    nextId = 0;
    createObjectURL = vi.fn(() => `blob:test/${++nextId}`);
    revokeObjectURL = vi.fn();
  });

  it('converts a base64 data URL to a blob URL and caches it', () => {
    const cache = new BlobUrlCache({ createObjectURL, revokeObjectURL });
    const url = cache.putDataUrl('a', tinyPng);
    expect(url).toMatch(/^blob:/);
    expect(cache.get('a')).toBe(url);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('returns the same blob URL when the same id is converted twice', () => {
    const cache = new BlobUrlCache({ createObjectURL, revokeObjectURL });
    const first = cache.putDataUrl('a', tinyPng);
    const second = cache.putDataUrl('a', tinyPng);
    expect(second).toBe(first);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('passes non-base64 / non-data inputs through untouched', () => {
    const cache = new BlobUrlCache({ createObjectURL, revokeObjectURL });
    const passthrough = cache.putDataUrl('a', './screenshots/a.png');
    expect(passthrough).toBe('./screenshots/a.png');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(cache.has('a')).toBe(false);
  });

  it('does not revoke URLs while resolving many distinct ids', () => {
    // Regression: an earlier LRU bound revoked early entries while Player /
    // Timeline / ZIP still referenced them. The bounded set of screenshot ids
    // in any single report makes that eviction unnecessary, and the consumers
    // cache the returned URL string so revocation breaks rendering.
    const cache = new BlobUrlCache({ createObjectURL, revokeObjectURL });
    const urls: string[] = [];
    for (let i = 0; i < 200; i++) {
      urls.push(cache.putDataUrl(`id-${i}`, tinyPng));
    }
    expect(revokeObjectURL).not.toHaveBeenCalled();
    expect(cache.size()).toBe(200);
    // Every URL returned earlier is still cached for that id.
    for (let i = 0; i < 200; i++) {
      expect(cache.get(`id-${i}`)).toBe(urls[i]);
    }
  });

  it('clear() releases every cached blob URL', () => {
    const cache = new BlobUrlCache({ createObjectURL, revokeObjectURL });
    cache.putDataUrl('a', tinyPng);
    cache.putDataUrl('b', tinyPng);
    cache.clear();
    expect(cache.size()).toBe(0);
    expect(revokeObjectURL).toHaveBeenCalledTimes(2);
  });
});
