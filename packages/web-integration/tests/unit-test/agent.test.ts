import fs from 'node:fs';
import path from 'node:path';
import type { AbstractWebPage } from '@/web-page';
import type { GroupedActionDump } from '@midscene/core';
import { Agent as PageAgent } from '@midscene/core/agent';
import { globalConfigManager } from '@midscene/shared/env';
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

// Mock page implementation
const mockPage = {
  interfaceType: 'puppeteer',
  mouse: {
    click: vi.fn(),
  },
  screenshotBase64: vi.fn().mockResolvedValue('mock-screenshot'),
  evaluateJavaScript: vi.fn(),
  size: vi.fn().mockResolvedValue({ dpr: 1 }),
  destroy: vi.fn(),
} as unknown as AbstractWebPage;

const mockedModelConfigFnResult = {
  MIDSCENE_MODEL_NAME: 'mock-model',
  MIDSCENE_OPENAI_API_KEY: 'mock-api-key',
  MIDSCENE_OPENAI_BASE_URL: 'mock-base-url',
};

const modelConfigCalcByMockedModelConfigFnResult = {
  from: 'modelConfig',
  httpProxy: undefined,
  intent: 'default',
  modelDescription: '',
  modelName: 'mock-model',
  openaiApiKey: 'mock-api-key',
  openaiBaseURL: 'mock-base-url',
  openaiExtraConfig: undefined,
  socksProxy: undefined,
  uiTarsModelVersion: undefined,
  vlMode: undefined,
  vlModeRaw: undefined,
};

// Mock task executor
const mockTaskExecutor = {
  runPlans: vi.fn(),
} as any;

describe('PageAgent RightClick', () => {
  let agent: PageAgent;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create agent instance
    agent = new PageAgent(mockPage, {
      generateReport: false,
      autoPrintReportMsg: false,
      modelConfig: () => mockedModelConfigFnResult,
    });

    // Replace the taskExecutor with our mock
    agent.taskExecutor = mockTaskExecutor;
  });

  it('should handle aiRightClick with locate options', async () => {
    const mockPlans = [
      {
        type: 'Locate' as const,
        locate: {
          prompt: 'right click target',
          deepThink: true,
          cacheable: false,
        },
        param: {
          prompt: 'right click target',
          deepThink: true,
          cacheable: false,
        },
        thought: '',
      },
      {
        type: 'RightClick' as const,
        locate: {
          prompt: 'right click target',
          deepThink: true,
          cacheable: false,
        },
        param: null,
        thought: '',
      },
    ];

    const mockExecutorResult = {
      executor: {
        dump: () => ({ name: 'test', tasks: [] }),
        isInErrorState: () => false,
      },
      output: {},
    };

    mockTaskExecutor.runPlans.mockResolvedValue(mockExecutorResult);

    // Call aiRightClick with options
    await agent.aiRightClick('right click target', {
      deepThink: true,
      cacheable: false,
    });
  });

  it('should be supported in ai method with rightClick type', async () => {
    await agent.ai('button to right click', 'rightClick');
  });

  it('should throw error for invalid ai method type', async () => {
    await expect(agent.ai('some prompt', 'invalidType')).rejects.toThrow(
      "Unknown type: invalidType, only support 'action', 'query', 'assert', 'tap', 'rightClick'",
    );
  });
});

describe('PageAgent logContent', () => {
  let agent: PageAgent;

  beforeEach(() => {
    agent = new PageAgent(mockPage, {
      modelConfig: () => mockedModelConfigFnResult,
    });
    const dumpPath = path.join(__dirname, 'fixtures', 'dump.json');
    agent.dump = JSON.parse(
      fs.readFileSync(dumpPath, 'utf-8'),
    ) as unknown as GroupedActionDump;
  });

  it('should return correct content', async () => {
    expect(agent.dump.executions[0].tasks[0].uiContext).toBeDefined();
    expect(agent.dump.executions[0].tasks[0].log).toBeDefined();
    const content = agent._unstableLogContent() as GroupedActionDump;
    expect(content).matchSnapshot();
    expect(content.executions[0].tasks[0].uiContext).toBeUndefined();
    expect(content.executions[0].tasks[0].log).toBeUndefined();
    expect(agent.dump.executions[0].tasks[0].uiContext).toBeDefined();
    expect(agent.dump.executions[0].tasks[0].log).toBeDefined();
  });
});

