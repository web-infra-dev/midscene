import { Agent } from '@/agent';
import { describe, expect, it, vi } from 'vitest';

const planningModel = {
  config: { slot: 'default' },
  adapter: { planning: { cacheEnabled: true } },
};

const defaultModel = {
  config: { slot: 'default' },
  adapter: { planning: { cacheEnabled: false } },
};

const createAgentStub = () => {
  const agent = Object.create(Agent.prototype) as Agent<any>;
  const taskExecutor = {
    action: vi.fn(async (..._args: unknown[]) => ({
      output: {
        output: 'done',
        yamlFlow: [],
      },
    })),
    createTypeQueryExecution: vi.fn(async () => ({
      output: true,
      thought: 'ok',
    })),
  };
  const taskCache = {
    matchPlanCache: vi.fn(),
    isCacheResultUsed: true,
    updateOrAppendCacheRecord: vi.fn(),
  };

  (agent as any).opts = {
    aiActContext: 'Global action context.',
  };
  (agent as any).taskExecutor = taskExecutor;
  (agent as any).taskCache = taskCache;
  (agent as any).resolveModelRuntime = vi.fn((slot: string) =>
    slot === 'planning' ? planningModel : defaultModel,
  );
  (agent as any).resolveReplanningCycleLimit = vi.fn(() => 3);

  return {
    agent,
    taskExecutor,
    taskCache,
  };
};

describe('Agent per-call context option', () => {
  it('uses per-call context instead of global aiActContext when provided', async () => {
    const { agent, taskExecutor, taskCache } = createAgentStub();

    await agent.aiAct('Click the submit button', {
      context: 'Use buyer checkout rules.',
    });

    expect(taskCache.matchPlanCache).toHaveBeenCalledWith(
      'Context for this request:\nUse buyer checkout rules.\n\nClick the submit button',
    );
    expect(taskExecutor.action).toHaveBeenCalledTimes(1);
    expect(taskExecutor.action.mock.calls[0][4]).toBe(
      'Use buyer checkout rules.',
    );
  });

  it('falls back to global aiActContext when per-call context is undefined', async () => {
    const { agent, taskExecutor, taskCache } = createAgentStub();

    await agent.aiAct('Click the submit button');

    expect(taskCache.matchPlanCache).toHaveBeenCalledWith(
      'Context for this request:\nGlobal action context.\n\nClick the submit button',
    );
    expect(taskExecutor.action.mock.calls[0][4]).toBe('Global action context.');
  });

  it('allows blank per-call context to override global aiActContext', async () => {
    const { agent, taskExecutor, taskCache } = createAgentStub();

    await agent.aiAct('Click the submit button', {
      context: '',
    });

    expect(taskCache.matchPlanCache).toHaveBeenCalledWith(
      'Click the submit button',
    );
    expect(taskExecutor.action.mock.calls[0][4]).toBe('');
  });

  it('passes aiAssert context separately from the assertion prompt', async () => {
    const { agent, taskExecutor } = createAgentStub();

    const result = await agent.aiAssert(
      'The success toast is visible',
      undefined,
      {
        context: 'The current user is a logged-in buyer.',
        keepRawResponse: true,
      },
    );

    expect(taskExecutor.createTypeQueryExecution).toHaveBeenCalledWith(
      'Assert',
      'The success toast is visible',
      defaultModel,
      {
        context: 'The current user is a logged-in buyer.',
        domIncluded: false,
        screenshotIncluded: true,
      },
      undefined,
      {
        abortSignal: undefined,
      },
    );
    expect(result).toEqual({
      pass: true,
      thought: 'ok',
      message: undefined,
    });
  });

  it('passes abortSignal through aiAssert', async () => {
    const { agent, taskExecutor } = createAgentStub();
    const abortController = new AbortController();

    await agent.aiAssert('The success toast is visible', undefined, {
      abortSignal: abortController.signal,
    });

    expect(taskExecutor.createTypeQueryExecution).toHaveBeenCalledWith(
      'Assert',
      'The success toast is visible',
      defaultModel,
      {
        domIncluded: false,
        screenshotIncluded: true,
      },
      undefined,
      {
        abortSignal: abortController.signal,
      },
    );
  });
});
