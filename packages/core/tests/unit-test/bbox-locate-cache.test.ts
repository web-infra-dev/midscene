/**
 * Test for bbox locate cache bug fix
 *
 * Bug description:
 * When planning returns actions with bbox coordinates (includeBboxInPlanning=true),
 * the locate cache was not being written. This caused:
 * - 1st execution: only plan cache written
 * - 2nd execution: plan cache hit, but locate needs AI call
 * - 3rd execution: both plan and locate cache hit
 *
 * After fix:
 * - 1st execution: both plan and locate cache written
 * - 2nd execution: both plan and locate cache hit
 */
import { type LocateCache, TaskCache } from '@/agent';
import { TaskBuilder } from '@/agent/task-builder';
import type { AbstractInterface } from '@/device';
import type Service from '@/service';
import type { IModelConfig } from '@midscene/shared/env';
import { uuid } from '@midscene/shared/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getMidsceneLocationSchema, z } from '../../src';

/**
 * Type for accessing TaskCache internal state in tests
 * @internal Only for testing purposes
 */
interface TaskCacheInternal {
  cache: {
    caches: LocateCache[];
  };
  cacheOriginalLength: number;
}

/**
 * Get internal cache state for testing
 * @internal Only for testing purposes
 */
function getTaskCacheInternal(taskCache: TaskCache): TaskCacheInternal {
  return taskCache as unknown as TaskCacheInternal;
}

