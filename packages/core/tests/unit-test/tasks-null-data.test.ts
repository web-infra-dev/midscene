import { TaskExecutor } from '@/agent/tasks';
import { getModelRuntime } from '@/ai-model/models';
import { genericXmlPlan } from '@/ai-model/workflows/planning';
import { ScreenshotItem } from '@/screenshot-item';
import type { AIUsageInfo, ServiceDump } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/ai-model/workflows/planning', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/ai-model/workflows/planning')>();
  return {
    ...actual,
    genericXmlPlan: vi.fn(),
  };
});

// Helper function to create mock UIContext with ScreenshotItem
const createMockUIContext = async (screenshotData = 'mock-screenshot') => {
  const screenshot = ScreenshotItem.create(screenshotData, Date.now());
  return {
    screenshot,
    shotSize: { width: 1920, height: 1080 },
    shrunkShotToLogicalRatio: 1,
  };
};

const createEmptyUIContext = async () => {
  const screenshot = ScreenshotItem.create('', Date.now());
  return {
    screenshot,
    shotSize: { width: 0, height: 0 },
    shrunkShotToLogicalRatio: 1,
  };
};

const createMockUsage = (totalTokens: number): AIUsageInfo => ({
  prompt_tokens: 0,
  completion_tokens: 0,
  total_tokens: totalTokens,
  cached_input: undefined,
  time_cost: undefined,
  model_name: undefined,
  model_description: undefined,
  response_model_name: undefined,
  intent: undefined,
  slot: undefined,
  request_id: undefined,
});

// Helper function to create mock ServiceDump
const createMockDump = (
  data: any,
  thought?: string,
  usage?: { totalTokens: number },
): ServiceDump => ({
  logTime: Date.now(),
  type: 'extract',
  logId: 'mock-log-id',
  userQuery: {},
  data,
  taskInfo: {
    durationMs: 100,
    rawResponse: JSON.stringify(data),
    usage: usage ? createMockUsage(usage.totalTokens) : undefined,
    reasoning_content: thought,
  },
});

/**
 * Tests for null/undefined data handling in task execution
 * This covers the bug fix for: TypeError: Cannot read properties of null (reading 'StatementIsTruthy')
 */
