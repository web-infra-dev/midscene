import { existsSync, readFileSync } from 'node:fs';
import { TaskCache } from '@/common/task-cache';
import { uuid } from '@midscene/shared/utils';
import { describe, expect, it } from 'vitest';

describe(
  'TaskCache',
  () => {
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
      expect(
        readFileSync(cache.cacheFilePath!, 'utf-8').replace(cacheId, 'cacheId'),
      ).toMatchSnapshot();

      expect(cache.isCacheResultUsed).toBe(true);
    });

    it('update or append cache record', () => {
      const cacheId = uuid();
      const cache = new TaskCache(cacheId, true);

      cache.updateOrAppendCacheRecord({
        type: 'plan',
        prompt: 'test-prompt',
        yamlWorkflow: 'test-yaml-workflow',
      });

      expect(cache.cache.caches.length).toBe(1);
      expect(cache.cache.caches).toMatchSnapshot();

      const existingRecord = cache.matchPlanCache('test-prompt');
      expect(existingRecord).toBeDefined();

      cache.updateOrAppendCacheRecord(
        {
          type: 'plan',
          prompt: 'test-prompt',
          yamlWorkflow: 'test-yaml-workflow-2',
        },
        existingRecord,
      );

      expect(cache.cache.caches.length).toBe(1);
      expect(cache.cache.caches).toMatchSnapshot();
    });

    let cacheFilePath: string;
    it('save and retrieve cache', () => {
      const cacheId = uuid();
      const cache = new TaskCache(cacheId, true);

      const planningCachedPrompt = 'test';
      const planningCachedYamlWorkflow = 'test-yaml-workflow';

      const locateCachedPrompt = 'test-locate';
      const locateCachedXpaths = ['test-xpath-1', 'test-xpath-2'];

      cache.appendCache({
        type: 'plan',
        prompt: planningCachedPrompt,
        yamlWorkflow: planningCachedYamlWorkflow,
      });

      cache.appendCache({
        type: 'locate',
        prompt: locateCachedPrompt,
        xpaths: locateCachedXpaths,
      });

      const cachedPlanCache = cache.matchPlanCache(planningCachedPrompt);
      const { cacheContent: cachedPlanCacheContent } = cachedPlanCache!;
      expect(cachedPlanCacheContent.prompt).toBe(planningCachedPrompt);
      expect(cachedPlanCacheContent.yamlWorkflow).toBe(
        planningCachedYamlWorkflow,
      );

      const cachedLocateCache = cache.matchLocateCache(locateCachedPrompt);
      const {
        cacheContent: cachedLocateCacheContent,
        updateFn: cachedLocateCacheUpdateFn,
      } = cachedLocateCache!;
      expect(cachedLocateCacheContent.prompt).toBe(locateCachedPrompt);
      expect(cachedLocateCacheContent.xpaths).toEqual(locateCachedXpaths);

      cacheFilePath = cache.cacheFilePath!;

      expect(cache.cache).toMatchSnapshot();

      cachedLocateCacheUpdateFn((cache) => {
        cache.xpaths = ['test-xpath-3', 'test-xpath-4'];
      });

      expect(cache.cache).toMatchSnapshot();
      expect(
        readFileSync(cache.cacheFilePath!, 'utf-8').replace(cacheId, 'cacheId'),
      ).toMatchSnapshot();
    });

    it('load cache from file', () => {
      const cache = new TaskCache(uuid(), true, cacheFilePath);
      expect(cache.cacheFilePath).toBe(cacheFilePath);
      expect(cache.cache).toBeDefined();
      expect(cache.cache.caches.length).toBe(2);
    });
  },
  { timeout: 20000 },
);
