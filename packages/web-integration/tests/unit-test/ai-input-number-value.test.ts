import type { AbstractWebPage } from '@/web-page';
import * as coreActual from '@midscene/core' with { rstest: 'importActual' };
import { Agent as PageAgent } from '@midscene/core/agent';
import * as coreUtilsActual from '@midscene/core/utils' with {
  rstest: 'importActual',
};
import { beforeEach, describe, expect, it, rs } from '@rstest/core';

declare const __VERSION__: string;

// Mock only the necessary parts to avoid side effects
rs.mock('@midscene/core/utils', () => ({
  ...coreUtilsActual,
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

// Mock page implementation
const mockPage = {
  interfaceType: 'puppeteer',
  keyboard: {
    type: rs.fn(),
  },
  actionSpace: rs.fn(() => []),
  screenshotBase64: rs.fn().mockResolvedValue('mock-screenshot'),
  evaluateJavaScript: rs.fn(),
  size: rs.fn().mockResolvedValue({}),
  destroy: rs.fn(),
} as unknown as AbstractWebPage;

const mockedModelConfig = {
  MIDSCENE_MODEL_NAME: 'mock-model',
  MIDSCENE_MODEL_API_KEY: 'mock-api-key',
  MIDSCENE_MODEL_BASE_URL: 'mock-base-url',
  MIDSCENE_MODEL_FAMILY: 'qwen3-vl',
};

// Mock task executor
const mockTaskExecutor = {
  runPlans: rs.fn(),
} as any;

describe('PageAgent aiInput with number value', () => {
  let agent: PageAgent;

  beforeEach(() => {
    rs.clearAllMocks();

    // Create agent instance
    agent = new PageAgent(mockPage, {
      generateReport: false,
      autoPrintReportMsg: false,
      modelConfig: mockedModelConfig,
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
      runner: {
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
      runner: {
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
      runner: {
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
      runner: {
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
      runner: {
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
      runner: {
        dump: () => ({ name: 'test', tasks: [] }),
        isInErrorState: () => false,
      },
      output: {},
    };

    mockTaskExecutor.runPlans.mockResolvedValue(mockExecutorResult);

    // Test legacy signature: aiInput(value, locatePrompt) with number value
    await expect(
      agent.aiInput('input field', {
        value: 88888,
      }),
    ).resolves.not.toThrow();
  });
});
