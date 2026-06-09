import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  // Keep this regression deterministic. A former web AI e2e version depended on
  // the model regenerating identical locate prompt text across replans, which
  // made CI fail before the cache-poisoning branch was actually exercised.
  it('replaces a stale locate entry in place when the consumed hit was rejected', () => {
    const cache = new TaskCache(uuid(), true);
    seedStaleLocate(cache, 'click submit', 'wrong/xpath');

    // First locate consumes the stale entry (cache hit on the wrong element).
    const matched = cache.matchLocateCache('click submit');
    expect(matched).toBeDefined();
    expect(matched?.cacheContent.cache?.xpaths).toEqual(['wrong/xpath']);

    // The action using that element failed -> the replan loop marks it stale.
    cache.markLocateCacheStale('click submit');

    // Replanning re-locates the same prompt; the entry was already consumed,
    // so matchLocateCache now returns undefined.
    expect(cache.matchLocateCache('click submit')).toBeUndefined();

    // The corrected locate result replaces the stale entry, not append.
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

  it('appends (does not replace) a consumed entry that was never marked stale', () => {
    // Without a stale mark, a re-locate after a consumed hit must append, not
    // overwrite — the prior hit may have been correct.
    const cache = new TaskCache(uuid(), true);
    seedStaleLocate(cache, 'click submit', 'first/xpath');

    expect(cache.matchLocateCache('click submit')).toBeDefined();
    expect(cache.matchLocateCache('click submit')).toBeUndefined();

    cache.updateOrAppendCacheRecord(
      {
        type: 'locate',
        prompt: 'click submit',
        cache: { xpaths: ['second/xpath'] },
      },
      undefined,
    );

    const internal = getTaskCacheInternal(cache);
    expect(internal.cache.caches).toHaveLength(2);
    expect(internal.cache.caches[0].cache?.xpaths).toEqual(['first/xpath']);
    expect(internal.cache.caches[1].cache?.xpaths).toEqual(['second/xpath']);
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

    // Consume and mark the stale entry for "click submit".
    expect(cache.matchLocateCache('click submit')).toBeDefined();
    cache.markLocateCacheStale('click submit');

    // A write for a different prompt must append, leaving the stale-marked
    // entry untouched (the stale mark is keyed by prompt).
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

  it('appends instead of overwriting when the same prompt overflows without failure', () => {
    // Same prompt located more times than it has cached entries, and no hit was
    // rejected: the extra miss must append a new entry, never overwrite a still
    // valid one. This is the case Codex flagged (P2).
    const cache = new TaskCache(uuid(), true);
    const internal = getTaskCacheInternal(cache);
    internal.cache.caches.push(
      { type: 'locate', prompt: 'row action', cache: { xpaths: ['row/1'] } },
      { type: 'locate', prompt: 'row action', cache: { xpaths: ['row/2'] } },
    );
    internal.cacheOriginalLength = 2;

    // Three occurrences in one run: the first two hit, the third misses.
    expect(
      cache.matchLocateCache('row action')?.cacheContent.cache?.xpaths,
    ).toEqual(['row/1']);
    expect(
      cache.matchLocateCache('row action')?.cacheContent.cache?.xpaths,
    ).toEqual(['row/2']);
    expect(cache.matchLocateCache('row action')).toBeUndefined();

    cache.updateOrAppendCacheRecord(
      { type: 'locate', prompt: 'row action', cache: { xpaths: ['row/3'] } },
      undefined,
    );

    // Both original entries are preserved; the third occurrence is appended.
    expect(internal.cache.caches).toHaveLength(3);
    expect(internal.cache.caches[0].cache?.xpaths).toEqual(['row/1']);
    expect(internal.cache.caches[1].cache?.xpaths).toEqual(['row/2']);
    expect(internal.cache.caches[2].cache?.xpaths).toEqual(['row/3']);
  });

  it('markLocateCacheStale is a no-op when nothing was consumed', () => {
    const cache = new TaskCache(uuid(), true);
    seedStaleLocate(cache, 'click submit', 'wrong/xpath');

    // No matchLocateCache call -> nothing consumed -> marking is a no-op, so the
    // following write appends rather than replaces.
    cache.markLocateCacheStale('click submit');
    cache.updateOrAppendCacheRecord(
      {
        type: 'locate',
        prompt: 'click submit',
        cache: { xpaths: ['correct/xpath'] },
      },
      undefined,
    );

    const internal = getTaskCacheInternal(cache);
    expect(internal.cache.caches).toHaveLength(2);
  });

  it('replaces in memory but does not flush to file in read-only mode', () => {
    const filePath = join(tmpdir(), `mid-cache-${uuid()}.cache.yaml`);
    const cache = new TaskCache(uuid(), true, filePath, { readOnly: true });
    seedStaleLocate(cache, 'click submit', 'wrong/xpath');

    expect(cache.matchLocateCache('click submit')).toBeDefined();
    cache.markLocateCacheStale('click submit');
    expect(cache.matchLocateCache('click submit')).toBeUndefined();

    cache.updateOrAppendCacheRecord(
      {
        type: 'locate',
        prompt: 'click submit',
        cache: { xpaths: ['correct/xpath'] },
      },
      undefined,
    );

    const internal = getTaskCacheInternal(cache);
    // In-memory entry is replaced in place...
    expect(internal.cache.caches).toHaveLength(1);
    expect(internal.cache.caches[0].cache?.xpaths).toEqual(['correct/xpath']);
    // ...but nothing is written to disk in read-only mode.
    expect(existsSync(filePath)).toBe(false);
  });
});
