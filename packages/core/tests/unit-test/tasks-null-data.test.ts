import { TaskExecutor } from '@/agent/tasks';
import { ScreenshotItem } from '@/screenshot-item';
import type { IModelConfig } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';

// Helper function to create mock UIContext with ScreenshotItem
const createMockUIContext = async (screenshotData = 'mock-screenshot') => {
  const screenshot = await ScreenshotItem.create(screenshotData);
  return {
    screenshot,
    size: { width: 1920, height: 1080 },
  };
};

const createEmptyUIContext = async () => {
  const screenshot = await ScreenshotItem.create('');
  return {
    screenshot,
    size: { width: 0, height: 0 },
  };
};

/**
 * Tests for null/undefined data handling in task execution
 * This covers the bug fix for: TypeError: Cannot read properties of null (reading 'StatementIsTruthy')
 */
describe('TaskExecutor - Null Data Handling', () => {
  describe('createTypeQueryTask', () => {
    it('should handle null data for WaitFor operation', async () => {
      // Mock service that returns null
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => createMockUIContext()),
        extract: vi.fn(async () => ({
          data: null, // AI returns null
          usage: { totalTokens: 100 },
          thought: 'Could not determine if condition is true',
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        from: 'legacy-env',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      // Create a WaitFor task
      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'WaitFor',
        'Element is visible',
        mockModelConfig,
        {},
        {}, // ServiceExtractOption
      );

      // Execute the task
      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: createEmptyUIContext(),
      } as any);

      // For WaitFor with null data, output should be false (condition not met)
      expect(result.output).toBe(false);
      expect(result.thought).toBe('Could not determine if condition is true');
    });

    it('should handle undefined data for WaitFor operation', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => createMockUIContext()),
        extract: vi.fn(async () => ({
          data: undefined, // AI returns undefined
          usage: { totalTokens: 100 },
          thought: 'Failed to evaluate condition',
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'WaitFor',
        'Button is enabled',
        mockModelConfig,
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: createEmptyUIContext(),
      } as any);

      expect(result.output).toBe(false);
      expect(result.thought).toBe('Failed to evaluate condition');
    });

    it('should handle null data for Assert operation', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => createMockUIContext()),
        extract: vi.fn(async () => ({
          data: null,
          usage: { totalTokens: 100 },
          thought: 'Could not verify assertion',
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        from: 'legacy-env',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'Assert',
        'Page title is correct',
        mockModelConfig,
        {},
      );

      // For Assert with null data (falsy), should throw error
      await expect(
        queryTask.executor({}, {
          task: queryTask,
          uiContext: createEmptyUIContext(),
        } as any),
      ).rejects.toThrow('Assertion failed: Could not verify assertion');
    });

    it('should handle valid data for WaitFor operation', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => createMockUIContext()),
        extract: vi.fn(async () => ({
          data: {
            StatementIsTruthy: true,
          },
          usage: { totalTokens: 100 },
          thought: 'Condition is met',
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        from: 'legacy-env',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'WaitFor',
        'Element is visible',
        mockModelConfig,
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: createEmptyUIContext(),
      } as any);

      expect(result.output).toBe(true);
      expect(result.thought).toBe('Condition is met');
    });

    it('should handle string data for WaitFor operation', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => createMockUIContext()),
        extract: vi.fn(async () => ({
          data: 'true', // AI returns plain string instead of structured format
          usage: { totalTokens: 100 },
          thought: 'Condition is met',
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        from: 'legacy-env',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'WaitFor',
        'Element is visible',
        mockModelConfig,
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: createEmptyUIContext(),
      } as any);

      // When AI returns a plain string, it should be used directly
      expect(result.output).toBe('true');
    });

    it('should handle null data for Query operation', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => createMockUIContext()),
        extract: vi.fn(async () => ({
          data: null,
          usage: { totalTokens: 100 },
          thought: 'No result found',
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        from: 'legacy-env',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'Query',
        { question: 'What is the title?' },
        mockModelConfig,
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: createEmptyUIContext(),
      } as any);

      // For Query with null data, entire null object should be returned
      expect(result.output).toBeNull();
    });

    it('should handle null data for String type query', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => createMockUIContext()),
        extract: vi.fn(async () => ({
          data: null,
          usage: { totalTokens: 100 },
          thought: 'Could not extract string',
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        from: 'legacy-env',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'String',
        'Extract the username',
        mockModelConfig,
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: createEmptyUIContext(),
      } as any);

      expect(result.output).toBeNull();
    });

    it('should handle null data for Number type query', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => createMockUIContext()),
        extract: vi.fn(async () => ({
          data: null,
          usage: { totalTokens: 100 },
          thought: 'Could not extract number',
        })),
        onceDumpUpdatedFn: undefined,
      } as any;

      const mockModelConfig: IModelConfig = {
        modelName: 'mock-model',
        modelDescription: 'mock-model-description',
        intent: 'default',
        from: 'legacy-env',
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'Number',
        'Extract the price',
        mockModelConfig,
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: createEmptyUIContext(),
      } as any);

      expect(result.output).toBeNull();
    });
  });
});
