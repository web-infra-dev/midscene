import { TaskCache, TaskExecutor } from '@/agent';
import type { AbstractInterface } from '@/device';
import { uuid } from '@midscene/shared/utils';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type Service from '../../src';
import { getMidsceneLocationSchema, z } from '../../src';

describe('aiAction cacheable option propagation', () => {
  let taskExecutor: TaskExecutor;
  let mockInterface: AbstractInterface;
  let mockService: Service;
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
          paramSchema: z.object({
            locate: getMidsceneLocationSchema(),
          }),
          call: vi.fn().mockResolvedValue({}),
        },
      ]),
      cacheFeatureForRect: vi.fn().mockResolvedValue({
        feature: 'mock-feature',
      }),
      rectMatchesCacheFeature: vi.fn().mockResolvedValue(undefined),
    };

    // Create mock insight
    mockService = {
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
    taskExecutor = new TaskExecutor(mockInterface, mockService, {
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

        param: {
          locate: {
            prompt: 'button to click',
          },
        },
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
      mockModelConfig,
      {
        cacheable: false,
      },
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
          type: 'Planning',
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
              param: {
                locate: {
                  prompt: 'button to click',
                },
              },
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
      {},
      {},
      undefined,
      false, // cacheable: false
      true, // includeBboxInPlanning: true
    );

    // Verify the result
    expect(result).toBeDefined();
    expect(result.runner).toBeDefined();
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
      mockModelConfig,
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
      mockModelConfig,
      {
        cacheable: true,
      },
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

  it('should fall through to normal execution when cache yamlWorkflow is undefined', async () => {
    // Mock matchPlanCache to return a cache entry with undefined yamlWorkflow
    const matchPlanCacheSpy = vi
      .spyOn(taskCache, 'matchPlanCache')
      .mockReturnValue({
        cacheContent: {
          type: 'plan',
          prompt: 'test prompt',
          yamlWorkflow: undefined as any,
        },
        updateFn: vi.fn(),
      });

    // Mock the action method to track if it gets called (normal execution path)
    const actionSpy = vi
      .spyOn(taskExecutor, 'action')
      .mockResolvedValue({} as any);

    // Create a minimal Agent instance for testing with proper model config
    const { Agent } = await import('@/agent');
    const agent = new Agent(mockInterface, mockService, {
      taskCache,
      modelConfig: {
        baseUrl: 'https://test.com',
        apiKey: 'test-key',
        model: 'test-model',
      },
    });

    // Mock the modelConfigManager to return valid config
    vi.spyOn(agent as any, 'modelConfigManager', 'get').mockReturnValue({
      getModelConfig: () => ({
        baseUrl: 'https://test.com',
        apiKey: 'test-key',
        model: 'test-model',
      }),
      throwErrorIfNonVLModel: vi.fn(),
    });

    // Spy on runYaml to ensure it's NOT called with undefined
    const runYamlSpy = vi.spyOn(agent, 'runYaml');

    // Call aiAct
    await agent.aiAct('test prompt');

    // Verify cache was queried
    expect(matchPlanCacheSpy).toHaveBeenCalledWith('test prompt');

    // Verify runYaml was NOT called (because yamlWorkflow is undefined)
    expect(runYamlSpy).not.toHaveBeenCalled();

    // Verify normal execution path was taken (action method called)
    expect(actionSpy).toHaveBeenCalled();
  });

  it('should fall through to normal execution when cache yamlWorkflow is empty string', async () => {
    // Mock matchPlanCache to return a cache entry with empty string yamlWorkflow
    const matchPlanCacheSpy = vi
      .spyOn(taskCache, 'matchPlanCache')
      .mockReturnValue({
        cacheContent: {
          type: 'plan',
          prompt: 'test prompt',
          yamlWorkflow: '',
        },
        updateFn: vi.fn(),
      });

    // Mock the action method to track if it gets called (normal execution path)
    const actionSpy = vi
      .spyOn(taskExecutor, 'action')
      .mockResolvedValue({} as any);

    // Create a minimal Agent instance for testing with proper model config
    const { Agent } = await import('@/agent');
    const agent = new Agent(mockInterface, mockService, {
      taskCache,
      modelConfig: {
        baseUrl: 'https://test.com',
        apiKey: 'test-key',
        model: 'test-model',
      },
    });

    // Mock the modelConfigManager to return valid config
    vi.spyOn(agent as any, 'modelConfigManager', 'get').mockReturnValue({
      getModelConfig: () => ({
        baseUrl: 'https://test.com',
        apiKey: 'test-key',
        model: 'test-model',
      }),
    });

    // Spy on runYaml to ensure it's NOT called with empty string
    const runYamlSpy = vi.spyOn(agent, 'runYaml');

    // Call aiAct
    await agent.aiAct('test prompt');

    // Verify cache was queried
    expect(matchPlanCacheSpy).toHaveBeenCalledWith('test prompt');

    // Verify runYaml was NOT called (because yamlWorkflow is empty)
    expect(runYamlSpy).not.toHaveBeenCalled();

    // Verify normal execution path was taken (action method called)
    expect(actionSpy).toHaveBeenCalled();
  });

  it('should fall through to normal execution when cache yamlWorkflow is whitespace-only', async () => {
    // Mock matchPlanCache to return a cache entry with whitespace-only yamlWorkflow
    const matchPlanCacheSpy = vi
      .spyOn(taskCache, 'matchPlanCache')
      .mockReturnValue({
        cacheContent: {
          type: 'plan',
          prompt: 'test prompt',
          yamlWorkflow: '   \n\t  ',
        },
        updateFn: vi.fn(),
      });

    // Mock the action method to track if it gets called (normal execution path)
    const actionSpy = vi
      .spyOn(taskExecutor, 'action')
      .mockResolvedValue({} as any);

    // Create a minimal Agent instance for testing with proper model config
    const { Agent } = await import('@/agent');
    const agent = new Agent(mockInterface, mockService, {
      taskCache,
      modelConfig: {
        baseUrl: 'https://test.com',
        apiKey: 'test-key',
        model: 'test-model',
      },
    });

    // Mock the modelConfigManager to return valid config
    vi.spyOn(agent as any, 'modelConfigManager', 'get').mockReturnValue({
      getModelConfig: () => ({
        baseUrl: 'https://test.com',
        apiKey: 'test-key',
        model: 'test-model',
      }),
    });

    // Spy on runYaml to ensure it's NOT called with whitespace
    const runYamlSpy = vi.spyOn(agent, 'runYaml');

    // Call aiAct
    await agent.aiAct('test prompt');

    // Verify cache was queried
    expect(matchPlanCacheSpy).toHaveBeenCalledWith('test prompt');

    // Verify runYaml was NOT called (because yamlWorkflow is only whitespace)
    expect(runYamlSpy).not.toHaveBeenCalled();

    // Verify normal execution path was taken (action method called)
    expect(actionSpy).toHaveBeenCalled();
  });

  it('should use cache when yamlWorkflow has valid content', async () => {
    const validYaml = 'actions:\n  - type: Click\n    thought: test';

    // Mock matchPlanCache to return a cache entry with valid yamlWorkflow
    const matchPlanCacheSpy = vi
      .spyOn(taskCache, 'matchPlanCache')
      .mockReturnValue({
        cacheContent: {
          type: 'plan',
          prompt: 'test prompt',
          yamlWorkflow: validYaml,
        },
        updateFn: vi.fn(),
      });

    // Mock the action method - it should NOT be called when using cache
    const actionSpy = vi
      .spyOn(taskExecutor, 'action')
      .mockResolvedValue({} as any);

    // Create a minimal Agent instance for testing with proper model config
    const { Agent } = await import('@/agent');
    const agent = new Agent(mockInterface, mockService, {
      taskCache,
      modelConfig: {
        baseUrl: 'https://test.com',
        apiKey: 'test-key',
        model: 'test-model',
      },
    });

    // Mock the modelConfigManager to return valid config
    vi.spyOn(agent as any, 'modelConfigManager', 'get').mockReturnValue({
      getModelConfig: () => ({
        baseUrl: 'https://test.com',
        apiKey: 'test-key',
        model: 'test-model',
      }),
    });

    // Mock runYaml to avoid actual execution
    const runYamlSpy = vi.spyOn(agent, 'runYaml').mockResolvedValue({} as any);

    // Call aiAct
    await agent.aiAct('test prompt');

    // Verify cache was queried
    expect(matchPlanCacheSpy).toHaveBeenCalledWith('test prompt');

    // Verify runYaml WAS called with the valid yaml (cache path taken)
    expect(runYamlSpy).toHaveBeenCalledWith(validYaml);

    // Verify normal execution path was NOT taken
    expect(actionSpy).not.toHaveBeenCalled();
  });
});