describe('bbox locate cache fix', () => {
  let taskBuilder: TaskBuilder;
  let mockInterface: AbstractInterface;
  let mockService: Service;
  let taskCache: TaskCache;

  // Create a minimal valid PNG base64 image (1x1 transparent pixel)
  const validBase64Image =
    'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

  // Mock model config with required properties for testing
  const mockModelConfig: IModelConfig = {
    vlMode: undefined,
    modelName: 'test-model',
    modelDescription: 'test model for unit tests',
    intent: 'default',
  };

  beforeEach(() => {
    // Create mock interface with typed methods
    mockInterface = {
      interfaceType: 'web',
      screenshotBase64: vi.fn().mockResolvedValue(validBase64Image),
      size: vi.fn().mockResolvedValue({ width: 1920, height: 1080, dpr: 1 }),
      actionSpace: vi.fn().mockResolvedValue([
        {
          name: 'Tap',
          paramSchema: z.object({
            locate: getMidsceneLocationSchema(),
          }),
          call: vi.fn().mockResolvedValue({}),
        },
        {
          name: 'Input',
          paramSchema: z.object({
            locate: getMidsceneLocationSchema(),
            value: z.string(),
          }),
          call: vi.fn().mockResolvedValue({}),
        },
      ]),
      cacheFeatureForRect: vi.fn().mockResolvedValue({
        xpaths: ['/html/body/input[1]'],
        texts: ['search box'],
      }),
      rectMatchesCacheFeature: vi.fn().mockResolvedValue(undefined),
    } as unknown as AbstractInterface;

    // Create mock service with typed methods
    mockService = {
      contextRetrieverFn: vi.fn().mockResolvedValue({
        screenshotBase64: validBase64Image,
        size: { width: 1920, height: 1080, dpr: 1 },
        tree: {
          id: 'root',
          attributes: {},
          children: [],
        },
      }),
      locate: vi.fn().mockResolvedValue({
        element: {
          id: 'element-id',
          center: [500, 300],
          rect: { left: 450, top: 280, width: 100, height: 40 },
          xpaths: ['/html/body/input[1]'],
          attributes: {},
        },
        dump: {},
      }),
    } as unknown as Service;

    // Create task cache
    taskCache = new TaskCache(uuid(), true);

    // Create task builder
    taskBuilder = new TaskBuilder({
      interfaceInstance: mockInterface,
      service: mockService,
      taskCache,
    });
  });

  /**
   * Helper function to find cache entry by prompt
   * Uses getTaskCacheInternal to access internal state
   */
  const findLocateCacheByPrompt = (
    cache: TaskCache,
    prompt: string,
  ): LocateCache | undefined => {
    const internal = getTaskCacheInternal(cache);
    return internal.cache.caches.find(
      (c) => c.type === 'locate' && c.prompt === prompt,
    );
  };

  describe('when planning returns actions with bbox', () => {
    it('should write locate cache even when bbox is used for positioning', async () => {
      // Mock planning result with bbox (simulates includeBboxInPlanning=true)
      const plansWithBbox = [
        {
          type: 'Tap',
          param: {
            locate: {
              prompt: 'search input box',
              bbox: [450, 280, 550, 320] as [number, number, number, number],
            },
          },
          thought: 'tap the search box',
        },
      ];

      // Convert plans to executable tasks
      const { tasks } = await taskBuilder.build(
        plansWithBbox,
        mockModelConfig,
        mockModelConfig,
        { cacheable: true },
      );

      // Find the locate task
      const locateTask = tasks.find((task) => task.subType === 'Locate');
      expect(locateTask).toBeDefined();

      // Execute the locate task
      const result = await locateTask!.executor(locateTask!.param, {
        task: {
          type: 'Planning',
          subType: 'Locate',
          param: locateTask!.param,
          status: 'running',
          timing: { start: Date.now(), end: 0, cost: 0 },
          executor: locateTask!.executor,
        },
        uiContext: {
          screenshotBase64: validBase64Image,
          size: { width: 1920, height: 1080, dpr: 1 },
        },
      });

      // Verify element was found using bbox (plan hit)
      expect(result).toBeDefined();
      expect(result!.output.element).toBeDefined();
      expect(result!.hitBy?.from).toBe('Plan');

      // Verify cacheFeatureForRect was called to write cache
      expect(mockInterface.cacheFeatureForRect).toHaveBeenCalled();

      // Verify locate cache was written (check internal cache array directly)
      const cachedLocate = findLocateCacheByPrompt(
        taskCache,
        'search input box',
      );
      expect(cachedLocate).toBeDefined();
      expect(cachedLocate?.cache).toBeDefined();
      expect(cachedLocate?.cache?.xpaths).toContain('/html/body/input[1]');
    });

    it('should not call AI locate when bbox is available', async () => {
      const plansWithBbox = [
        {
          type: 'Tap',
          param: {
            locate: {
              prompt: 'submit button',
              bbox: [100, 200, 200, 250] as [number, number, number, number],
            },
          },
          thought: 'tap submit',
        },
      ];

      const { tasks } = await taskBuilder.build(
        plansWithBbox,
        mockModelConfig,
        mockModelConfig,
      );

      const locateTask = tasks.find((task) => task.subType === 'Locate');

      await locateTask!.executor(locateTask!.param, {
        task: {
          type: 'Planning',
          subType: 'Locate',
          param: locateTask!.param,
          status: 'running',
          timing: { start: Date.now(), end: 0, cost: 0 },
          executor: locateTask!.executor,
        },
        uiContext: {
          screenshotBase64: validBase64Image,
          size: { width: 1920, height: 1080, dpr: 1 },
        },
      });

      // Verify AI locate was NOT called (bbox was used instead)
      expect(mockService.locate).not.toHaveBeenCalled();
    });

    it('should skip cache write if cache already exists (pre-populated)', async () => {
      // Create a new TaskCache with pre-populated cache
      // The cache must exist BEFORE TaskCache initialization for matchLocateCache to find it
      const cacheId = uuid();
      const prePopulatedTaskCache = new TaskCache(cacheId, true);

      // Add cache entry directly to internal storage using helper
      const internal = getTaskCacheInternal(prePopulatedTaskCache);
      internal.cache.caches.push({
        type: 'locate',
        prompt: 'existing element',
        cache: {
          xpaths: ['/html/body/div[1]'],
        },
      });
      // Update the original length so matchLocateCache can find it
      internal.cacheOriginalLength = 1;

      // Create new task builder with pre-populated cache
      const taskBuilderWithCache = new TaskBuilder({
        interfaceInstance: mockInterface,
        service: mockService,
        taskCache: prePopulatedTaskCache,
      });

      const plansWithBbox = [
        {
          type: 'Tap',
          param: {
            locate: {
              prompt: 'existing element',
              bbox: [100, 100, 200, 150] as [number, number, number, number],
            },
          },
          thought: 'tap existing element',
        },
      ];

      const { tasks } = await taskBuilderWithCache.build(
        plansWithBbox,
        mockModelConfig,
        mockModelConfig,
      );

      const locateTask = tasks.find((task) => task.subType === 'Locate');

      // Clear the mock to track new calls
      vi.mocked(mockInterface.cacheFeatureForRect!).mockClear();

      await locateTask!.executor(locateTask!.param, {
        task: {
          type: 'Planning',
          subType: 'Locate',
          param: locateTask!.param,
          status: 'running',
          timing: { start: Date.now(), end: 0, cost: 0 },
          executor: locateTask!.executor,
        },
        uiContext: {
          screenshotBase64: validBase64Image,
          size: { width: 1920, height: 1080, dpr: 1 },
        },
      });

      // Verify cacheFeatureForRect was NOT called (cache already exists)
      expect(mockInterface.cacheFeatureForRect).not.toHaveBeenCalled();
    });
  });

  describe('cache hit on second execution', () => {
    it('should hit locate cache on second execution without bbox', async () => {
      // Create cache with proper initialization for cache reading
      const cacheId = uuid();
      const testCache = new TaskCache(cacheId, true);

      // Simulate first execution that writes cache using helper
      const internal = getTaskCacheInternal(testCache);
      internal.cache.caches.push({
        type: 'locate',
        prompt: 'login button',
        cache: {
          xpaths: ['/html/body/button[1]'],
        },
      });
      // Update cacheOriginalLength to include this cache entry
      internal.cacheOriginalLength = 1;

      // Create task builder with this cache
      const taskBuilderWithCache = new TaskBuilder({
        interfaceInstance: mockInterface,
        service: mockService,
        taskCache: testCache,
      });

      // Mock rectMatchesCacheFeature to return a rect (simulating cache hit)
      vi.mocked(mockInterface.rectMatchesCacheFeature!).mockResolvedValue({
        left: 300,
        top: 400,
        width: 100,
        height: 50,
      });

      // Second execution: without bbox (simulates cached yaml execution)
      const plansWithoutBbox = [
        {
          type: 'Tap',
          param: {
            locate: {
              prompt: 'login button',
              // No bbox - simulates yaml cache execution
            },
          },
          thought: 'tap login',
        },
      ];

      const { tasks } = await taskBuilderWithCache.build(
        plansWithoutBbox,
        mockModelConfig,
        mockModelConfig,
      );

      const locateTask = tasks.find((task) => task.subType === 'Locate');
      const result = await locateTask!.executor(locateTask!.param, {
        task: {
          type: 'Planning',
          subType: 'Locate',
          param: locateTask!.param,
          status: 'running',
          timing: { start: Date.now(), end: 0, cost: 0 },
          executor: locateTask!.executor,
        },
        uiContext: {
          screenshotBase64: validBase64Image,
          size: { width: 1920, height: 1080, dpr: 1 },
        },
      });

      // Verify cache was hit
      expect(result).toBeDefined();
      expect(result!.hitBy?.from).toBe('Cache');

      // Verify AI locate was NOT called
      expect(mockService.locate).not.toHaveBeenCalled();
    });
  });

  describe('edge cases', () => {
    it('should handle empty prompt gracefully', async () => {
      const plansWithBbox = [
        {
          type: 'Tap',
          param: {
            locate: {
              prompt: '',
              bbox: [100, 100, 200, 150] as [number, number, number, number],
            },
          },
          thought: 'tap element',
        },
      ];

      const { tasks } = await taskBuilder.build(
        plansWithBbox,
        mockModelConfig,
        mockModelConfig,
      );

      const locateTask = tasks.find((task) => task.subType === 'Locate');

      // Should not throw even with empty prompt
      const result = await locateTask!.executor(locateTask!.param, {
        task: {
          type: 'Planning',
          subType: 'Locate',
          param: locateTask!.param,
          status: 'running',
          timing: { start: Date.now(), end: 0, cost: 0 },
          executor: locateTask!.executor,
        },
        uiContext: {
          screenshotBase64: validBase64Image,
          size: { width: 1920, height: 1080, dpr: 1 },
        },
      });

      expect(result).toBeDefined();
      expect(result!.output.element).toBeDefined();
    });

    it('should respect cacheable: false option', async () => {
      const plansWithBbox = [
        {
          type: 'Tap',
          param: {
            locate: {
              prompt: 'no cache element',
              bbox: [100, 100, 200, 150] as [number, number, number, number],
            },
          },
          thought: 'tap without cache',
        },
      ];

      const { tasks } = await taskBuilder.build(
        plansWithBbox,
        mockModelConfig,
        mockModelConfig,
        { cacheable: false },
      );

      const locateTask = tasks.find((task) => task.subType === 'Locate');

      await locateTask!.executor(locateTask!.param, {
        task: {
          type: 'Planning',
          subType: 'Locate',
          param: locateTask!.param,
          status: 'running',
          timing: { start: Date.now(), end: 0, cost: 0 },
          executor: locateTask!.executor,
        },
        uiContext: {
          screenshotBase64: validBase64Image,
          size: { width: 1920, height: 1080, dpr: 1 },
        },
      });

      // Verify cacheFeatureForRect was NOT called (cacheable: false)
      expect(mockInterface.cacheFeatureForRect).not.toHaveBeenCalled();

      // Verify cache was NOT written
      const cachedLocate = findLocateCacheByPrompt(
        taskCache,
        'no cache element',
      );
      expect(cachedLocate).toBeUndefined();
    });

    it('should handle cacheFeatureForRect returning empty object', async () => {
      // Mock cacheFeatureForRect to return empty object
      vi.mocked(mockInterface.cacheFeatureForRect!).mockResolvedValue({});

      const plansWithBbox = [
        {
          type: 'Tap',
          param: {
            locate: {
              prompt: 'element with no cache features',
              bbox: [100, 100, 200, 150] as [number, number, number, number],
            },
          },
          thought: 'tap element',
        },
      ];

      const { tasks } = await taskBuilder.build(
        plansWithBbox,
        mockModelConfig,
        mockModelConfig,
      );

      const locateTask = tasks.find((task) => task.subType === 'Locate');

      // Should not throw
      const result = await locateTask!.executor(locateTask!.param, {
        task: {
          type: 'Planning',
          subType: 'Locate',
          param: locateTask!.param,
          status: 'running',
          timing: { start: Date.now(), end: 0, cost: 0 },
          executor: locateTask!.executor,
        },
        uiContext: {
          screenshotBase64: validBase64Image,
          size: { width: 1920, height: 1080, dpr: 1 },
        },
      });

      expect(result).toBeDefined();
      expect(result!.output.element).toBeDefined();

      // Cache should NOT be written when cacheFeatureForRect returns empty
      const cachedLocate = findLocateCacheByPrompt(
        taskCache,
        'element with no cache features',
      );
      expect(cachedLocate).toBeUndefined();
    });
  });
});