describe('PageAgent reportFileName', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should use external reportFileName when provided', () => {
    const customReportName = 'my-custom-report-name';
    const agent = new PageAgent(mockPage, {
      reportFileName: customReportName,
      modelConfig: () => mockedModelConfigFnResult,
    });

    expect(agent.reportFileName).toBe(customReportName);
  });

  it('should generate reportFileName when not provided', () => {
    const agent = new PageAgent(mockPage, {
      modelConfig: () => mockedModelConfigFnResult,
    });

    // The generated name should contain puppeteer and follow the pattern
    // Note: uuid() generates base-36 strings (0-9, a-z)
    expect(agent.reportFileName).toMatch(
      /puppeteer-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-[a-z0-9]{8}/,
    );
  });

  it('should use testId for generated reportFileName when provided', () => {
    const agent = new PageAgent(mockPage, {
      testId: 'test-123',
      modelConfig: () => mockedModelConfigFnResult,
    });

    // The generated name should contain test-123 and follow the pattern
    // Note: uuid() generates base-36 strings (0-9, a-z)
    expect(agent.reportFileName).toMatch(
      /test-123-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-[a-z0-9]{8}/,
    );
  });

  it('should prioritize external reportFileName over testId', () => {
    const customReportName = 'my-custom-report';
    const agent = new PageAgent(mockPage, {
      reportFileName: customReportName,
      testId: 'test-456',
      modelConfig: () => mockedModelConfigFnResult,
    });

    expect(agent.reportFileName).toBe(customReportName);
  });

  it('should fallback to "web" when interfaceType is not available', () => {
    const mockPageWithoutType = {
      ...mockPage,
      interfaceType: undefined,
    } as unknown as AbstractWebPage;

    const agent = new PageAgent(mockPageWithoutType, {
      modelConfig: () => mockedModelConfigFnResult,
    });

    // The generated name should contain web and follow the pattern
    // Note: uuid() generates base-36 strings (0-9, a-z)
    expect(agent.reportFileName).toMatch(
      /web-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-[a-z0-9]{8}/,
    );
  });
});

