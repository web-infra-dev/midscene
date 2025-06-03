import { existsSync, readFileSync } from 'node:fs';
import path, { join } from 'node:path';
import {
  type LocateCache,
  type PlanningCache,
  TaskCache,
} from '@/common/task-cache';
import { cacheFileExt } from '@/common/task-cache';
import { getMidsceneRunSubDir } from '@midscene/shared/common';
import { uuid } from '@midscene/shared/utils';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../package.json', () => {
  return {
    version: '0.16.11',
  };
});

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

describe(
  'TaskCache',
  () => {
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
      expect(cacheContent).toMatchSnapshot();

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
      expect(firstMatch?.cacheContent.yamlWorkflow).toBe(
        'test-yaml-workflow-1',
      );

      // should be able to match the second record
      const secondMatch = newCache.matchPlanCache('test-prompt');
      expect(secondMatch).toBeDefined();
      expect(secondMatch?.cacheContent.yamlWorkflow).toBe(
        'test-yaml-workflow-2',
      );

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
      const locateCachedXpaths = ['test-xpath-1', 'test-xpath-2'];

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
            xpaths: locateCachedXpaths,
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

      const cachedLocateCache =
        newTaskCache.matchLocateCache(locateCachedPrompt);
      const {
        cacheContent: cachedLocateCacheContent,
        updateFn: cachedLocateCacheUpdateFn,
      } = cachedLocateCache!;
      expect(cachedLocateCacheContent.prompt).toBe(locateCachedPrompt);
      expect(cachedLocateCacheContent.xpaths).toEqual(locateCachedXpaths);

      expect(newTaskCache.cache.caches).toMatchSnapshot();

      // test update cache
      cachedLocateCacheUpdateFn((cache) => {
        cache.xpaths = ['test-xpath-3', 'test-xpath-4'];
      });

      expect(newTaskCache.cache.caches).toMatchSnapshot();
      const cacheFileContent = readFileSync(
        newTaskCache.cacheFilePath!,
        'utf-8',
      ).replace(newTaskCache.cacheId, 'cacheId');
      expect(cacheFileContent).toMatchSnapshot();
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
        xpaths: ['test-xpath'],
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
  },
  { timeout: 20000 },
);
