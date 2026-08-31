import { Agent, type AiActOptions } from '@/agent';
import { TaskExecutionError } from '@/task-runner';
import type { AssertOptions } from '@/types';
import { describe, expect, it, rs } from '@rstest/core';

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
    action: rs.fn(async (..._args: unknown[]) => ({
      output: {
        output: 'done',
        yamlFlow: [],
      },
    })),
    createTypeQueryExecution: rs.fn(async (..._args: unknown[]) => ({
      output: true,
      thought: 'ok',
    })),
    runPlans: rs.fn(async (..._args: unknown[]) => ({
      output: {
        element: {
          rect: { left: 0, top: 0, width: 10, height: 10 },
          center: [5, 5],
          dpr: 1,
        },
      },
    })),
    waitFor: rs.fn(async (..._args: unknown[]) => undefined),
  };
  const taskCache = {
    matchPlanCache: rs.fn(),
    isCacheResultUsed: true,
    updateOrAppendCacheRecord: rs.fn(),
  };

  (agent as any).opts = {
    globalContext: 'Global context.',
    aiActContext: 'Global action context.',
  };
  const registerFileChooserListener = rs.fn();
  (agent as any).interface = {
    interfaceType: 'playwright',
    registerFileChooserListener,
  };
  (agent as any).taskExecutor = taskExecutor;
  (agent as any).taskCache = taskCache;
  (agent as any).resolveModelRuntime = rs.fn((slot: string) =>
    slot === 'planning' ? planningModel : defaultModel,
  );
  (agent as any).resolveReplanningCycleLimit = rs.fn(() => 3);

  return {
    agent,
    taskExecutor,
    taskCache,
    registerFileChooserListener,
  };
};

