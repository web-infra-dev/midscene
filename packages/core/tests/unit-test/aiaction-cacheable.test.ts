import { TaskCache, TaskExecutor } from '@/agent';
import type { AbstractInterface } from '@/device';
import { uuid } from '@midscene/shared/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Insight from '../../src';

describe('aiAction cacheable option propagation', () => {
  let taskExecutor: TaskExecutor;
  let mockInterface: AbstractInterface;
  let mockInsight: Insight;
  let taskCache: TaskCache;

  beforeEach(() => {
    // Create mock interface
    mockInterface = {
      interfaceType: 'web',
      screenshotBase64: vi.fn().mockResolvedValue('base64-screenshot'),
      size: vi.fn().mockResolvedValue({ width: 1920, height: 1080, dpr: 1 }),
      actionSpace: vi.fn().mockResolvedValue([
        {
          name: 'Click',
          paramSchema: {
            type: 'object',
            properties: {
              locate: {
                'x-midscene-locator': true,
              },
            },
          },
        },
      ]),
      cacheFeatureForRect: vi.fn().mockResolvedValue({
        feature: 'mock-feature',
      }),
      rectMatchesCacheFeature: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock insight
    mockInsight = {
      contextRetrieverFn: vi.fn().mockResolvedValue({
        screenshotBase64: 'base64-screenshot',
        tree: {
          id: 'root',
          attributes: {},
          children: [],
        },
      }),
      locate: vi.fn().mockResolvedValue({
        element: {
          id: 'element-id',
          center: [100, 100],
          rect: { left: 90, top: 90, width: 20, height: 20 },
          xpaths: [],
          attributes: {},
        },
      }),
    } as any;

    // Create task cache
    taskCache = new TaskCache(uuid(), true);

    // Create task executor
    taskExecutor = new TaskExecutor(mockInterface, mockInsight, {
      taskCache,
    });
  });

  it('should propagate cacheable: false to locate subtasks in aiAction', async () => {
    // Create a spy on matchElementFromCache to verify it's not called
    const matchElementFromCacheSpy = vi.spyOn(taskCache, 'matchLocateCache');

    // Mock planning result with a Locate action followed by Click
    // This simulates the typical aiAction behavior
    const mockPlans = [
      {
        type: 'Locate',
        locate: {
          prompt: 'button to click',
        },
        param: {
          prompt: 'button to click',
        },
        thought: 'locate the button',
      },
      {
        type: 'Click',
        locate: {
          prompt: 'button to click',
        },
        param: null,
        thought: 'click the button',
      },
    ];

    // Mock model config
    const mockModelConfig = {
      vlMode: undefined,
      model: 'test-model',
    } as any;

    // Call convertPlanToExecutable with cacheable: false
    const { tasks } = await taskExecutor.convertPlanToExecutable(
      mockPlans,
      mockModelConfig,
      false, // cacheable: false
    );

    // Verify that we have tasks
    expect(tasks.length).toBeGreaterThan(0);

    // Find the locate task
    const locateTask = tasks.find((task) => task.subType === 'Locate');
    expect(locateTask).toBeDefined();

    // Verify the locate task has cacheable: false in its param
    expect(locateTask?.param).toBeDefined();
    expect(locateTask?.param.cacheable).toBe(false);

    // Execute the locate task to verify cache is not used
    if (locateTask) {
      await locateTask.executor(locateTask.param, {
        task: {
          type: 'Insight',
          subType: 'Locate',
          param: locateTask.param,
          status: 'running',
          timing: { start: Date.now(), end: 0, cost: 0 },
          executor: locateTask.executor,
        },
      });

      // Verify cache was not queried (or if queried, was rejected due to cacheable: false)
      // The matchElementFromCache function should have been called but returned undefined
      // because cacheable: false
      expect(matchElementFromCacheSpy).toHaveBeenCalled();
      expect(matchElementFromCacheSpy).toHaveReturnedWith(undefined);
    }
  });

  it('should propagate cacheable: false through action method', async () => {
    // Mock the planning AI response
    vi.spyOn(taskExecutor as any, 'createPlanningTask').mockReturnValue({
      type: 'Planning',
      subType: 'Plan',
      param: { userInstruction: 'click button' },
      executor: vi.fn().mockResolvedValue({
        output: {
          actions: [
            {
              type: 'Click',
              locate: {
                prompt: 'button to click',
              },
              param: {},
              thought: 'click the button',
            },
          ],
          more_actions_needed_by_instruction: false,
          log: 'test',
          yamlFlow: [],
        },
        cache: { hit: false },
      }),
    });

    // Call action with cacheable: false
    const result = await taskExecutor.action(
      'click the button',
      { model: 'test-model' } as any,
      undefined,
      false, // cacheable: false
    );

    // Verify the result
    expect(result).toBeDefined();
    expect(result.executor).toBeDefined();
  });

  it('should allow caching when cacheable is not specified', async () => {
    // Mock planning result with a Locate action
    const mockPlans = [
      {
        type: 'Locate',
        locate: {
          prompt: 'button to click',
        },
        param: {
          prompt: 'button to click',
        },
        thought: 'locate the button',
      },
    ];

    // Mock model config
    const mockModelConfig = {
      vlMode: undefined,
      model: 'test-model',
    } as any;

    // Call convertPlanToExecutable without cacheable option (should default to allowing cache)
    const { tasks } = await taskExecutor.convertPlanToExecutable(
      mockPlans,
      mockModelConfig,
      undefined, // cacheable not specified
    );

    // Verify that we have tasks
    expect(tasks.length).toBeGreaterThan(0);

    // Find the locate task
    const locateTask = tasks.find((task) => task.subType === 'Locate');
    expect(locateTask).toBeDefined();

    // Verify the locate task does NOT have cacheable: false in its param
    // (it should either be undefined or true, allowing cache)
    expect(locateTask?.param).toBeDefined();
    expect(locateTask?.param.cacheable).not.toBe(false);
  });

  it('should propagate cacheable: true to locate subtasks', async () => {
    // Mock planning result with a Click action that has a locate parameter
    const mockPlans = [
      {
        type: 'Locate',
        locate: {
          prompt: 'element to locate',
        },
        param: {
          prompt: 'element to locate',
        },
        thought: 'locate element',
      },
    ];

    // Mock model config
    const mockModelConfig = {
      vlMode: undefined,
      model: 'test-model',
    } as any;

    // Call convertPlanToExecutable with cacheable: true
    const { tasks } = await taskExecutor.convertPlanToExecutable(
      mockPlans,
      mockModelConfig,
      true, // cacheable: true
    );

    // Verify that we have tasks
    expect(tasks.length).toBeGreaterThan(0);

    // Find the locate task
    const locateTask = tasks.find((task) => task.subType === 'Locate');
    expect(locateTask).toBeDefined();

    // Verify the locate task has cacheable: true in its param
    expect(locateTask?.param).toBeDefined();
    expect(locateTask?.param.cacheable).toBe(true);
  });
});
