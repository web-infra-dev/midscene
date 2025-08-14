import fs from 'node:fs';
import path from 'node:path';
import { PageAgent } from '@/common/agent';
import type { WebPage } from '@/common/page';
import { buildPlans } from '@/common/plan-builder';
import type { GroupedActionDump } from '@midscene/core';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the buildPlans function
vi.mock('@/common/plan-builder', () => ({
  buildPlans: vi.fn(),
}));

declare const __VERSION__: string;
// Mock only the necessary parts to avoid side effects
vi.mock('@midscene/core/utils', () => ({
  writeLogFile: vi.fn(() => null),
  reportHTMLContent: vi.fn(() => ''),
  stringifyDumpData: vi.fn(() => '{}'),
  groupedActionDumpFileExt: '.json',
  getVersion: () => __VERSION__,
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
    parseContextFromWebPage: vi.fn().mockResolvedValue({}),
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
} as unknown as WebPage;

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
    });

    // Replace the taskExecutor with our mock
    agent.taskExecutor = mockTaskExecutor;
  });

  it('should build correct plans for aiRightClick', async () => {
    const mockPlans = [
      {
        type: 'Locate' as const,
        locate: { prompt: 'context menu trigger' },
        param: { prompt: 'context menu trigger' },
        thought: '',
      },
      {
        type: 'RightClick' as const,
        locate: { prompt: 'context menu trigger' },
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

    vi.mocked(buildPlans).mockReturnValue(mockPlans);
    mockTaskExecutor.runPlans.mockResolvedValue(mockExecutorResult);

    // Call aiRightClick
    await agent.aiRightClick('context menu trigger');

    // Verify buildPlans was called with correct parameters
    expect(buildPlans).toHaveBeenCalledWith('RightClick', {
      prompt: 'context menu trigger',
    });

    // Verify runPlans was called with correct parameters
    expect(mockTaskExecutor.runPlans).toHaveBeenCalledWith(
      'RightClick - context menu trigger',
      mockPlans,
      {
        cacheable: undefined,
      },
    );
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

    vi.mocked(buildPlans).mockReturnValue(mockPlans);
    mockTaskExecutor.runPlans.mockResolvedValue(mockExecutorResult);

    // Call aiRightClick with options
    await agent.aiRightClick('right click target', {
      deepThink: true,
      cacheable: false,
    });

    // Verify buildPlans was called with correct parameters including options
    expect(buildPlans).toHaveBeenCalledWith('RightClick', {
      prompt: 'right click target',
      deepThink: true,
      cacheable: false,
    });
  });

  it('should be supported in ai method with rightClick type', async () => {
    const mockPlans = [
      {
        type: 'Locate' as const,
        locate: { prompt: 'button to right click' },
        param: { prompt: 'button to right click' },
        thought: '',
      },
      {
        type: 'RightClick' as const,
        locate: { prompt: 'button to right click' },
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

    vi.mocked(buildPlans).mockReturnValue(mockPlans);
    mockTaskExecutor.runPlans.mockResolvedValue(mockExecutorResult);

    // Call ai method with rightClick type
    await agent.ai('button to right click', 'rightClick');

    // Verify buildPlans was called with RightClick
    expect(buildPlans).toHaveBeenCalledWith('RightClick', {
      prompt: 'button to right click',
    });
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
    agent = new PageAgent(mockPage);
    const dumpPath = path.join(__dirname, 'fixtures', 'dump.json');
    agent.dump = JSON.parse(
      fs.readFileSync(dumpPath, 'utf-8'),
    ) as unknown as GroupedActionDump;
  });

  it('should return correct content', async () => {
    expect(agent.dump.executions[0].tasks[0].pageContext).toBeDefined();
    expect(agent.dump.executions[0].tasks[0].log).toBeDefined();
    const content = agent._unstableLogContent() as GroupedActionDump;
    expect(content).matchSnapshot();
    expect(content.executions[0].tasks[0].pageContext).toBeUndefined();
    expect(content.executions[0].tasks[0].log).toBeUndefined();
    expect(agent.dump.executions[0].tasks[0].pageContext).toBeDefined();
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
    });

    expect(agent.reportFileName).toBe(customReportName);
  });

  it('should generate reportFileName when not provided', () => {
    const agent = new PageAgent(mockPage);

    // The generated name should contain puppeteer and follow the pattern
    // Note: uuid() generates base-36 strings (0-9, a-z)
    expect(agent.reportFileName).toMatch(
      /puppeteer-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-[a-z0-9]{8}/,
    );
  });

  it('should use testId for generated reportFileName when provided', () => {
    const agent = new PageAgent(mockPage, {
      testId: 'test-123',
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
    });

    expect(agent.reportFileName).toBe(customReportName);
  });

  it('should fallback to "web" when pageType is not available', () => {
    const mockPageWithoutType = {
      ...mockPage,
      pageType: undefined,
    } as unknown as WebPage;

    const agent = new PageAgent(mockPageWithoutType);

    // The generated name should contain web and follow the pattern
    // Note: uuid() generates base-36 strings (0-9, a-z)
    expect(agent.reportFileName).toMatch(
      /web-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-[a-z0-9]{8}/,
    );
  });
});
