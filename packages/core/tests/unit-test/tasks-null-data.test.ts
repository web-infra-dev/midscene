import { TaskExecutor } from '@/agent/tasks';
import { ScreenshotItem } from '@/screenshot-item';
import type { ServiceDump } from '@/types';
import type { IModelConfig } from '@midscene/shared/env';
import { describe, expect, it, vi } from 'vitest';

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

// Helper function to create mock ServiceDump
const createMockDump = (
  data: any,
  thought?: string,
  usage?: { totalTokens: number },
  rawResponse?: string,
): ServiceDump => ({
  type: 'extract',
  logId: 'mock-log-id',
  userQuery: {},
  matchedElement: [],
  data,
  taskInfo: {
    durationMs: 100,
    rawResponse: rawResponse ?? JSON.stringify(data),
    usage: usage ? { inputTokens: 0, outputTokens: 0, ...usage } : undefined,
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
          uiContext: await createEmptyUIContext(),
        } as any),
      ).rejects.toThrow('Assertion failed: Could not verify assertion');
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
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(result.output).toBe(true);
      expect(result.thought).toBe('Condition is met');
    });

    it('should coerce string boolean data for WaitFor operation', async () => {
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
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(result.output).toBe(true);
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
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(mockInsight.extract).toHaveBeenCalledWith(
        {
          Number: 'Number, Extract the price',
        },
        mockModelConfig,
        {},
        '',
        undefined,
        expect.anything(),
      );
      expect(result.output).toBe(42);
      expect(result.thought).toBe('Extracted the numeric value successfully');
    });

    it('should handle primitive number data for Number type query', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: 42,
          usage: { totalTokens: 100 },
          thought: 'Extracted the numeric value directly',
          dump: createMockDump(42, 'Extracted the numeric value directly', {
            totalTokens: 100,
          }),
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
        'Number',
        'Extract the price',
        mockModelConfig,
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(result.output).toBe(42);
      expect(result.thought).toBe('Extracted the numeric value directly');
    });

    it('should coerce numeric string data for Number type query', async () => {
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: '42',
          usage: { totalTokens: 100 },
          thought: 'Extracted the numeric value as a string',
          dump: createMockDump(
            '42',
            'Extracted the numeric value as a string',
            {
              totalTokens: 100,
            },
          ),
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
        'Number',
        'Extract the price',
        mockModelConfig,
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(result.output).toBe(42);
      expect(result.thought).toBe('Extracted the numeric value as a string');
    });

    it('should fall back to raw data-json text for malformed String query results', async () => {
      const rawDataJson = `
页面1：知识问答搜索输入页面
1.1 属于模块：Mind AI新对话的知识问答功能模块
1.2 页面详细解释说明：当前搜索输入框内已输入内容 @ecom，下拉搜索结果显示暂无搜索结果。
1.3 使用组件：文本搜索输入框、搜索结果下拉弹窗、模式下拉选择按钮、发送提交按钮
      `.trim();
      const mockInsight = {
        contextRetrieverFn: vi.fn(async () => await createMockUIContext()),
        extract: vi.fn(async () => ({
          data: [
            '页面1：知识问答搜索输入页面',
            1.1,
            '属于模块：Mind AI新对话的知识问答功能模块',
          ],
          usage: { totalTokens: 100 },
          thought: 'jsonrepair repaired the prose into an array',
          dump: createMockDump(
            [
              '页面1：知识问答搜索输入页面',
              1.1,
              '属于模块：Mind AI新对话的知识问答功能模块',
            ],
            'jsonrepair repaired the prose into an array',
            { totalTokens: 100 },
            `<thought>jsonrepair repaired the prose into an array</thought><data-json>${rawDataJson}</data-json>`,
          ),
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
        'String',
        'Summarize the Figma screenshot',
        mockModelConfig,
        {},
      );

      const result = await queryTask.executor({}, {
        task: queryTask,
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(result.output).toBe(rawDataJson);
      expect(result.thought).toBe(
        'jsonrepair repaired the prose into an array',
      );
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
      };

      const taskExecutor = new TaskExecutor({} as any, mockInsight, {
        actionSpace: [],
      });

      const queryTask = await (taskExecutor as any).createTypeQueryTask(
        'Number',
        'Extract the price',
        mockModelConfig,
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
        uiContext: await createEmptyUIContext(),
      } as any);

      expect(result.output).toBeNull();
    });
  });
});
