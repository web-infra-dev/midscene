import { TaskExecutor } from '@midscene/core/agent';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, vi } from 'vitest';

declare const __VERSION__: string;

// Mock only the necessary parts to avoid side effects
vi.mock('@midscene/core/utils', () => ({
  writeLogFile: vi.fn(() => null),
  reportHTMLContent: vi.fn(() => ''),
  stringifyDumpData: vi.fn(() => '{}'),
  groupedActionDumpFileExt: '.json',
  getVersion: () => __VERSION__,
  sleep: vi.fn(() => Promise.resolve()),
}));

vi.mock('@midscene/shared/logger', () => ({
  getDebug: vi.fn(() => vi.fn()),
  logMsg: vi.fn(),
}));

vi.mock('@midscene/core', async () => {
  const actual = await vi.importActual('@midscene/core');
  return {
    ...actual,
    Insight: vi.fn().mockImplementation(() => ({})),
  };
});

// Partial mock for utils - only mock the async functions that need mocking
vi.mock('@/common/utils', async () => {
  const actual = await vi.importActual('@/common/utils');
  return {
    ...actual,
    WebPageContextParser: vi.fn().mockResolvedValue({}),
    trimContextByViewport: vi.fn((execution) => execution),
    printReportMsg: vi.fn(),
  };
});

const mockedModelConfig: IModelConfig = {
  modelName: 'mock-model',
  modelDescription: 'mock-model-description',
  intent: 'default',
  from: 'legacy-env',
};

describe('TaskExecutor waitFor method with doNotThrowError', () => {
  let taskExecutor: TaskExecutor;
  let mockInsight: any;
  let mockPage: any;

  beforeEach(async () => {
    vi.clearAllMocks();

    // Create mock page
    mockPage = {
      interfaceType: 'test',
      size: vi.fn().mockResolvedValue({ width: 1024, height: 768, dpr: 1 }),
      screenshotBase64: vi.fn().mockResolvedValue('mock-screenshot-base64'),
      url: vi.fn().mockResolvedValue('https://example.com'),
      title: vi.fn().mockResolvedValue('Test Page'),
    };

    // Create mock insight with extract method
    mockInsight = {
      extract: vi.fn(),
      contextRetrieverFn: vi.fn().mockResolvedValue({
        screenshotBase64: 'mock-screenshot-base64',
        size: { width: 1024, height: 768, dpr: 1 },
        url: 'https://example.com',
        content: {
          text: 'page content',
          elements: [],
        },
      }),
    };

    taskExecutor = new TaskExecutor(mockPage, mockInsight, {
      onTaskStart: vi.fn(),
    });
  });

  it('should pass doNotThrowError=true to createTypeQueryTask in waitFor method', async () => {
    // Spy on the private createTypeQueryTask method
    const createTypeQueryTaskSpy = vi.spyOn(
      taskExecutor as any,
      'createTypeQueryTask',
    );

    // Mock the createTypeQueryTask to return a task that will succeed quickly
    const mockTask = {
      type: 'Insight',
      subType: 'WaitFor',
      locate: null,
      param: {
        dataDemand: { result: 'Boolean, test assertion' },
      },
      executor: vi.fn().mockResolvedValue({
        output: true, // Return true to exit the waitFor loop immediately
        thought: 'Mock assertion passed',
      }),
    };
    createTypeQueryTaskSpy.mockResolvedValue(mockTask);

    // Call waitFor method directly
    const result = await taskExecutor.waitFor(
      'test assertion',
      {
        timeoutMs: 5000,
        checkIntervalMs: 1000,
      },
      mockedModelConfig,
    );

    // Verify that createTypeQueryTask was called with doNotThrowError: true
    expect(createTypeQueryTaskSpy).toHaveBeenCalledWith(
      'WaitFor',
      'test assertion',
      mockedModelConfig,
      {
        doNotThrowError: true,
      },
      undefined,
    );

    // Verify the result structure - waitFor returns runner, not executor
    expect(result.runner).toBeDefined();
    expect(result.output).toBeUndefined(); // waitFor returns undefined output on success
  });

  it('should handle AI failures gracefully with doNotThrowError in waitFor loop', async () => {
    // Spy on the private createTypeQueryTask method
    const createTypeQueryTaskSpy = vi.spyOn(
      taskExecutor as any,
      'createTypeQueryTask',
    );

    // Mock createTypeQueryTask to return a task that simulates AI failure but doesn't throw
    const mockTask = {
      type: 'Insight',
      subType: 'Assert',
      locate: null,
      param: {
        dataDemand: { result: 'Boolean, test assertion' },
      },
      executor: vi
        .fn()
        .mockResolvedValueOnce({
          output: false, // First call returns false (assertion failed)
          thought: 'Assertion failed - element not found',
        })
        .mockResolvedValueOnce({
          output: true, // Second call returns true (assertion passed)
          thought: 'Assertion passed - element found',
        }),
    };
    createTypeQueryTaskSpy.mockResolvedValue(mockTask);

    // Call waitFor method with short timeouts to test the retry mechanism
    const result = await taskExecutor.waitFor(
      'test assertion',
      {
        timeoutMs: 5000,
        checkIntervalMs: 1000,
      },
      mockedModelConfig,
    );

    // Verify that createTypeQueryTask was called multiple times with doNotThrowError: true
    expect(createTypeQueryTaskSpy).toHaveBeenCalledWith(
      'WaitFor',
      'test assertion',
      mockedModelConfig,
      {
        doNotThrowError: true,
      },
      undefined,
    );

    // Should have been called at least twice (first failed, second succeeded)
    expect(createTypeQueryTaskSpy).toHaveBeenCalledTimes(2);

    // Verify the result
    expect(result.runner).toBeDefined();
    expect(result.output).toBeUndefined();
  });

  it('should timeout and return error plan when assertion never succeeds', async () => {
    // Spy on the private createTypeQueryTask method
    const createTypeQueryTaskSpy = vi.spyOn(
      taskExecutor as any,
      'createTypeQueryTask',
    );

    // Mock createTypeQueryTask to always return false (assertion never passes)
    const mockTask = {
      type: 'Insight',
      subType: 'Assert',
      locate: null,
      param: {
        dataDemand: { result: 'Boolean, test assertion' },
      },
      executor: vi.fn().mockResolvedValue({
        output: false,
        thought: 'Assertion failed - element not found',
      }),
    };
    createTypeQueryTaskSpy.mockResolvedValue(mockTask);

    // Call waitFor method with very short timeout to trigger timeout quickly
    const result = await taskExecutor.waitFor(
      'test assertion',
      {
        timeoutMs: 100, // Very short timeout
        checkIntervalMs: 50,
      },
      mockedModelConfig,
    );

    // Verify that createTypeQueryTask was called with doNotThrowError: true
    expect(createTypeQueryTaskSpy).toHaveBeenCalledWith(
      'WaitFor',
      'test assertion',
      mockedModelConfig,
      {
        doNotThrowError: true,
      },
      undefined,
    );

    // Verify the result - when timeout occurs, waitFor should return an error state
    expect(result.runner).toBeDefined();
    expect(result.runner.isInErrorState()).toBe(true);
    expect(result.output).toBeUndefined();
  });
});
