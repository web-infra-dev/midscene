import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import path, { join } from 'node:path';
import {
  type LocateCache,
  type PlanningCache,
  TaskCache,
  cacheFileExt,
} from '@midscene/core/agent';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { uuid } from '@midscene/shared/utils';
import yaml from 'js-yaml';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

const prepareCache = (
  caches: (PlanningCache | LocateCache)[],
  cacheId?: string,
) => {
  const cache = new TaskCache(cacheId ?? uuid(), true);

  caches.map((data: PlanningCache | LocateCache) => {
    cache.appendCache(data);
  });

  return cache.cacheFilePath;
};

describe('TaskCache', { timeout: 20000 }, () => {
  beforeAll(() => {
    vi.resetModules();
  });

  afterAll(() => {
    vi.restoreAllMocks();
  });

  it('should create cache file', () => {
    const cacheId = uuid();
    const cache = new TaskCache(cacheId, true);
    expect(cache.cacheFilePath).toBeDefined();

    cache.appendCache({
      type: 'plan',
      prompt: 'test',
      yamlWorkflow: 'test',
    });

    expect(existsSync(cache.cacheFilePath!)).toBe(true);
    const cacheContent = readFileSync(cache.cacheFilePath!, 'utf-8').replace(
      cacheId,
      'cacheId',
    );
    expect(
      cacheContent.replace(/\d+\.\d+\.\d+[-\w\d.]*/g, '0.999.0'),
    ).toMatchSnapshot();

    expect(cache.isCacheResultUsed).toBe(true);
  });

  it('update or append cache record - should not match cache added in same run', () => {
    const cacheId = uuid();
    const cache = new TaskCache(cacheId, true);

    cache.appendCache({
      type: 'plan',
      prompt: 'test-prompt',
      yamlWorkflow: 'test-yaml-workflow',
    });

    const existingRecord = cache.matchPlanCache('test-prompt');
    expect(existingRecord).toBeUndefined();

    cache.updateOrAppendCacheRecord(
      {
        type: 'plan',
        prompt: 'test-prompt',
        yamlWorkflow: 'test-yaml-workflow-2',
      },
      existingRecord,
    );

    expect(cache.cache.caches.length).toBe(2);
    expect(cache.cache.caches).toMatchSnapshot();
  });

  it('one cache record can only be matched once - when loaded from file', () => {
    const cacheFilePath = prepareCache([
      {
        type: 'plan',
        prompt: 'test-prompt',
        yamlWorkflow: 'test-yaml-workflow',
      },
    ]);

    const newCache = new TaskCache(uuid(), true, cacheFilePath);

    // should be able to match cache record
    expect(newCache.matchPlanCache('test-prompt')).toBeDefined();
    // should return undefined when matching the same record again
    expect(newCache.matchPlanCache('test-prompt')).toBeUndefined();
  });

  it('same prompt with same type cache record can be matched twice - when loaded from file', () => {
    const cacheFilePath = prepareCache([
      {
        type: 'plan',
        prompt: 'test-prompt',
        yamlWorkflow: 'test-yaml-workflow-1',
      },
      {
        type: 'plan',
        prompt: 'test-prompt',
        yamlWorkflow: 'test-yaml-workflow-2',
      },
    ]);
    const newCache = new TaskCache(uuid(), true, cacheFilePath);

    // should be able to match the first record
    const firstMatch = newCache.matchPlanCache('test-prompt');
    expect(firstMatch).toBeDefined();
    expect(firstMatch?.cacheContent.yamlWorkflow).toBe('test-yaml-workflow-1');

    // should be able to match the second record
    const secondMatch = newCache.matchPlanCache('test-prompt');
    expect(secondMatch).toBeDefined();
    expect(secondMatch?.cacheContent.yamlWorkflow).toBe('test-yaml-workflow-2');

    // should return undefined when matching the same record again
    expect(newCache.matchPlanCache('test-prompt')).toBeUndefined();
  });

  it('should not match cache records added in the same run', () => {
    const cacheId = uuid();
    const cache = new TaskCache(cacheId, true);

    // cache is empty, cacheOriginalLength should be 0
    expect(cache.cacheOriginalLength).toBe(0);

    // add a cache record
    cache.appendCache({
      type: 'plan',
      prompt: 'test-prompt-1',
      yamlWorkflow: 'test-yaml-workflow-1',
    });

    // add another cache record
    cache.appendCache({
      type: 'plan',
      prompt: 'test-prompt-2',
      yamlWorkflow: 'test-yaml-workflow-2',
    });

    // cache has two records
    expect(cache.cache.caches.length).toBe(2);

    // cacheOriginalLength should be 0
    expect(cache.cacheOriginalLength).toBe(0);

    // should not be able to match any record
    expect(cache.matchPlanCache('test-prompt-1')).toBeUndefined();
    expect(cache.matchPlanCache('test-prompt-2')).toBeUndefined();
  });

  it('save and retrieve cache from file', () => {
    const cacheId = uuid();
    const planningCachedPrompt = 'test';
    const planningCachedYamlWorkflow = 'test-yaml-workflow';

    const locateCachedPrompt = 'test-locate';
    const locateCachedCache = { xpaths: ['test-xpath-1', 'test-xpath-2'] };

    const cacheFilePath = prepareCache(
      [
        {
          type: 'plan',
          prompt: planningCachedPrompt,
          yamlWorkflow: planningCachedYamlWorkflow,
        },
        {
          type: 'locate',
          prompt: locateCachedPrompt,
          cache: locateCachedCache,
        },
      ],
      cacheId,
    );

    const newTaskCache = new TaskCache(cacheId, true, cacheFilePath);

    // should be able to match all cache records
    const cachedPlanCache = newTaskCache.matchPlanCache(planningCachedPrompt);
    const { cacheContent: cachedPlanCacheContent } = cachedPlanCache!;
    expect(cachedPlanCacheContent.prompt).toBe(planningCachedPrompt);
    expect(cachedPlanCacheContent.yamlWorkflow).toBe(
      planningCachedYamlWorkflow,
    );

    const cachedLocateCache = newTaskCache.matchLocateCache(locateCachedPrompt);
    const {
      cacheContent: cachedLocateCacheContent,
      updateFn: cachedLocateCacheUpdateFn,
    } = cachedLocateCache!;
    expect(cachedLocateCacheContent.prompt).toBe(locateCachedPrompt);
    expect(cachedLocateCacheContent.cache).toEqual(locateCachedCache);

    expect(newTaskCache.cache.caches).toMatchSnapshot();

    // test update cache
    cachedLocateCacheUpdateFn((cache) => {
      cache.cache = { xpaths: ['test-xpath-3', 'test-xpath-4'] };
    });

    expect(newTaskCache.cache.caches).toMatchSnapshot();
    const cacheFileContent = readFileSync(
      newTaskCache.cacheFilePath!,
      'utf-8',
    ).replace(newTaskCache.cacheId, 'cacheId');
    expect(
      cacheFileContent.replace(/\d+\.\d+\.\d+[-\w\d.]*/g, '0.999.0'),
    ).toMatchSnapshot();
  });

  it('migrates legacy locate cache xpaths to cache entry when matching', () => {
    const legacyXpaths = ['legacy-xpath-1'];
    const cacheFilePath = prepareCache([
      {
        type: 'locate',
        prompt: 'legacy-locate',
        xpaths: legacyXpaths,
      },
    ]);

    const newTaskCache = new TaskCache(uuid(), true, cacheFilePath);
    const located = newTaskCache.matchLocateCache('legacy-locate');
    expect(located?.cacheContent.cache?.xpaths).toEqual(legacyXpaths);
  });

  it('updateOrAppendCacheRecord writes cache entry and clears legacy xpaths', () => {
    const cacheFilePath = prepareCache([
      {
        type: 'locate',
        prompt: 'update-locate',
        xpaths: ['old-xpath'],
      },
    ]);

    const taskCache = new TaskCache(uuid(), true, cacheFilePath);
    const matched = taskCache.matchLocateCache('update-locate');
    expect(matched).toBeDefined();

    taskCache.updateOrAppendCacheRecord(
      {
        type: 'locate',
        prompt: 'update-locate',
        cache: { xpaths: ['new-xpath'] },
      },
      matched,
    );

    expect(matched?.cacheContent.cache?.xpaths).toEqual(['new-xpath']);
    expect(matched?.cacheContent.xpaths).toBeUndefined();

    const persisted = yaml.load(
      readFileSync(taskCache.cacheFilePath!, 'utf-8'),
    ) as any;
    const persistedLocate = persisted.caches.find(
      (entry: any) => entry.prompt === 'update-locate',
    );
    expect(persistedLocate.cache.xpaths).toEqual(['new-xpath']);
    expect(persistedLocate.xpaths).toBeUndefined();
  });

  it('should sanitize cache ID for file path', () => {
    const cacheIdWithIllegalChars =
      'test:cache*with?illegal"chars<>|and spaces';
    const cache = new TaskCache(cacheIdWithIllegalChars, true);

    // Cache ID should be sanitized
    expect(cache.cacheId).toBe('test-cache-with-illegal-chars---and-spaces');

    // File path should contain sanitized cache ID
    expect(cache.cacheFilePath).toContain(
      'test-cache-with-illegal-chars---and-spaces.cache.yaml',
    );

    // Should be able to create cache file with sanitized name
    cache.appendCache({
      type: 'plan',
      prompt: 'test',
      yamlWorkflow: 'test-workflow',
    });

    expect(existsSync(cache.cacheFilePath!)).toBe(true);
  });

  it('should handle cache ID with path separators', () => {
    const cacheIdWithPaths = '/path/to/cache\\with\\separators';
    const cache = new TaskCache(cacheIdWithPaths, true);

    // Path separators should be preserved in cache ID
    expect(cache.cacheId).toBe('/path/to/cache\\with\\separators');

    // File path should be valid
    expect(cache.cacheFilePath).toBeDefined();
    expect(cache.cacheFilePath).toContain('.cache.yaml');
  });

  it('should create cache directory if it does not exist', () => {
    const cacheId = uuid();
    const uniqueDir = path.join(
      process.cwd(),
      'midscene_run',
      'cache',
      `test-cache-dir-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    );
    const customCacheDir = join(process.cwd(), uniqueDir, 'nested', 'deep');
    const customCacheFilePath = join(customCacheDir, `${cacheId}.cache.yaml`);

    const cache = new TaskCache(cacheId, true, customCacheFilePath);

    // Directory should not exist initially
    expect(existsSync(customCacheDir)).toBe(false);

    // Adding cache should create the directory
    cache.appendCache({
      type: 'plan',
      prompt: 'test',
      yamlWorkflow: 'test-workflow',
    });

    // Directory and file should now exist
    expect(existsSync(customCacheDir)).toBe(true);
    expect(existsSync(customCacheFilePath)).toBe(true);
  });

  it('should handle custom cache file path', () => {
    const customPath = 'custom-cache.yaml';

    const cache = new TaskCache(customPath, true);

    expect(cache.cacheFilePath).toBe(
      join(getMidsceneRunSubDir('cache'), `${customPath}${cacheFileExt}`),
    );

    cache.appendCache({
      type: 'locate',
      prompt: 'test-locate',
      cache: { xpaths: ['test-xpath'] },
    });

    expect(existsSync(cache.cacheFilePath!)).toBe(true);

    // Verify content
    const content = readFileSync(cache.cacheFilePath!, 'utf-8');
    expect(content).toContain('test-locate');
    expect(content).toContain('test-xpath');
  });

  it('should handle empty cache ID gracefully', () => {
    // TaskCache requires non-empty cache ID, so test that it throws error for empty string
    expect(() => new TaskCache('', true)).toThrow('cacheId is required');
  });

  it('should handle minimal cache ID', () => {
    const cache = new TaskCache('a', true);

    // Minimal cache ID should work
    expect(cache.cacheId).toBe('a');
    expect(cache.cacheFilePath).toContain('a.cache.yaml');

    // Should be able to create cache file
    cache.appendCache({
      type: 'plan',
      prompt: 'test',
      yamlWorkflow: 'test-workflow',
    });

    expect(existsSync(cache.cacheFilePath!)).toBe(true);
  });

  it('should preserve cache file path structure', () => {
    const cacheId = 'test-cache-id';
    const cache = new TaskCache(cacheId, true);

    // Should use default cache directory structure
    expect(cache.cacheFilePath).toMatch(
      /.*\/cache\/test-cache-id\.cache\.yaml$/,
    );

    // Should be able to write to the path
    cache.appendCache({
      type: 'plan',
      prompt: 'test',
      yamlWorkflow: 'test-workflow',
    });

    expect(existsSync(cache.cacheFilePath!)).toBe(true);
  });

  it('should sort caches with plan entries before locate entries when writing to disk', () => {
    const cacheId = uuid();
    const cache = new TaskCache(cacheId, true);

    // Add caches in mixed order: locate, plan, locate, plan
    cache.appendCache({
      type: 'locate',
      prompt: 'locate-prompt-1',
      cache: { xpaths: ['xpath-1'] },
    });

    cache.appendCache({
      type: 'plan',
      prompt: 'plan-prompt-1',
      yamlWorkflow: 'workflow-1',
    });

    cache.appendCache({
      type: 'locate',
      prompt: 'locate-prompt-2',
      cache: { xpaths: ['xpath-2'] },
    });

    cache.appendCache({
      type: 'plan',
      prompt: 'plan-prompt-2',
      yamlWorkflow: 'workflow-2',
    });

    // In memory, caches should maintain insertion order
    expect(cache.cache.caches[0].type).toBe('locate');
    expect(cache.cache.caches[1].type).toBe('plan');
    expect(cache.cache.caches[2].type).toBe('locate');
    expect(cache.cache.caches[3].type).toBe('plan');

    // Read the file content to verify disk ordering
    const fileContent = readFileSync(cache.cacheFilePath!, 'utf-8');
    const parsedContent = yaml.load(fileContent) as any;

    // On disk, all plan entries should come before all locate entries
    const diskCaches = parsedContent.caches;
    expect(diskCaches[0].type).toBe('plan');
    expect(diskCaches[0].prompt).toBe('plan-prompt-1');
    expect(diskCaches[1].type).toBe('plan');
    expect(diskCaches[1].prompt).toBe('plan-prompt-2');
    expect(diskCaches[2].type).toBe('locate');
    expect(diskCaches[2].prompt).toBe('locate-prompt-1');
    expect(diskCaches[3].type).toBe('locate');
    expect(diskCaches[3].prompt).toBe('locate-prompt-2');

    // Verify that plan entries maintain their relative order
    expect(diskCaches[0].yamlWorkflow).toBe('workflow-1');
    expect(diskCaches[1].yamlWorkflow).toBe('workflow-2');

    // Verify that locate entries maintain their relative order
    expect(diskCaches[2].cache.xpaths).toEqual(['xpath-1']);
    expect(diskCaches[3].cache.xpaths).toEqual(['xpath-2']);
  });
});

describe('TaskCache read-only mode', () => {
  it('should append cache to memory but not flush to file in read-only mode', () => {
    const cacheId = uuid();
    const cache = new TaskCache(cacheId, true, undefined, {
      readOnly: true,
    }); // read-only mode

    const initialLength = cache.cache.caches.length;

    cache.appendCache({
      type: 'plan',
      prompt: 'test-prompt',
      yamlWorkflow: 'test-workflow',
    });

    // Cache should be appended to memory in read-only mode
    expect(cache.cache.caches.length).toBe(initialLength + 1);

    // But file should not be created
    expect(existsSync(cache.cacheFilePath!)).toBe(false);
  });

  it('should allow manual flush to file in read-only mode', () => {
    const cacheId = uuid();
    const cache = new TaskCache(cacheId, true, undefined, {
      readOnly: true,
    }); // read-only mode

    // Ensure file doesn't exist initially
    if (existsSync(cache.cacheFilePath!)) {
      unlinkSync(cache.cacheFilePath!);
    }

    // Manually add cache to simulate existing cache
    cache.cache.caches.push({
      type: 'plan',
      prompt: 'test-prompt',
      yamlWorkflow: 'test-workflow',
    });

    // Manual flush should work even in read-only mode
    cache.flushCacheToFile();

    expect(existsSync(cache.cacheFilePath!)).toBe(true);

    // Verify the content was written
    const content = readFileSync(cache.cacheFilePath!, 'utf-8');
    expect(content).toContain('test-prompt');
    expect(content).toContain('test-workflow');
  });

  it('should update cache in memory but not flush to file in read-only mode', () => {
    // First create a cache file with existing data
    const cacheFilePath = prepareCache([
      {
        type: 'plan',
        prompt: 'test-prompt',
        yamlWorkflow: 'original-workflow',
      },
    ]);

    // Load cache in read-only mode
    const cache = new TaskCache(uuid(), true, cacheFilePath, {
      readOnly: true,
    });

    const matchedCache = cache.matchPlanCache('test-prompt');
    expect(matchedCache).toBeDefined();

    // Try to update via updateFn - should update in memory
    matchedCache!.updateFn((cacheItem) => {
      (cacheItem as PlanningCache).yamlWorkflow = 'updated-workflow';
    });

    // Content should be updated in memory
    expect(matchedCache!.cacheContent.yamlWorkflow).toBe('updated-workflow');

    // But the original file should remain unchanged
    const fileContent = readFileSync(cacheFilePath!, 'utf-8');
    expect(fileContent).toContain('original-workflow');
    expect(fileContent).not.toContain('updated-workflow');
  });

  it('should still be able to match cache in read-only mode', () => {
    // First create a cache file with existing data
    const cacheFilePath = prepareCache([
      {
        type: 'plan',
        prompt: 'test-prompt',
        yamlWorkflow: 'test-workflow',
      },
      {
        type: 'locate',
        prompt: 'locate-prompt',
        xpaths: ['test-xpath'],
      },
    ]);

    // Load cache in read-only mode
    const cache = new TaskCache(uuid(), true, cacheFilePath, {
      readOnly: true,
    });

    // Should still be able to match existing cache
    const planCache = cache.matchPlanCache('test-prompt');
    expect(planCache).toBeDefined();
    expect(planCache!.cacheContent.yamlWorkflow).toBe('test-workflow');

    const locateCache = cache.matchLocateCache('locate-prompt');
    expect(locateCache).toBeDefined();
    expect(locateCache!.cacheContent.cache?.xpaths).toEqual(['test-xpath']);
  });

  it('should set readOnlyMode property correctly', () => {
    const normalCache = new TaskCache(uuid(), true);
    expect(normalCache.readOnlyMode).toBe(false);
    expect(normalCache.writeOnlyMode).toBe(false);

    const readOnlyCache = new TaskCache(uuid(), true, undefined, {
      readOnly: true,
    });
    expect(readOnlyCache.readOnlyMode).toBe(true);
    expect(readOnlyCache.writeOnlyMode).toBe(false);

    const writeOnlyCache = new TaskCache(uuid(), true, undefined, {
      writeOnly: true,
    });
    expect(writeOnlyCache.readOnlyMode).toBe(false);
    expect(writeOnlyCache.writeOnlyMode).toBe(true);
  });

  it('should handle updateOrAppendCacheRecord in memory but not flush to file in read-only mode', () => {
    const cacheFilePath = prepareCache([
      {
        type: 'plan',
        prompt: 'existing-prompt',
        yamlWorkflow: 'existing-workflow',
      },
    ]);

    const cache = new TaskCache(uuid(), true, cacheFilePath, {
      readOnly: true,
    });
    const initialLength = cache.cache.caches.length;

    // Try to append new record - should append to memory
    cache.updateOrAppendCacheRecord({
      type: 'plan',
      prompt: 'new-prompt',
      yamlWorkflow: 'new-workflow',
    });

    // Should append to memory in read-only mode
    expect(cache.cache.caches.length).toBe(initialLength + 1);

    // Try to update existing record
    const existingRecord = cache.matchPlanCache('existing-prompt');
    cache.updateOrAppendCacheRecord(
      {
        type: 'plan',
        prompt: 'existing-prompt',
        yamlWorkflow: 'updated-workflow',
      },
      existingRecord,
    );

    // Should update in memory
    expect(cache.cache.caches.length).toBe(initialLength + 1);
    expect(existingRecord!.cacheContent.yamlWorkflow).toBe('updated-workflow');

    // But file should remain unchanged
    const fileContent = readFileSync(cacheFilePath!, 'utf-8');
    expect(fileContent).toContain('existing-workflow');
    expect(fileContent).not.toContain('updated-workflow');
    expect(fileContent).not.toContain('new-workflow');
  });
});

describe('TaskCache write-only mode', () => {
  it('should skip matching existing cache records', () => {
    const cacheFilePath = prepareCache([
      {
        type: 'plan',
        prompt: 'write-only-plan',
        yamlWorkflow: 'write-only-workflow',
      },
    ]);

    const cache = new TaskCache(uuid(), true, cacheFilePath, {
      writeOnly: true,
    });

    expect(cache.writeOnlyMode).toBe(true);
    expect(cache.readOnlyMode).toBe(false);
    expect(cache.isCacheResultUsed).toBe(false);
    expect(cache.cacheOriginalLength).toBe(0);
    expect(cache.matchPlanCache('write-only-plan')).toBeUndefined();
  });

  it('should flush appended caches to disk in write-only mode', () => {
    const cacheId = uuid();
    const cache = new TaskCache(cacheId, true, undefined, {
      writeOnly: true,
    });

    cache.appendCache({
      type: 'plan',
      prompt: 'fresh-write-only',
      yamlWorkflow: 'fresh-workflow',
    });

    expect(existsSync(cache.cacheFilePath!)).toBe(true);
    const content = readFileSync(cache.cacheFilePath!, 'utf-8');
    expect(content).toContain('fresh-write-only');
    expect(content).toContain('fresh-workflow');
    expect(cache.matchPlanCache('fresh-write-only')).toBeUndefined();
  });

  it('should throw when both readOnly and writeOnly are enabled', () => {
    expect(
      () =>
        new TaskCache(uuid(), true, undefined, {
          readOnly: true,
          writeOnly: true,
        }),
    ).toThrow('TaskCache cannot be both read-only and write-only');
  });
});

describe('TaskCache filename length logic', () => {
  const DEFAULT = 200;

  it('should not hash if cacheId is within max length (default)', () => {
    const base = 'a'.repeat(DEFAULT - 10);
    const cache = new TaskCache(base, true);
    // Should keep original id, no hash
    expect(cache.cacheId.startsWith(base)).toBe(true);
    expect(cache.cacheId.length).toBeLessThanOrEqual(DEFAULT + 10); // allow small difference
    expect(cache.cacheFilePath).toContain(base);
  });

  it('should hash if cacheId exceeds max length (default)', () => {
    const longId = 'b'.repeat(DEFAULT + 50);
    const cache = new TaskCache(longId, true);
    // Prefix keeps first 32 chars, then '-' and hash
    expect(cache.cacheId.startsWith(`${'b'.repeat(32)}-`)).toBe(true);
    // Hash part should be non-empty and short
    const hashPart = cache.cacheId.split('-')[1];
    expect(hashPart.length).toBeGreaterThan(0);
    expect(cache.cacheId.length).toBeLessThanOrEqual(32 + 1 + 50); // 32+1+hash
    // File name should not contain the full original id
    expect(cache.cacheFilePath).not.toContain(longId);
  });

  it('should preserve readable prefix in hashed cacheId', () => {
    const prefix = 'readable-prefix-';
    const longId = prefix + 'x'.repeat(DEFAULT + 50);
    const cache = new TaskCache(longId, true);
    // Prefix should be preserved
    expect(cache.cacheId.startsWith(prefix)).toBe(true);
    expect(cache.cacheId.length).toBeLessThanOrEqual(32 + 1 + 50);
  });
});

describe('TaskCache manual cleaning with flushCacheToFile', () => {
  it('should remove unused cache records when flushing with cleanUnused: true', () => {
    const cacheFilePath = prepareCache([
      {
        type: 'plan',
        prompt: 'step1',
        yamlWorkflow: 'workflow1',
      },
      {
        type: 'plan',
        prompt: 'step2',
        yamlWorkflow: 'workflow2',
      },
      {
        type: 'plan',
        prompt: 'step3',
        yamlWorkflow: 'workflow3',
      },
    ]);

    const cache = new TaskCache(uuid(), true, cacheFilePath);
    expect(cache.cacheOriginalLength).toBe(3);

    // Only use 2 of them
    cache.matchPlanCache('step1'); // Used
    cache.matchPlanCache('step3'); // Used
    // step2 is not used

    // Flush with cleaning
    cache.flushCacheToFile({ cleanUnused: true });

    // Should only have 2 records left
    expect(cache.cache.caches.length).toBe(2);
    expect(cache.cache.caches[0].prompt).toBe('step1');
    expect(cache.cache.caches[1].prompt).toBe('step3');
  });

  it('should keep newly added caches even if not used', () => {
    const cacheFilePath = prepareCache([
      {
        type: 'plan',
        prompt: 'old',
        yamlWorkflow: 'old-workflow',
      },
    ]);

    const cache = new TaskCache(uuid(), true, cacheFilePath);
    expect(cache.cacheOriginalLength).toBe(1);

    // Don't use old cache, add new cache
    cache.appendCache({
      type: 'plan',
      prompt: 'new',
      yamlWorkflow: 'new-workflow',
    });

    // Flush with cleaning
    cache.flushCacheToFile({ cleanUnused: true });

    // Old unused should be removed, new should be kept
    expect(cache.cache.caches.length).toBe(1);
    expect(cache.cache.caches[0].prompt).toBe('new');
  });

  it('should keep all used and new caches', () => {
    const cacheFilePath = prepareCache([
      {
        type: 'plan',
        prompt: 'used-old',
        yamlWorkflow: 'workflow1',
      },
      {
        type: 'plan',
        prompt: 'unused-old',
        yamlWorkflow: 'workflow2',
      },
    ]);

    const cache = new TaskCache(uuid(), true, cacheFilePath);
    expect(cache.cacheOriginalLength).toBe(2);

    // Use one old cache
    cache.matchPlanCache('used-old');

    // Add new cache
    cache.appendCache({
      type: 'plan',
      prompt: 'new',
      yamlWorkflow: 'new-workflow',
    });

    // Flush with cleaning
    cache.flushCacheToFile({ cleanUnused: true });

    // Should keep used old + new, remove unused old
    expect(cache.cache.caches.length).toBe(2);
    expect(cache.cache.caches[0].prompt).toBe('used-old');
    expect(cache.cache.caches[1].prompt).toBe('new');
  });

  it('should not clean in write-only mode', () => {
    const cacheFilePath = prepareCache([
      {
        type: 'plan',
        prompt: 'test',
        yamlWorkflow: 'workflow',
      },
    ]);

    const cache = new TaskCache(uuid(), true, cacheFilePath, {
      writeOnly: true,
    });

    // write-only mode should not clean
    cache.flushCacheToFile({ cleanUnused: true });

    // Cache should remain unchanged (though write-only doesn't actually load)
    expect(cache.cache.caches.length).toBe(0); // write-only doesn't load
    expect(cache.isCacheResultUsed).toBe(false);
  });

  it('should clean and flush to file in read-only mode', () => {
    const cacheFilePath = prepareCache([
      {
        type: 'plan',
        prompt: 'used',
        yamlWorkflow: 'workflow1',
      },
      {
        type: 'plan',
        prompt: 'unused',
        yamlWorkflow: 'workflow2',
      },
    ]);

    const cache = new TaskCache(uuid(), true, cacheFilePath, {
      readOnly: true,
    });
    cache.matchPlanCache('used');

    // Flush with cleaning (should work in read-only mode)
    cache.flushCacheToFile({ cleanUnused: true });

    // Should be cleaned in memory
    expect(cache.cache.caches.length).toBe(1);

    // And file should be updated (manual flush overrides read-only)
    const fileContent = readFileSync(cacheFilePath, 'utf-8');
    const parsedContent = yaml.load(fileContent) as any;
    expect(parsedContent.caches.length).toBe(1); // File should be updated
    expect(parsedContent.caches[0].prompt).toBe('used');
  });

  it('should handle empty cache gracefully', () => {
    const cache = new TaskCache(uuid(), true);
    expect(cache.cacheOriginalLength).toBe(0);

    // Flush empty cache with cleaning
    cache.flushCacheToFile({ cleanUnused: true });

    // Should remain empty
    expect(cache.cache.caches.length).toBe(0);
  });

  it('should handle case where all caches are used', () => {
    const cacheFilePath = prepareCache([
      {
        type: 'plan',
        prompt: 'step1',
        yamlWorkflow: 'workflow1',
      },
      {
        type: 'plan',
        prompt: 'step2',
        yamlWorkflow: 'workflow2',
      },
    ]);

    const cache = new TaskCache(uuid(), true, cacheFilePath);

    // Use all caches
    cache.matchPlanCache('step1');
    cache.matchPlanCache('step2');

    // Flush with cleaning
    cache.flushCacheToFile({ cleanUnused: true });

    // All should be kept
    expect(cache.cache.caches.length).toBe(2);
  });

  it('should work with mixed plan and locate caches', () => {
    const cacheFilePath = prepareCache([
      {
        type: 'plan',
        prompt: 'plan-used',
        yamlWorkflow: 'workflow1',
      },
      {
        type: 'plan',
        prompt: 'plan-unused',
        yamlWorkflow: 'workflow2',
      },
      {
        type: 'locate',
        prompt: 'locate-used',
        cache: { xpaths: ['xpath1'] },
      },
      {
        type: 'locate',
        prompt: 'locate-unused',
        cache: { xpaths: ['xpath2'] },
      },
    ]);

    const cache = new TaskCache(uuid(), true, cacheFilePath);

    // Use some of them
    cache.matchPlanCache('plan-used');
    cache.matchLocateCache('locate-used');

    // Flush with cleaning
    cache.flushCacheToFile({ cleanUnused: true });

    // Only used ones should remain
    expect(cache.cache.caches.length).toBe(2);
    expect(cache.cache.caches[0].prompt).toBe('plan-used');
    expect(cache.cache.caches[1].prompt).toBe('locate-used');
  });
});
