import type { AbstractWebPage } from '@/web-page';
import { Agent as PageAgent } from '@midscene/core/agent';
import { beforeEach, describe, expect, it, vi } from 'vitest';

declare const __VERSION__: string;

// Mock only the necessary parts to avoid side effects
vi.mock('@midscene/core/utils', async () => {
  const actual = await vi.importActual('@midscene/core/utils');
  return {
    ...actual,
    writeLogFile: vi.fn(() => null),
    reportHTMLContent: vi.fn(() => ''),
    stringifyDumpData: vi.fn(() => '{}'),
    groupedActionDumpFileExt: '.json',
    getVersion: () => __VERSION__,
    sleep: vi.fn(() => Promise.resolve()),
  };
});

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
  keyboard: {
    type: vi.fn(),
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

// Mock task executor
const mockTaskExecutor = {
  runPlans: vi.fn(),
} as any;

describe('PageAgent aiInput with number value', () => {
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

  it('should accept string value for aiInput', async () => {
    const mockPlans = [
      {
        type: 'Locate' as const,
        locate: {
          prompt: 'input field',
        },
        param: {
          prompt: 'input field',
        },
        thought: '',
      },
      {
        type: 'Input' as const,
        locate: {
          prompt: 'input field',
        },
        param: {
          value: 'test string',
        },
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

    // Call aiInput with string value (should work as before)
    await expect(
      agent.aiInput('input field', { value: 'test string' }),
    ).resolves.not.toThrow();
  });

  it('should accept number value for aiInput', async () => {
    const mockPlans = [
      {
        type: 'Locate' as const,
        locate: {
          prompt: 'input field',
        },
        param: {
          prompt: 'input field',
        },
        thought: '',
      },
      {
        type: 'Input' as const,
        locate: {
          prompt: 'input field',
        },
        param: {
          value: '123456',
        },
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

    // Call aiInput with number value (should not throw error)
    await expect(
      agent.aiInput('input field', { value: 123456 }),
    ).resolves.not.toThrow();
  });

  it('should accept integer zero for aiInput', async () => {
    const mockExecutorResult = {
      executor: {
        dump: () => ({ name: 'test', tasks: [] }),
        isInErrorState: () => false,
      },
      output: {},
    };

    mockTaskExecutor.runPlans.mockResolvedValue(mockExecutorResult);

    // Call aiInput with number value 0 (should not throw error)
    await expect(
      agent.aiInput('input field', { value: 0 }),
    ).resolves.not.toThrow();
  });

  it('should accept negative number for aiInput', async () => {
    const mockExecutorResult = {
      executor: {
        dump: () => ({ name: 'test', tasks: [] }),
        isInErrorState: () => false,
      },
      output: {},
    };

    mockTaskExecutor.runPlans.mockResolvedValue(mockExecutorResult);

    // Call aiInput with negative number value (should not throw error)
    await expect(
      agent.aiInput('input field', { value: -999 }),
    ).resolves.not.toThrow();
  });

  it('should accept decimal number for aiInput', async () => {
    const mockExecutorResult = {
      executor: {
        dump: () => ({ name: 'test', tasks: [] }),
        isInErrorState: () => false,
      },
      output: {},
    };

    mockTaskExecutor.runPlans.mockResolvedValue(mockExecutorResult);

    // Call aiInput with decimal number value (should not throw error)
    await expect(
      agent.aiInput('input field', { value: 3.14 }),
    ).resolves.not.toThrow();
  });

  it('should use legacy aiInput(value, locatePrompt) signature with number', async () => {
    const mockExecutorResult = {
      executor: {
        dump: () => ({ name: 'test', tasks: [] }),
        isInErrorState: () => false,
      },
      output: {},
    };

    mockTaskExecutor.runPlans.mockResolvedValue(mockExecutorResult);

    // Test legacy signature: aiInput(value, locatePrompt) with number value
    await expect(agent.aiInput(88888, 'input field')).resolves.not.toThrow();
  });
});
