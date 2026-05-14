import { BlobUrlCache } from '@/utils/image-blob-cache';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const tinyPng =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('BlobUrlCache', () => {
  let nextId = 0;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let revoked: string[];

  beforeEach(() => {
    nextId = 0;
    revoked = [];
    createObjectURL = vi.fn(() => `blob:test/${++nextId}`);
    revokeObjectURL = vi.fn((url: string) => {
      revoked.push(url);
    });
  });

  it('converts a base64 data URL to a blob URL and caches it', () => {
    const cache = new BlobUrlCache({ createObjectURL, revokeObjectURL });
    const url = cache.putDataUrl('a', tinyPng);
    expect(url).toMatch(/^blob:/);
    expect(cache.get('a')).toBe(url);
    expect(createObjectURL).toHaveBeenCalledTimes(1);
  });

  it('passes non-base64 / non-data inputs through untouched', () => {
    const cache = new BlobUrlCache({ createObjectURL, revokeObjectURL });
    const passthrough = cache.putDataUrl('a', './screenshots/a.png');
    expect(passthrough).toBe('./screenshots/a.png');
    expect(createObjectURL).not.toHaveBeenCalled();
    expect(cache.has('a')).toBe(false);
  });

  it('evicts the least-recently-used entry and revokes its blob URL', () => {
    const cache = new BlobUrlCache({
      maxEntries: 2,
      createObjectURL,
      revokeObjectURL,
    });
    const a = cache.putDataUrl('a', tinyPng);
    const b = cache.putDataUrl('b', tinyPng);
    // touch 'a' so 'b' becomes the LRU victim
    cache.get('a');
    cache.putDataUrl('c', tinyPng);
    expect(cache.has('a')).toBe(true);
    expect(cache.has('b')).toBe(false);
    expect(cache.has('c')).toBe(true);
    expect(revoked).toEqual([b]);
    expect(a).not.toBe(b);
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
