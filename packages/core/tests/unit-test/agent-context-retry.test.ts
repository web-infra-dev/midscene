import { Agent } from '@/agent';
import { ScreenshotItem } from '@/screenshot-item';
import type { UIContext } from '@/types';
import {
  MIDSCENE_MODEL_API_KEY,
  MIDSCENE_MODEL_BASE_URL,
  MIDSCENE_MODEL_NAME,
} from '@midscene/shared/env';
import { afterEach, describe, expect, it, rs } from '@rstest/core';

// TODO(rstest): drop { mock: true } when bare auto-automock lands — https://github.com/web-infra-dev/rspack/pull/14418
rs.mock('openai', { mock: true });

import * as agentUtilsActual from '@/agent/utils' with {
  rstest: 'importActual',
};

// Mock commonContextParser to avoid real image processing
rs.mock('@/agent/utils', () => ({
  ...agentUtilsActual,
  commonContextParser: rs.fn(),
}));

import { commonContextParser } from '@/agent/utils';
const mockedCommonContextParser = rs.mocked(commonContextParser);

const modelConfig = {
  [MIDSCENE_MODEL_NAME]: 'test-model',
  [MIDSCENE_MODEL_API_KEY]: 'test-key',
  [MIDSCENE_MODEL_BASE_URL]: 'https://api.test.com/v1',
};

const fakeUIContext = {
  screenshot: ScreenshotItem.create('', Date.now()),
  shotSize: { width: 1280, height: 720 },
  shrunkShotToLogicalRatio: 1,
} as unknown as UIContext;

function createMockInterface() {
  return {
    interfaceType: 'puppeteer',
    actionSpace: () => [],
    describe: () => 'test page',
    size: async () => ({ width: 1280, height: 720 }),
    screenshotBase64: async () => '',
  } as any;
}

/** Subclass that marks specific errors as retryable (simulates web agents) */
class RetryableAgent extends Agent {
  protected isRetryableContextError(error: unknown): boolean {
    return error instanceof Error && /navigation error/i.test(error.message);
  }
}

describe('Agent context retry via isRetryableContextError', () => {
  afterEach(() => {
    rs.clearAllMocks();
  });

  it('retries on retryable errors and succeeds', async () => {
    let callCount = 0;
    mockedCommonContextParser.mockImplementation(async () => {
      callCount++;
      if (callCount <= 2) {
        throw new Error('Navigation error: execution context was destroyed');
      }
      return fakeUIContext;
    });

    const agent = new RetryableAgent(createMockInterface(), { modelConfig });
    const ctx = await agent.getUIContext();
    expect(ctx).toBeTruthy();
    expect(callCount).toBe(3); // 2 failures + 1 success
  });

  it('does not retry when isRetryableContextError returns false (default Agent)', async () => {
    let callCount = 0;
    mockedCommonContextParser.mockImplementation(async () => {
      callCount++;
      throw new Error('Navigation error: execution context was destroyed');
    });

    const agent = new Agent(createMockInterface(), { modelConfig });
    await expect(agent.getUIContext()).rejects.toThrow('Navigation error');
    expect(callCount).toBe(1); // no retry
  });

  it('throws after max retries on persistent retryable error', async () => {
    mockedCommonContextParser.mockImplementation(async () => {
      throw new Error('Navigation error: page closed');
    });

    const agent = new RetryableAgent(createMockInterface(), { modelConfig });
    await expect(agent.getUIContext()).rejects.toThrow('Navigation error');
    // 1 initial + 3 retries = 4 calls
    expect(mockedCommonContextParser).toHaveBeenCalledTimes(4);
  });

  it('does not retry non-retryable errors even in RetryableAgent', async () => {
    let callCount = 0;
    mockedCommonContextParser.mockImplementation(async () => {
      callCount++;
      throw new Error('some random error');
    });

    const agent = new RetryableAgent(createMockInterface(), { modelConfig });
    await expect(agent.getUIContext()).rejects.toThrow('some random error');
    expect(callCount).toBe(1);
  });
});