describe('Agent per-call context option', () => {
  it('preserves existing aiAct context resolution when globalContext is omitted', async () => {
    const { agent, taskExecutor } = createAgentStub();
    (agent as any).opts.globalContext = undefined;

    await agent.aiAct('Click the submit button', {
      context: 'Use buyer checkout rules.',
    });

    expect(taskExecutor.action.mock.calls[0][3]).toBe(
      'Use buyer checkout rules.',
    );
  });

  it('uses per-call context instead of global aiActContext when provided', async () => {
    const { agent, taskExecutor, taskCache } = createAgentStub();

    await agent.aiAct('Click the submit button', {
      context: 'Use buyer checkout rules.',
    });

    expect(taskCache.matchPlanCache).toHaveBeenCalledWith(
      'Context for this request:\nGlobal context.\n\nUse buyer checkout rules.\n\nClick the submit button',
    );
    expect(taskExecutor.action).toHaveBeenCalledTimes(1);
    expect(taskExecutor.action.mock.calls[0][3]).toBe(
      'Global context.\n\nUse buyer checkout rules.',
    );
  });

  it('falls back to global aiActContext when per-call context is undefined', async () => {
    const { agent, taskExecutor, taskCache } = createAgentStub();

    await agent.aiAct('Click the submit button');

    expect(taskCache.matchPlanCache).toHaveBeenCalledWith(
      'Context for this request:\nGlobal context.\n\nGlobal action context.\n\nClick the submit button',
    );
    expect(taskExecutor.action.mock.calls[0][3]).toBe(
      'Global context.\n\nGlobal action context.',
    );
  });

  it('allows blank per-call context to override global aiActContext', async () => {
    const { agent, taskExecutor, taskCache } = createAgentStub();

    await agent.aiAct('Click the submit button', {
      context: '',
    });

    expect(taskCache.matchPlanCache).toHaveBeenCalledWith(
      'Context for this request:\nGlobal context.\n\nClick the submit button',
    );
    expect(taskExecutor.action.mock.calls[0][3]).toBe('Global context.');
  });

  it('appends framework context without mutating the global aiActContext', async () => {
    const { agent, taskExecutor, taskCache } = createAgentStub();
    const options: AiActOptions & { _internalAdditionalContext: string } = {
      _internalAdditionalContext:
        'Previous workflow results (read-only):\nlaunch passed',
    };

    await agent.aiAct('Reset the page', options);
    await agent.aiAct('Reset the page again', options);

    const expectedContext =
      'Global context.\n\nGlobal action context.\n\nPrevious workflow results (read-only):\nlaunch passed';
    expect(taskCache.matchPlanCache).toHaveBeenNthCalledWith(
      1,
      `Context for this request:\n${expectedContext}\n\nReset the page`,
    );
    expect(taskCache.matchPlanCache).toHaveBeenNthCalledWith(
      2,
      `Context for this request:\n${expectedContext}\n\nReset the page again`,
    );
    expect(taskExecutor.action.mock.calls[0][3]).toBe(expectedContext);
    expect(taskExecutor.action.mock.calls[1][3]).toBe(expectedContext);
  });

  it('keeps per-call context ahead of aiActContext when framework context is appended', async () => {
    const { agent, taskExecutor } = createAgentStub();
    const options: AiActOptions & { _internalAdditionalContext: string } = {
      context: 'Use buyer checkout rules.',
      _internalAdditionalContext:
        'Previous workflow results (read-only):\nlaunch passed',
    };

    await agent.aiAct('Reset the page', options);

    expect(taskExecutor.action.mock.calls[0][3]).toBe(
      'Global context.\n\nUse buyer checkout rules.\n\nPrevious workflow results (read-only):\nlaunch passed',
    );
  });

  it('does not register a file chooser for an empty fileChooserAccept array', async () => {
    const { agent, taskExecutor, registerFileChooserListener } =
      createAgentStub();

    await agent.aiAct('Click the submit button', {
      fileChooserAccept: [],
    });

    expect(registerFileChooserListener).not.toHaveBeenCalled();
    expect(taskExecutor.action).toHaveBeenCalledTimes(1);
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
      expect.objectContaining(defaultModel),
      {
        context: 'Global context.\n\nThe current user is a logged-in buyer.',
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
      expect.objectContaining(defaultModel),
      {
        context: 'Global context.',
        domIncluded: false,
        screenshotIncluded: true,
      },
      undefined,
      {
        abortSignal: abortController.signal,
      },
    );
  });

  it('appends framework context after global and per-call assertion context', async () => {
    const { agent, taskExecutor } = createAgentStub();
    const options: AssertOptions & { _internalAdditionalContext: string } = {
      context: 'The current user is a logged-in buyer.',
      keepRawResponse: true,
      _internalAdditionalContext:
        'Previous workflow results (read-only):\nlaunch passed',
    };

    await agent.aiAssert('The success toast is visible', undefined, options);

    expect(taskExecutor.createTypeQueryExecution.mock.calls[0]?.[3]).toEqual({
      context:
        'Global context.\n\nThe current user is a logged-in buyer.\n\nPrevious workflow results (read-only):\nlaunch passed',
      domIncluded: false,
      screenshotIncluded: true,
    });
  });

  it('adds globalContext to locate, query, and wait operations', async () => {
    const { agent, taskExecutor } = createAgentStub();

    await agent.aiLocate('The checkout button', {
      context: 'Use the cart footer.',
    });
    await agent.aiBoolean('The checkout button is enabled', {
      context: 'The cart has one item.',
    });
    await agent.aiWaitFor('The order is complete', {
      context: 'The order id is 42.',
      timeoutMs: 1000,
      checkIntervalMs: 100,
    });

    const locatePlans = taskExecutor.runPlans.mock.calls[0]?.[1] as
      | Array<{ param: { prompt: string } }>
      | undefined;
    expect(locatePlans?.[0]?.param.prompt).toContain(
      '<CONTEXT>\nGlobal context.\n\nUse the cart footer.\n</CONTEXT>',
    );
    expect(taskExecutor.createTypeQueryExecution.mock.calls[0]?.[3]).toEqual({
      context: 'Global context.\n\nThe cart has one item.',
    });
    expect(taskExecutor.waitFor).toHaveBeenCalledWith(
      'The order is complete',
      {
        context: 'Global context.\n\nThe order id is 42.',
        timeoutMs: 1000,
        checkIntervalMs: 100,
      },
      expect.objectContaining(defaultModel),
    );
  });

  it('builds a readable assertion failure from the bounded task summary', async () => {
    const { agent, taskExecutor } = createAgentStub();
    taskExecutor.createTypeQueryExecution.mockRejectedValueOnce(
      new TaskExecutionError(
        {
          name: 'Error',
          message: 'upstream request failed',
          status: 503,
        },
        {
          taskId: 'task-1',
          type: 'Insight',
          subType: 'Assert',
          status: 'failed',
          thought: 'The expected toast was not visible',
          errorMessage: 'upstream request failed',
        },
      ),
    );

    const result = await agent.aiAssert(
      'The success toast is visible',
      undefined,
      {
        keepRawResponse: true,
      },
    );

    expect(result).toEqual({
      pass: false,
      thought: 'The expected toast was not visible',
      message:
        'Assertion failed: The success toast is visible\nReason: The expected toast was not visible',
    });
  });
});