describe('TaskExecutor - Null Data Handling', () => {
  describe('createTypeQueryTask', () => {
    it('should handle null data for WaitFor operation', async () => {
      // Mock service that returns null
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: null, // AI returns null
          usage: { totalTokens: 100 },
          thought: 'Could not determine if condition is true',
          dump: createMockDump(
            null,
            'Could not determine if condition is true',
            { totalTokens: 100 },
          ),
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      // Create a WaitFor task
      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'WaitFor',
        'Element is visible',
        getModelRuntime(mockModelConfig),
        {},
        {}, // ServiceExtractOption
      );

      // Execute the task
      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      // For WaitFor with null data, output should be false (condition not met)
      expect(result.output).toBe(false);
      expect(result.thought).toBe('Could not determine if condition is true');
    });

    it('should handle undefined data for WaitFor operation', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: undefined, // AI returns undefined
          usage: { totalTokens: 100 },
          thought: 'Failed to evaluate condition',
          dump: createMockDump(undefined, 'Failed to evaluate condition', {
            totalTokens: 100,
          }),
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'WaitFor',
        'Button is enabled',
        getModelRuntime(mockModelConfig),
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(result.output).toBe(false);
      expect(result.thought).toBe('Failed to evaluate condition');
    });

    it('should handle null data for Assert operation', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: null,
          usage: { totalTokens: 100 },
          thought: 'Could not verify assertion',
          dump: createMockDump(null, 'Could not verify assertion', {
            totalTokens: 100,
          }),
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'Assert',
        'Page title is correct',
        getModelRuntime(mockModelConfig),
        {},
      );

      // For Assert with null data (falsy), should throw error
      await expect(
        queryTask.executor({}, {
          task: queryTask,
          uiContext: await createEmptyUIContext(),
        } as any),
      ).rejects.toThrow('Assertion failed: Could not verify assertion');

      expect(mockInsight.extract).toHaveBeenCalledWith(
        {
          StatementIsTruthy:
            'Boolean, based on the current screenshot and its contents if provided, unless the user explicitly asks to compare with reference images, whether the following statement is true: Page title is correct',
        },
        getModelRuntime(mockModelConfig),
        {},
        '',
        undefined,
        expect.anything(),
      );
    });

    it('should handle valid data for WaitFor operation', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: {
            StatementIsTruthy: true,
          },
          usage: { totalTokens: 100 },
          thought: 'Condition is met',
          dump: createMockDump(
            { StatementIsTruthy: true },
            'Condition is met',
            { totalTokens: 100 },
          ),
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'WaitFor',
        'Element is visible',
        getModelRuntime(mockModelConfig),
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(mockInsight.extract).toHaveBeenCalledWith(
        {
          StatementIsTruthy:
            "Boolean, the user wants to do some 'wait for' operation. based on the current screenshot and its contents if provided, unless the user explicitly asks to compare with reference images, please check whether the following statement is true: Element is visible",
        },
        getModelRuntime(mockModelConfig),
        {},
        '',
        undefined,
        expect.anything(),
      );
      expect(result.output).toBe(true);
      expect(result.thought).toBe('Condition is met');
    });

    it('should preserve insight intent while recording resolved config slot', async () => {
      const dump = {
        ...createMockDump({ Boolean: true }, 'Condition is met'),
        taskInfo: {
          durationMs: 100,
          rawResponse: '{"Boolean":true}',
          usage: {
            prompt_tokens: 12,
            completion_tokens: 3,
            total_tokens: 15,
            model_name: 'mock-model',
            slot: 'default',
          },
        },
      } as ServiceDump;

      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: {
            Boolean: true,
          },
          usage: dump.taskInfo?.usage,
          thought: 'Condition is met',
          dump,
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'Boolean',
        'Element is visible',
        getModelRuntime(mockModelConfig),
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(result.output).toBe(true);
      expect(queryTask.usage).toMatchObject({
        intent: 'insight',
        slot: 'default',
      });
      expect(queryTask.log?.dump?.taskInfo?.usage).toMatchObject({
        slot: 'default',
      });
      expect(queryTask.log?.dump?.taskInfo?.usage?.intent).toBeUndefined();
    });

    it('should preserve planning intent while recording resolved config slot', async () => {
      const planSpy = vi.mocked(genericXmlPlan).mockResolvedValue({
        actions: [],
        usage: {
          prompt_tokens: 20,
          completion_tokens: 5,
          total_tokens: 25,
          model_name: 'mock-plan-model',
          slot: 'default',
        },
        rawResponse: '{"actions":[]}',
        shouldContinuePlanning: false,
        output: 'done',
      } as any);

      const mockService = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        onceDumpUpdatedFn: undefined,
      } as any;

      const planningModelConfig: IModelConfig = {
        modelName: 'mock-plan-model',
        modelDescription: 'mock-plan-model-description',
        intent: 'default',
        slot: 'default',
      };

      const defaultModelConfig: IModelConfig = {
        modelName: 'mock-default-model',
        modelDescription: 'mock-default-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor(
        { interfaceType: 'web' } as any,
        mockService,
        {
          actionSpace: [],
          replanningCycleLimit: 1,
        },
      );

      const result = await taskExecutor.action(
        'complete the task',
        getModelRuntime(planningModelConfig),
        getModelRuntime(defaultModelConfig),
        false,
      );

      const planningTask = result.runner.tasks[0];
      expect(planningTask.type).toBe('Planning');
      expect(planningTask.usage).toMatchObject({
        intent: 'planning',
        slot: 'default',
      });

      planSpy.mockReset();
    });

    it('should preserve existing intent and warn instead of overwriting it', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const dump = {
        ...createMockDump({ Boolean: true }, 'Condition is met'),
        taskInfo: {
          durationMs: 100,
          rawResponse: '{"Boolean":true}',
          usage: {
            prompt_tokens: 12,
            completion_tokens: 3,
            total_tokens: 15,
            model_name: 'mock-model',
            intent: 'preexisting',
            slot: 'default',
          },
        },
      } as ServiceDump;

      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: {
            Boolean: true,
          },
          usage: dump.taskInfo?.usage,
          thought: 'Condition is met',
          dump,
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'Boolean',
        'Element is visible',
        getModelRuntime(mockModelConfig),
        {},
      );

      await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(queryTask.usage).toMatchObject({
        intent: 'preexisting',
        slot: 'default',
      });
      expect(warnSpy).toHaveBeenCalledWith(
        '[Midscene]',
        'intent is already set to "preexisting", skipping overwrite to "insight"',
      );

      warnSpy.mockRestore();
    });

    it('should handle string data for WaitFor operation', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: 'true', // AI returns plain string instead of structured format
          usage: { totalTokens: 100 },
          thought: 'Condition is met',
          dump: createMockDump('true', 'Condition is met', {
            totalTokens: 100,
          }),
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'WaitFor',
        'Element is visible',
        getModelRuntime(mockModelConfig),
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      // When AI returns a plain string, it should be used directly
      expect(result.output).toBe('true');
    });

    it('should handle null data for Query operation', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: null,
          usage: { totalTokens: 100 },
          thought: 'No result found',
          dump: createMockDump(null, 'No result found', { totalTokens: 100 }),
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'Query',
        { question: 'What is the title?' },
        getModelRuntime(mockModelConfig),
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      // For Query with null data, entire null object should be returned
      expect(result.output).toBeNull();
    });

    it('should handle null data for String type query', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: null,
          usage: { totalTokens: 100 },
          thought: 'Could not extract string',
          dump: createMockDump(null, 'Could not extract string', {
            totalTokens: 100,
          }),
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'String',
        'Extract the username',
        getModelRuntime(mockModelConfig),
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(result.output).toBeNull();
    });

    it('should extract Number type query result from the structured Number field', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: {
            Number: 42,
          },
          usage: { totalTokens: 100 },
          thought: 'Extracted the numeric value successfully',
          dump: createMockDump(
            { Number: 42 },
            'Extracted the numeric value successfully',
            { totalTokens: 100 },
          ),
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'Number',
        'Extract the price',
        getModelRuntime(mockModelConfig),
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(mockInsight.extract).toHaveBeenCalledWith(
        {
          Number:
            'Number, based on the current screenshot and its contents if provided, unless the user explicitly asks to compare with reference images, Extract the price',
        },
        getModelRuntime(mockModelConfig),
        {},
        '',
        undefined,
        expect.anything(),
      );
      expect(result.output).toBe(42);
      expect(result.thought).toBe('Extracted the numeric value successfully');
    });

    it('should preserve domIncluded on Insight task params for report rendering', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: {
            Number: 42,
          },
          usage: { totalTokens: 100 },
          thought: 'Extracted the numeric value successfully',
          dump: createMockDump(
            { Number: 42 },
            'Extracted the numeric value successfully',
            { totalTokens: 100 },
          ),
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'Number',
        'Extract the price',
        getModelRuntime(mockModelConfig),
        { domIncluded: true },
      );

      expect(queryTask.param).toEqual({
        domIncluded: true,
        dataDemand: 'Extract the price',
      });
    });

    it('should handle null data for Number type query', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: null,
          usage: { totalTokens: 100 },
          thought: 'Could not extract number',
          dump: createMockDump(null, 'Could not extract number', {
            totalTokens: 100,
          }),
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'Number',
        'Extract the price',
        getModelRuntime(mockModelConfig),
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(mockInsight.extract).toHaveBeenCalledWith(
        {
          Number:
            'Number, based on the current screenshot and its contents if provided, unless the user explicitly asks to compare with reference images, Extract the price',
        },
        getModelRuntime(mockModelConfig),
        {},
        '',
        undefined,
        expect.anything(),
      );
      expect(result.output).toBeNull();
    });

    it('should prepend current screenshot guidance for Boolean type query', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: {
            Boolean: true,
          },
          usage: { totalTokens: 100 },
          thought: 'The condition is satisfied in the current screenshot',
          dump: createMockDump(
            { Boolean: true },
            'The condition is satisfied in the current screenshot',
            { totalTokens: 100 },
          ),
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        slot: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'Boolean',
        'there is a like button',
        getModelRuntime(mockModelConfig),
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(mockInsight.extract).toHaveBeenCalledWith(
        {
          Boolean:
            'Boolean, based on the current screenshot and its contents if provided, unless the user explicitly asks to compare with reference images, there is a like button',
        },
        getModelRuntime(mockModelConfig),
        {},
        '',
        undefined,
        expect.anything(),
      );
      expect(result.output).toBe(true);
    });
  });
});
