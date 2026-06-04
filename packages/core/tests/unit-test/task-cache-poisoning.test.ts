import { type LocateCache, TaskCache } from '@/agent';
import { uuid } from '@midscene/shared/utils';
import { describe, expect, it } from 'vitest';

/**
 * Access internal cache state for testing
 */
function getTaskCacheInternal(taskCache: TaskCache) {
  return taskCache as unknown as {
    cache: { caches: LocateCache[] };
    cacheOriginalLength: number;
  };
}

function seedStaleLocate(taskCache: TaskCache, prompt: string, xpath: string) {
  const internal = getTaskCacheInternal(taskCache);
  internal.cache.caches.push({
    type: 'locate',
    prompt,
    cache: { xpaths: [xpath] },
  });
  internal.cacheOriginalLength = internal.cache.caches.length;
}

describe('locate cache poisoning regression (#2529)', () => {
  it('replaces a consumed stale locate entry in place during replanning instead of appending', () => {
    const cache = new TaskCache(uuid(), true);
    seedStaleLocate(cache, 'click submit', 'wrong/xpath');

    // First locate consumes the stale entry (cache hit on the wrong element).
    const matched = cache.matchLocateCache('click submit');
    expect(matched).toBeDefined();
    expect(matched?.cacheContent.cache?.xpaths).toEqual(['wrong/xpath']);

    // Replanning re-locates the same prompt; the entry was already consumed,
    // so matchLocateCache now returns undefined.
    const rematched = cache.matchLocateCache('click submit');
    expect(rematched).toBeUndefined();

    // The corrected locate result must replace the stale entry, not append.
    cache.updateOrAppendCacheRecord(
      {
        type: 'locate',
        prompt: 'click submit',
        cache: { xpaths: ['correct/xpath'] },
      },
      undefined,
    );

    const internal = getTaskCacheInternal(cache);
    expect(internal.cache.caches).toHaveLength(1);
    expect(internal.cache.caches[0].cache?.xpaths).toEqual(['correct/xpath']);
  });

  it('appends a new entry when nothing was consumed for the prompt', () => {
    const cache = new TaskCache(uuid(), true);

    cache.updateOrAppendCacheRecord(
      {
        type: 'locate',
        prompt: 'fresh prompt',
        cache: { xpaths: ['some/xpath'] },
      },
      undefined,
    );

    const internal = getTaskCacheInternal(cache);
    expect(internal.cache.caches).toHaveLength(1);
    expect(internal.cache.caches[0].cache?.xpaths).toEqual(['some/xpath']);
  });

  it('does not cross-replace entries for different prompts', () => {
    const cache = new TaskCache(uuid(), true);
    seedStaleLocate(cache, 'click submit', 'wrong/xpath');

    // Consume the stale entry for "click submit".
    expect(cache.matchLocateCache('click submit')).toBeDefined();

    // A write for a different prompt must append, leaving the consumed entry
    // untouched.
    cache.updateOrAppendCacheRecord(
      {
        type: 'locate',
        prompt: 'click cancel',
        cache: { xpaths: ['cancel/xpath'] },
      },
      undefined,
    );

    const internal = getTaskCacheInternal(cache);
    expect(internal.cache.caches).toHaveLength(2);
    expect(internal.cache.caches[0].prompt).toBe('click submit');
    expect(internal.cache.caches[0].cache?.xpaths).toEqual(['wrong/xpath']);
    expect(internal.cache.caches[1].prompt).toBe('click cancel');
  });

  it('appends a second entry for a repeated prompt that was never consumed', () => {
    // Two distinct locate occurrences of the same prompt in one run, both
    // cache misses: each should append its own entry.
    const cache = new TaskCache(uuid(), true);

    cache.updateOrAppendCacheRecord(
      { type: 'locate', prompt: 'row action', cache: { xpaths: ['row/1'] } },
      undefined,
    );
    cache.updateOrAppendCacheRecord(
      { type: 'locate', prompt: 'row action', cache: { xpaths: ['row/2'] } },
      undefined,
    );

    const internal = getTaskCacheInternal(cache);
    expect(internal.cache.caches).toHaveLength(2);
    expect(internal.cache.caches[0].cache?.xpaths).toEqual(['row/1']);
    expect(internal.cache.caches[1].cache?.xpaths).toEqual(['row/2']);
  });
});
