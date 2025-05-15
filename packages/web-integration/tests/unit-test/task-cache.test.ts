import { existsSync, readFileSync } from 'node:fs';
import { TaskCache } from '@/common/task-cache';
import { uuid } from '@midscene/shared/utils';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

// Mock package.json 版本号
vi.mock('../../package.json', () => {
  return {
    version: '0.16.11',
  };
});

describe(
  'TaskCache',
  () => {
    beforeAll(() => {
      // 确保测试使用固定的版本号
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

    it('one cache record can only be matched once', () => {
      const cacheId = uuid();
      const cache = new TaskCache(cacheId, true);

      cache.appendCache({
        type: 'plan',
        prompt: 'test-prompt',
        yamlWorkflow: 'test-yaml-workflow',
      });

      expect(cache.matchPlanCache('test-prompt')).toBeDefined();
      expect(cache.matchPlanCache('test-prompt')).toBeUndefined();
    });

    let cacheFilePath: string;
    it('save and retrieve cache', () => {
      const cacheId = uuid();
      const taskCache = new TaskCache(cacheId, true);

      const planningCachedPrompt = 'test';
      const planningCachedYamlWorkflow = 'test-yaml-workflow';

      const locateCachedPrompt = 'test-locate';
      const locateCachedXpaths = ['test-xpath-1', 'test-xpath-2'];

      taskCache.appendCache({
        type: 'plan',
        prompt: planningCachedPrompt,
        yamlWorkflow: planningCachedYamlWorkflow,
      });

      taskCache.appendCache({
        type: 'locate',
        prompt: locateCachedPrompt,
        xpaths: locateCachedXpaths,
      });

      const cachedPlanCache = taskCache.matchPlanCache(planningCachedPrompt);
      const { cacheContent: cachedPlanCacheContent } = cachedPlanCache!;
      expect(cachedPlanCacheContent.prompt).toBe(planningCachedPrompt);
      expect(cachedPlanCacheContent.yamlWorkflow).toBe(
        planningCachedYamlWorkflow,
      );

      const cachedLocateCache = taskCache.matchLocateCache(locateCachedPrompt);
      const {
        cacheContent: cachedLocateCacheContent,
        updateFn: cachedLocateCacheUpdateFn,
      } = cachedLocateCache!;
      expect(cachedLocateCacheContent.prompt).toBe(locateCachedPrompt);
      expect(cachedLocateCacheContent.xpaths).toEqual(locateCachedXpaths);

      cacheFilePath = taskCache.cacheFilePath!;

      expect(taskCache.cache.caches).toMatchSnapshot();

      cachedLocateCacheUpdateFn((cache) => {
        cache.xpaths = ['test-xpath-3', 'test-xpath-4'];
      });

      expect(taskCache.cache.caches).toMatchSnapshot();
      const cacheFileContent = readFileSync(
        taskCache.cacheFilePath!,
        'utf-8',
      ).replace(cacheId, 'cacheId');
      expect(cacheFileContent).toMatchSnapshot();
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