describe('PageAgent aiWaitFor with doNotThrowError', () => {
  let agent: PageAgent;
  let mockTaskExecutor: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Create agent instance
    agent = new PageAgent(mockPage, {
      generateReport: false,
      autoPrintReportMsg: false,
      modelConfig: () => mockedModelConfigFnResult,
    });

    // Mock the task executor with waitFor method
    mockTaskExecutor = {
      waitFor: vi.fn(),
    };

    // Replace the taskExecutor with our mock
    agent.taskExecutor = mockTaskExecutor;
  });

  it('should call waitFor with doNotThrowError option in createTypeQueryTask', async () => {
    // Mock the waitFor method to return a successful executor
    const mockExecutorResult = {
      executor: {
        dump: () => ({ name: 'waitFor test', tasks: [] }),
        isInErrorState: () => false,
        latestErrorTask: () => null,
      },
    };

    mockTaskExecutor.waitFor.mockResolvedValue(mockExecutorResult);

    // Call aiWaitFor
    await agent.aiWaitFor('test assertion', {
      timeoutMs: 5000,
      checkIntervalMs: 1000,
    });

    // Verify that waitFor was called with the correct parameters
    expect(mockTaskExecutor.waitFor).toHaveBeenCalledWith(
      'test assertion',
      {
        timeoutMs: 5000,
        checkIntervalMs: 1000,
      },
      modelConfigCalcByMockedModelConfigFnResult,
    );
  });

  it('should handle executor error state and still generate report', async () => {
    // Mock the waitFor method to return an executor in error state
    const mockExecutorResult = {
      executor: {
        dump: () => ({ name: 'waitFor test', tasks: [] }),
        isInErrorState: () => true,
        latestErrorTask: () => ({
          error: 'Test error message',
          errorStack: 'Test error stack',
        }),
      },
    };

    mockTaskExecutor.waitFor.mockResolvedValue(mockExecutorResult);

    // Call aiWaitFor and expect it to throw after generating report
    await expect(agent.aiWaitFor('test assertion')).rejects.toThrow(
      'Test error message\nTest error stack',
    );

    // Verify that waitFor was called
    expect(mockTaskExecutor.waitFor).toHaveBeenCalled();
  });

  it('should use default timeout and checkInterval values', async () => {
    const mockExecutorResult = {
      executor: {
        dump: () => ({ name: 'waitFor test', tasks: [] }),
        isInErrorState: () => false,
        latestErrorTask: () => null,
      },
    };

    mockTaskExecutor.waitFor.mockResolvedValue(mockExecutorResult);

    // Call aiWaitFor without options
    await agent.aiWaitFor('test assertion');

    // Verify that waitFor was called with default values
    expect(mockTaskExecutor.waitFor).toHaveBeenCalledWith(
      'test assertion',
      {
        timeoutMs: 15000, // 15 * 1000
        checkIntervalMs: 3000, // 3 * 1000
      },
      modelConfigCalcByMockedModelConfigFnResult,
    );
  });

  it('should pass through custom timeout and checkInterval values', async () => {
    const mockExecutorResult = {
      executor: {
        dump: () => ({ name: 'waitFor test', tasks: [] }),
        isInErrorState: () => false,
        latestErrorTask: () => null,
      },
    };

    mockTaskExecutor.waitFor.mockResolvedValue(mockExecutorResult);

    const customOptions = {
      timeoutMs: 30000,
      checkIntervalMs: 5000,
    };

    // Call aiWaitFor with custom options
    await agent.aiWaitFor('test assertion', customOptions);

    // Verify that waitFor was called with custom values
    expect(mockTaskExecutor.waitFor).toHaveBeenCalledWith(
      'test assertion',
      {
        timeoutMs: 30000,
        checkIntervalMs: 5000,
      },
      modelConfigCalcByMockedModelConfigFnResult,
    );
  });

  it('should call afterTaskRunning with doNotThrowError=true', async () => {
    const mockExecutorResult = {
      executor: {
        dump: () => ({ name: 'waitFor test', tasks: [] }),
        isInErrorState: () => false,
        latestErrorTask: () => null,
      },
    };

    mockTaskExecutor.waitFor.mockResolvedValue(mockExecutorResult);

    // Spy on afterTaskRunning method
    const afterTaskRunningSpy = vi.spyOn(agent as any, 'afterTaskRunning');

    // Call aiWaitFor
    await agent.aiWaitFor('test assertion');

    // Verify that afterTaskRunning was called with doNotThrowError=true
    expect(afterTaskRunningSpy).toHaveBeenCalledWith(
      mockExecutorResult.executor,
      true,
    );
  });
});

