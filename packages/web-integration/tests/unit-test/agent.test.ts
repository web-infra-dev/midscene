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
  pageType: 'puppeteer',
  mouse: {
    click: vi.fn(),
  },
  screenshotBase64: vi.fn().mockResolvedValue('mock-screenshot'),
  evaluateJavaScript: vi.fn(),
  size: vi.fn().mockResolvedValue({ dpr: 1 }),
  destroy: vi.fn(),
} as unknown as AbstractWebPage;

const mockModelConfig = {
  MIDSCENE_MODEL_NAME: 'mock-model',
  MIDSCENE_OPENAI_API_KEY: 'mock-api-key',
  MIDSCENE_OPENAI_BASE_URL: 'mock-base-url',
};

// Mock task executor
const mockTaskExecutor = {
  runPlans: vi.fn(),
} as any;

describe('PageAgent RightClick', () => {
  let agent: PageAgent;

  beforeEach(() => {
    vi.clearAllMocks();

    globalConfigManager.reset();
    // Create agent instance
    agent = new PageAgent(mockPage, {
      generateReport: false,
      autoPrintReportMsg: false,
      modelConfig: () => mockModelConfig,
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
    globalConfigManager.reset();
    agent = new PageAgent(mockPage, {
      modelConfig: () => mockModelConfig,
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
    globalConfigManager.reset();
  });

  it('should use external reportFileName when provided', () => {
    const customReportName = 'my-custom-report-name';
    const agent = new PageAgent(mockPage, {
      reportFileName: customReportName,
      modelConfig: () => mockModelConfig,
    });

    expect(agent.reportFileName).toBe(customReportName);
  });

  it('should generate reportFileName when not provided', () => {
    const agent = new PageAgent(mockPage, {
      modelConfig: () => mockModelConfig,
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
      modelConfig: () => mockModelConfig,
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
      modelConfig: () => mockModelConfig,
    });

    expect(agent.reportFileName).toBe(customReportName);
  });

  it('should fallback to "web" when pageType is not available', () => {
    const mockPageWithoutType = {
      ...mockPage,
      pageType: undefined,
    } as unknown as AbstractWebPage;

    const agent = new PageAgent(mockPageWithoutType, {
      modelConfig: () => mockModelConfig,
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

    globalConfigManager.reset();
    // Create agent instance
    agent = new PageAgent(mockPage, {
      generateReport: false,
      autoPrintReportMsg: false,
      modelConfig: () => mockModelConfig,
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
    expect(mockTaskExecutor.waitFor).toHaveBeenCalledWith('test assertion', {
      timeoutMs: 5000,
      checkIntervalMs: 1000,
    });
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
    expect(mockTaskExecutor.waitFor).toHaveBeenCalledWith('test assertion', {
      timeoutMs: 15000, // 15 * 1000
      checkIntervalMs: 3000, // 3 * 1000
    });
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
    expect(mockTaskExecutor.waitFor).toHaveBeenCalledWith('test assertion', {
      timeoutMs: 30000,
      checkIntervalMs: 5000,
    });
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
