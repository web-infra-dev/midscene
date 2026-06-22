import * as coreActual from '@midscene/core' with { rstest: 'importActual' };
import { TaskExecutor } from '@midscene/core/agent';
import { getModelRuntime } from '@midscene/core/ai-model';
import { defineActionSleep } from '@midscene/core/device';
import type { IModelConfig } from '@midscene/shared/env';
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

declare const __VERSION__: string;

// Mock only the necessary parts to avoid side effects
rs.mock('@midscene/core/utils', () => ({
  writeLogFile: rs.fn(() => null),
  reportHTMLContent: rs.fn(() => ''),
  stringifyDumpData: rs.fn(() => '{}'),
  groupedActionDumpFileExt: '.json',
  getVersion: () => __VERSION__,
  sleep: rs.fn(() => Promise.resolve()),
}));

rs.mock('@midscene/shared/logger', () => ({
  getDebug: rs.fn(() => rs.fn()),
  logMsg: rs.fn(),
}));

rs.mock('@midscene/core', () => ({
  ...coreActual,
  Insight: rs.fn().mockImplementation(() => ({})),
}));

// `@/common/utils` no longer exists; functions moved to `@midscene/core/agent`.

const mockedModelConfig: IModelConfig = {
  modelName: 'mock-model',
  modelDescription: 'mock-model-description',
  intent: 'default',
  slot: 'default',
};
const mockedModelRuntime = getModelRuntime(mockedModelConfig);

describe('TaskExecutor waitFor method with doNotThrowError', () => {
  let taskExecutor: TaskExecutor;
  let mockInsight: any;
  let mockPage: any;

  beforeEach(async () => {
    rs.clearAllMocks();

    // Create mock page
    mockPage = {
      interfaceType: 'test',
      size: rs.fn().mockResolvedValue({ width: 1024, height: 768 }),
      screenshotBase64: rs.fn().mockResolvedValue('mock-screenshot-base64'),
      url: rs.fn().mockResolvedValue('https://example.com'),
      title: rs.fn().mockResolvedValue('Test Page'),
      actionSpace: rs.fn(() => [defineActionSleep()]),
    };

    // Create mock insight with extract method
    mockInsight = {
      extract: rs.fn(),
      contextRetrieverFn: rs.fn().mockResolvedValue({
        screenshotBase64: 'mock-screenshot-base64',
        shotSize: { width: 1024, height: 768 },
        shrunkShotToLogicalRatio: 1,
        url: 'https://example.com',
        content: {
          text: 'page content',
          elements: [],
        },
      }),
    };

    taskExecutor = new TaskExecutor(mockPage, mockInsight, {
      onTaskStart: rs.fn(),
      actionSpace: mockPage.actionSpace(),
    });
  });

  it('should pass doNotThrowError=true to createTypeQueryTask in waitFor method', async () => {
    // Spy on the private createTypeQueryTask method
    const createTypeQueryTaskSpy = rs.spyOn(
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
      executor: rs.fn().mockResolvedValue({
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
      mockedModelRuntime,
    );

    // Verify that createTypeQueryTask was called with ServiceExtractOption
    expect(createTypeQueryTaskSpy).toHaveBeenCalledWith(
      'WaitFor',
      'test assertion',
      mockedModelRuntime,
      {
        domIncluded: undefined,
        screenshotIncluded: undefined,
      },
      undefined,
    );

    // Verify the result structure - waitFor returns runner, not executor
    expect(result.runner).toBeDefined();
    expect(result.output).toBeUndefined(); // waitFor returns undefined output on success
  });

  it('should handle AI failures gracefully with doNotThrowError in waitFor loop', async () => {
    // Spy on the private createTypeQueryTask method
    const createTypeQueryTaskSpy = rs.spyOn(
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
      executor: rs
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
      mockedModelRuntime,
    );

    // Verify that createTypeQueryTask was called multiple times with ServiceExtractOption
    expect(createTypeQueryTaskSpy).toHaveBeenCalledWith(
      'WaitFor',
      'test assertion',
      mockedModelRuntime,
      {
        domIncluded: undefined,
        screenshotIncluded: undefined,
      },
      undefined,
    );

    // Should have been called at least twice (first failed, second succeeded)
    expect(createTypeQueryTaskSpy).toHaveBeenCalledTimes(2);

    // Verify the result
    expect(result.runner).toBeDefined();
    expect(result.output).toBeUndefined();
  });
});
