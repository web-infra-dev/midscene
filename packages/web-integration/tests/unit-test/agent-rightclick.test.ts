import { PageAgent } from '@/common/agent';
import type { WebPage } from '@/common/page';
import { buildPlans } from '@/common/plan-builder';

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the buildPlans function
vi.mock('@/common/plan-builder', () => ({
  buildPlans: vi.fn(),
}));

// Mock page implementation
const mockPage = {
  pageType: 'puppeteer',
  mouse: {
    click: vi.fn(),
  },
  screenshotBase64: vi.fn().mockResolvedValue('mock-screenshot'),
  evaluateJavaScript: vi.fn(),
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
