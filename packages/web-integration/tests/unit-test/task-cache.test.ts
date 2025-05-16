import { existsSync, readFileSync } from 'node:fs';
import {
  TaskCache,
  type LocateCache,
  type PlanningCache,
} from '@/common/task-cache';
import { uuid } from '@midscene/shared/utils';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('../../package.json', () => {
  return {
    version: '0.16.11',
  };
});

const prepareCache = (caches: (PlanningCache | LocateCache)[]) => {
  const cache = new TaskCache(uuid(), true);

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
      const planningCachedPrompt = 'test';
      const planningCachedYamlWorkflow = 'test-yaml-workflow';

      const locateCachedPrompt = 'test-locate';
      const locateCachedXpaths = ['test-xpath-1', 'test-xpath-2'];

      const cacheFilePath = prepareCache([
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
      ]);

      const newTaskCache = new TaskCache(uuid(), true, cacheFilePath);

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
  },
  { timeout: 20000 },
);