describe('PageAgent cache configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('new cache object API', () => {
    it('should throw error for cache: true (no longer supported)', () => {
      expect(() => {
        new PageAgent(mockPage, {
          cache: true,
          modelConfig: () => mockedModelConfigFnResult,
        });
      }).toThrow('cache: true requires an explicit cache ID');
    });

    it('should handle cache: false (disabled)', () => {
      const agent = new PageAgent(mockPage, {
        cache: false,
        modelConfig: () => mockedModelConfigFnResult,
      });

      expect(agent.taskCache).toBeUndefined();
    });

    it('should throw error for cache: { strategy: "read-only" } without id', () => {
      expect(() => {
        new PageAgent(mockPage, {
          cache: { strategy: 'read-only' },
          modelConfig: () => mockedModelConfigFnResult,
        });
      }).toThrow('cache configuration requires an explicit id');
    });

    it('should handle cache: { id: "custom-id" }', () => {
      const agent = new PageAgent(mockPage, {
        cache: { id: 'custom-cache-id' },
        modelConfig: () => mockedModelConfigFnResult,
      });

      expect(agent.taskCache).toBeDefined();
      expect(agent.taskCache?.isCacheResultUsed).toBe(true);
      expect(agent.taskCache?.readOnlyMode).toBe(false);
      expect(agent.taskCache?.cacheId).toBe('custom-cache-id');
    });

    it('should handle cache: { strategy: "read-only", id: "custom-id" }', () => {
      const agent = new PageAgent(mockPage, {
        cache: {
          strategy: 'read-only',
          id: 'custom-readonly-cache',
        },
        modelConfig: () => mockedModelConfigFnResult,
      });

      expect(agent.taskCache).toBeDefined();
      expect(agent.taskCache?.isCacheResultUsed).toBe(true);
      expect(agent.taskCache?.readOnlyMode).toBe(true);
      expect(agent.taskCache?.cacheId).toBe('custom-readonly-cache');
    });

    it('should throw error for cache: true even with testId', () => {
      expect(() => {
        new PageAgent(mockPage, {
          testId: 'my-test-case',
          cache: true,
          modelConfig: () => mockedModelConfigFnResult,
        });
      }).toThrow('cache: true requires an explicit cache ID');
    });
  });

  describe('backward compatibility with cacheId', () => {
    it('should work with cacheId when MIDSCENE_CACHE=true', () => {
      const globalConfigSpy = vi
        .spyOn(globalConfigManager, 'getEnvConfigInBoolean')
        .mockReturnValue(true);

      const agent = new PageAgent(mockPage, {
        cacheId: 'legacy-cache-id',
        modelConfig: () => mockedModelConfigFnResult,
      });

      expect(agent.taskCache).toBeDefined();
      expect(agent.taskCache?.isCacheResultUsed).toBe(true);
      expect(agent.taskCache?.readOnlyMode).toBe(false);
      expect(agent.taskCache?.cacheId).toBe('legacy-cache-id');

      globalConfigSpy.mockRestore();
    });

    it('should not create cache with cacheId when MIDSCENE_CACHE=false', () => {
      const globalConfigSpy = vi
        .spyOn(globalConfigManager, 'getEnvConfigInBoolean')
        .mockReturnValue(false);

      const agent = new PageAgent(mockPage, {
        cacheId: 'legacy-cache-id',
        modelConfig: () => mockedModelConfigFnResult,
      });

      expect(agent.taskCache).toBeUndefined();

      globalConfigSpy.mockRestore();
    });

    it('should prefer new cache config over cacheId', () => {
      const globalConfigSpy = vi
        .spyOn(globalConfigManager, 'getEnvConfigInBoolean')
        .mockReturnValue(true);

      const agent = new PageAgent(mockPage, {
        cacheId: 'legacy-cache-id', // Should be ignored
        cache: { id: 'new-cache-id' },
        modelConfig: () => mockedModelConfigFnResult,
      });

      expect(agent.taskCache).toBeDefined();
      expect(agent.taskCache?.cacheId).toBe('new-cache-id');

      globalConfigSpy.mockRestore();
    });
  });

  describe('flushCache method', () => {
    it('should throw error when cache is not configured', async () => {
      const agent = new PageAgent(mockPage, {
        cache: false,
        modelConfig: () => mockedModelConfigFnResult,
      });

      await expect(agent.flushCache()).rejects.toThrow(
        'Cache is not configured',
      );
    });

    it('should throw error when not in read-only mode', async () => {
      const agent = new PageAgent(mockPage, {
        cache: { id: 'test-cache' }, // read-write mode
        modelConfig: () => mockedModelConfigFnResult,
      });

      await expect(agent.flushCache()).rejects.toThrow(
        'flushCache() can only be called in read-only mode',
      );
    });

    it('should work in read-only mode', async () => {
      const agent = new PageAgent(mockPage, {
        cache: { strategy: 'read-only', id: 'flush-test' },
        modelConfig: () => mockedModelConfigFnResult,
      });

      // Mock the flushCacheToFile method
      const flushSpy = vi.spyOn(agent.taskCache!, 'flushCacheToFile');

      await agent.flushCache();

      expect(flushSpy).toHaveBeenCalled();
    });

    it('should throw error for cache: true without explicit ID', () => {
      expect(() => {
        new PageAgent(mockPage, {
          cache: true, // Not supported anymore
          modelConfig: () => mockedModelConfigFnResult,
        });
      }).toThrow('cache: true requires an explicit cache ID');
    });
  });
});
