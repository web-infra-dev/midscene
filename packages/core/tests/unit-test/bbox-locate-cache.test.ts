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
import { ScreenshotItem } from '@/screenshot-item';
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

// Helper function to create mock UIContext with ScreenshotItem
const createMockUIContext = async (
  screenshotData: string,
  size = { width: 1920, height: 1080, dpr: 1 },
) => {
  const screenshot = ScreenshotItem.create(screenshotData);
  return { screenshot, size };
};

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
    modelFamily: undefined,
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
      actionSpace: vi.fn().mockReturnValue([
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
      cacheFeatureForPoint: vi.fn().mockResolvedValue({
        xpaths: ['/html/body/input[1]'],
        texts: ['search box'],
      }),
      rectMatchesCacheFeature: vi.fn().mockResolvedValue(undefined),
    } as unknown as AbstractInterface;

    // Create mock service with typed methods
    mockService = {
      contextRetrieverFn: vi.fn().mockImplementation(async () => {
        const screenshot = ScreenshotItem.create(validBase64Image);
        return {
          screenshot,
          size: { width: 1920, height: 1080, dpr: 1 },
          tree: {
            id: 'root',
            attributes: {},
            children: [],
          },
        };
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
      actionSpace: mockInterface.actionSpace(),
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
        uiContext: await createMockUIContext(validBase64Image),
      });

      // Verify element was found using bbox (plan hit)
      expect(result).toBeDefined();
      expect(result!.output.element).toBeDefined();
      expect(result!.hitBy?.from).toBe('Plan');

      // Verify cacheFeatureForPoint was called to write cache
      expect(mockInterface.cacheFeatureForPoint).toHaveBeenCalled();

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
        uiContext: await createMockUIContext(validBase64Image),
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
        actionSpace: mockInterface.actionSpace(),
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
      vi.mocked(mockInterface.cacheFeatureForPoint!).mockClear();

      await locateTask!.executor(locateTask!.param, {
        task: {
          type: 'Planning',
          subType: 'Locate',
          param: locateTask!.param,
          status: 'running',
          timing: { start: Date.now(), end: 0, cost: 0 },
          executor: locateTask!.executor,
        },
        uiContext: await createMockUIContext(validBase64Image),
      });

      // Verify cacheFeatureForPoint was NOT called (cache already exists)
      expect(mockInterface.cacheFeatureForPoint).not.toHaveBeenCalled();
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
        actionSpace: mockInterface.actionSpace(),
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
        uiContext: await createMockUIContext(validBase64Image),
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
        uiContext: await createMockUIContext(validBase64Image),
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
        uiContext: await createMockUIContext(validBase64Image),
      });

      // Verify cacheFeatureForPoint was NOT called (cacheable: false)
      expect(mockInterface.cacheFeatureForPoint).not.toHaveBeenCalled();

      // Verify cache was NOT written
      const cachedLocate = findLocateCacheByPrompt(
        taskCache,
        'no cache element',
      );
      expect(cachedLocate).toBeUndefined();
    });

    it('should handle cacheFeatureForPoint returning empty object', async () => {
      // Mock cacheFeatureForPoint to return empty object
      vi.mocked(mockInterface.cacheFeatureForPoint!).mockResolvedValue({});

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
        uiContext: await createMockUIContext(validBase64Image),
      });

      expect(result).toBeDefined();
      expect(result!.output.element).toBeDefined();

      // Cache should NOT be written when cacheFeatureForPoint returns empty
      const cachedLocate = findLocateCacheByPrompt(
        taskCache,
        'element with no cache features',
      );
      expect(cachedLocate).toBeUndefined();
    });
  });

  describe('cache invalidation and update', () => {
    it('should update cache when cached xpath becomes invalid (DOM changed)', async () => {
      // Scenario: Cached xpath is invalid, AI re-locates successfully, cache should be updated
      // This tests the fix for the bug where cache was not updated after validation failure

      // 1. Create pre-populated cache (simulates first run)
      const cacheId = uuid();
      const testCache = new TaskCache(cacheId, true);
      const internal = getTaskCacheInternal(testCache);
      internal.cache.caches.push({
        type: 'locate',
        prompt: '高一',
        cache: {
          xpaths: ['/html/body/div[1]/label[2]'], // Old invalid xpath
        },
      });
      internal.cacheOriginalLength = 1;

      // 2. Mock rectMatchesCacheFeature to reject (simulates xpath validation failure)
      vi.mocked(mockInterface.rectMatchesCacheFeature!).mockRejectedValue(
        new Error(
          'No matching element rect found for the provided cache feature',
        ),
      );

      // 3. Mock AI locate to return new element with new xpath
      vi.mocked(mockService.locate).mockResolvedValue({
        element: {
          id: 'new-element',
          center: [600, 400],
          rect: { left: 550, top: 380, width: 100, height: 40 },
          xpaths: ['/html/body/div[2]/label[1]'], // New valid xpath
          attributes: {},
        },
        dump: {},
      });

      // 4. Mock cacheFeatureForPoint to return new xpath
      vi.mocked(mockInterface.cacheFeatureForPoint!).mockResolvedValue({
        xpaths: ['/html/body/div[2]/label[1]'],
        texts: ['高一'],
      });

      // 5. Create taskBuilder with pre-populated cache
      const taskBuilderWithCache = new TaskBuilder({
        interfaceInstance: mockInterface,
        service: mockService,
        taskCache: testCache,
        actionSpace: mockInterface.actionSpace(),
      });

      const plans = [
        {
          type: 'Tap',
          param: {
            locate: {
              prompt: '高一',
              // No bbox - will try cache hit
            },
          },
          thought: 'tap 高一',
        },
      ];

      const { tasks } = await taskBuilderWithCache.build(
        plans,
        mockModelConfig,
        mockModelConfig,
      );

      const locateTask = tasks.find((task) => task.subType === 'Locate');
      expect(locateTask).toBeDefined();

      await locateTask!.executor(locateTask!.param, {
        task: {
          type: 'Planning',
          subType: 'Locate',
          param: locateTask!.param,
          status: 'running',
          timing: { start: Date.now(), end: 0, cost: 0 },
          executor: locateTask!.executor,
        },
        uiContext: await createMockUIContext(validBase64Image),
      });

      // 6. Verify:
      // - rectMatchesCacheFeature was called (attempted cache hit)
      expect(mockInterface.rectMatchesCacheFeature).toHaveBeenCalledWith({
        xpaths: ['/html/body/div[1]/label[2]'],
      });

      // - AI locate was called (cache hit failed, fallback to AI)
      expect(mockService.locate).toHaveBeenCalled();

      // - cacheFeatureForPoint was called (get new xpath)
      expect(mockInterface.cacheFeatureForPoint).toHaveBeenCalled();

      // - Cache was updated with new xpath (not the old one)
      const updatedCache = findLocateCacheByPrompt(testCache, '高一');
      expect(updatedCache).toBeDefined();
      expect(updatedCache?.cache).toBeDefined();
      expect(updatedCache?.cache?.xpaths).toContain(
        '/html/body/div[2]/label[1]',
      );
      expect(updatedCache?.cache?.xpaths).not.toContain(
        '/html/body/div[1]/label[2]',
      );
    });

    it('should update cache when cache validation fails for non-plan-hit scenarios', async () => {
      // Scenario: Cache exists but validation fails, AI relocates, cache should be updated
      // This is distinct from plan hit, where we want to avoid redundant writes

      const cacheId = uuid();
      const testCache = new TaskCache(cacheId, true);
      const internal = getTaskCacheInternal(testCache);
      internal.cache.caches.push({
        type: 'locate',
        prompt: 'submit button',
        cache: {
          xpaths: ['/html/body/button[1]'], // Old xpath
        },
      });
      internal.cacheOriginalLength = 1;

      // Mock validation failure
      vi.mocked(mockInterface.rectMatchesCacheFeature!).mockRejectedValue(
        new Error('Element not found'),
      );

      // Mock AI locate success with new xpath
      vi.mocked(mockService.locate).mockResolvedValue({
        element: {
          id: 'submit-btn',
          center: [500, 300],
          rect: { left: 450, top: 280, width: 100, height: 40 },
          xpaths: ['/html/body/form[1]/button[1]'], // New xpath
          attributes: {},
        },
        dump: {},
      });

      vi.mocked(mockInterface.cacheFeatureForPoint!).mockResolvedValue({
        xpaths: ['/html/body/form[1]/button[1]'],
        texts: ['Submit'],
      });

      const taskBuilderWithCache = new TaskBuilder({
        interfaceInstance: mockInterface,
        service: mockService,
        taskCache: testCache,
        actionSpace: mockInterface.actionSpace(),
      });

      const plansWithoutBbox = [
        {
          type: 'Tap',
          param: {
            locate: {
              prompt: 'submit button',
              // No bbox - not a plan hit
            },
          },
          thought: 'tap submit',
        },
      ];

      const { tasks } = await taskBuilderWithCache.build(
        plansWithoutBbox,
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
        uiContext: await createMockUIContext(validBase64Image),
      });

      // Verify cache was updated
      const updatedCache = findLocateCacheByPrompt(testCache, 'submit button');
      expect(updatedCache).toBeDefined();
      expect(updatedCache?.cache?.xpaths).toContain(
        '/html/body/form[1]/button[1]',
      );
      expect(updatedCache?.cache?.xpaths).not.toContain('/html/body/button[1]');
    });
  });
});
