import { Agent } from '@/agent';
import { TaskExecutionError } from '@/task-runner';
import { describe, expect, it, rs } from '@rstest/core';

const planningModel = {
  config: { slot: 'default' },
  adapter: { planning: { cacheEnabled: true } },
};

const defaultModel = {
  config: { slot: 'default' },
  adapter: { planning: { cacheEnabled: false } },
};

const createInterfaceStub = () =>
  ({
    interfaceType: 'playwright',
    actionSpace: () => [],
  }) as any;

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
    aiContexts: {
      default: 'Default context.',
      aiAct: 'Default action context.',
    },
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
  it('normalizes legacy aiAct context options without overriding aiContexts.aiAct', () => {
    const warnSpy = rs.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      const legacyAgent = new Agent(createInterfaceStub(), {
        generateReport: false,
        aiActContext: 'Legacy action context.',
      });
      const configuredAgent = new Agent(createInterfaceStub(), {
        generateReport: false,
        aiContexts: { default: 'Default context.', aiAct: '' },
        aiActContext: 'Legacy action context.',
      });

      expect((legacyAgent as any).opts.aiContexts.aiAct).toBe(
        'Legacy action context.',
      );
      expect((configuredAgent as any).opts.aiContexts).toEqual({
        default: 'Default context.',
        aiAct: '',
      });
      expect((configuredAgent as any).opts.aiActContext).toBe('');
      expect((configuredAgent as any).opts.aiActionContext).toBe('');
      expect(warnSpy).toHaveBeenCalledTimes(2);
      expect(warnSpy).toHaveBeenNthCalledWith(
        1,
        '[Midscene]',
        expect.stringContaining('Agent option "aiActContext" is deprecated'),
      );
      expect(warnSpy).toHaveBeenNthCalledWith(
        2,
        '[Midscene]',
        expect.stringContaining('"aiContexts.aiAct" takes precedence'),
      );
    } finally {
      warnSpy.mockRestore();
    }
  });

  it('uses a per-call aiAct context when no Agent aiContexts are configured', async () => {
    const { agent, taskExecutor } = createAgentStub();
    (agent as any).opts.aiContexts = {};

    await agent.aiAct('Click the submit button', {
      context: 'Use buyer checkout rules.',
    });

    expect(taskExecutor.action.mock.calls[0][3]).toBe(
      'Use buyer checkout rules.',
    );
  });

  it('uses per-call context instead of API and default aiContexts', async () => {
    const { agent, taskExecutor, taskCache } = createAgentStub();

    await agent.aiAct('Click the submit button', {
      context: 'Use buyer checkout rules.',
    });

    expect(taskCache.matchPlanCache).toHaveBeenCalledWith(
      '<CONTEXT>\nUse buyer checkout rules.\n</CONTEXT>\n\nClick the submit button',
    );
    expect(taskExecutor.action).toHaveBeenCalledTimes(1);
    expect(taskExecutor.action.mock.calls[0][3]).toBe(
      'Use buyer checkout rules.',
    );
  });

  it('uses the API context instead of the default context', async () => {
    const { agent, taskExecutor, taskCache } = createAgentStub();

    await agent.aiAct('Click the submit button');

    expect(taskCache.matchPlanCache).toHaveBeenCalledWith(
      '<CONTEXT>\nDefault action context.\n</CONTEXT>\n\nClick the submit button',
    );
    expect(taskExecutor.action.mock.calls[0][3]).toBe(
      'Default action context.',
    );
  });

  it('uses the default context when no API context exists', async () => {
    const { agent, taskExecutor } = createAgentStub();
    (agent as any).opts.aiContexts = { default: 'Default context.' };

    await agent.aiAct('Click the submit button');

    expect(taskExecutor.action.mock.calls[0][3]).toBe('Default context.');
  });

  it('allows blank per-call context to clear API and default aiContexts', async () => {
    const { agent, taskExecutor, taskCache } = createAgentStub();

    await agent.aiAct('Click the submit button', {
      context: '',
    });

    expect(taskCache.matchPlanCache).toHaveBeenCalledWith(
      'Click the submit button',
    );
    expect(taskExecutor.action.mock.calls[0][3]).toBe('');
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
      expect.objectContaining(defaultModel),
      {
        context: 'Default context.',
        domIncluded: false,
        screenshotIncluded: true,
      },
      undefined,
      {
        abortSignal: abortController.signal,
      },
    );
  });

  it('uses per-call context for locate, query, and wait operations', async () => {
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
      '<CONTEXT>\nUse the cart footer.\n</CONTEXT>',
    );
    expect(taskExecutor.createTypeQueryExecution.mock.calls[0]?.[3]).toEqual({
      context: 'The cart has one item.',
    });
    expect(taskExecutor.waitFor).toHaveBeenCalledWith(
      'The order is complete',
      {
        context: 'The order id is 42.',
        timeoutMs: 1000,
        checkIntervalMs: 100,
      },
      expect.objectContaining(defaultModel),
    );
  });

  it('uses API aiContexts before the default context for each API', async () => {
    const { agent, taskExecutor } = createAgentStub();
    (agent as any).opts.aiContexts = {
      default: 'Default context.',
      aiLocate: 'Locate context.',
      aiBoolean: 'Boolean context.',
      aiWaitFor: 'Wait context.',
    };

    await agent.aiLocate('The checkout button');
    await agent.aiBoolean('The checkout button is enabled');
    await agent.aiWaitFor('The order is complete');

    const locatePlans = taskExecutor.runPlans.mock.calls[0]?.[1] as
      | Array<{ param: { prompt: string } }>
      | undefined;
    expect(locatePlans?.[0]?.param.prompt).toContain(
      '<CONTEXT>\nLocate context.\n</CONTEXT>',
    );
    expect(taskExecutor.createTypeQueryExecution.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({ context: 'Boolean context.' }),
    );
    expect(taskExecutor.waitFor.mock.calls[0]?.[1]).toEqual({
      context: 'Wait context.',
      timeoutMs: 15_000,
      checkIntervalMs: 3_000,
    });
  });

  it('uses the default context when an API context is undefined', async () => {
    const { agent, taskExecutor } = createAgentStub();
    (agent as any).opts.aiContexts = {
      default: 'Default context.',
      aiBoolean: undefined,
    };

    await agent.aiBoolean('The checkout button is enabled');

    expect(taskExecutor.createTypeQueryExecution.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({ context: 'Default context.' }),
    );
  });

  it('allows a blank API context to clear the default context', async () => {
    const { agent, taskExecutor } = createAgentStub();
    (agent as any).opts.aiContexts = {
      default: 'Default context.',
      aiBoolean: '',
    };

    await agent.aiBoolean('The checkout button is enabled');

    expect(taskExecutor.createTypeQueryExecution.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({ context: '' }),
    );
  });

  it('uses a separate API context for aiAsk', async () => {
    const { agent, taskExecutor } = createAgentStub();
    (agent as any).opts.aiContexts = {
      default: 'Default context.',
      aiString: 'String context.',
      aiAsk: 'Ask context.',
    };

    await agent.aiAsk('What is the order status?');

    expect(taskExecutor.createTypeQueryExecution.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({ context: 'Ask context.' }),
    );
  });

  it('updates default and API aiContexts through setAIContext', async () => {
    const { agent, taskExecutor } = createAgentStub();

    agent.setAIContext('default', 'New default context.');
    agent.setAIContext('aiBoolean', 'Runtime Boolean context.');
    await agent.aiBoolean('First check');

    agent.setAIContext('aiBoolean', undefined);
    await agent.aiBoolean('Second check');

    agent.setAIContext('aiBoolean', '');
    await agent.aiBoolean('Third check');

    expect(taskExecutor.createTypeQueryExecution.mock.calls[0]?.[3]).toEqual(
      expect.objectContaining({ context: 'Runtime Boolean context.' }),
    );
    expect(taskExecutor.createTypeQueryExecution.mock.calls[1]?.[3]).toEqual(
      expect.objectContaining({ context: 'New default context.' }),
    );
    expect(taskExecutor.createTypeQueryExecution.mock.calls[2]?.[3]).toEqual(
      expect.objectContaining({ context: '' }),
    );
  });

  it('keeps setAIActContext as a compatibility setter for aiAct', async () => {
    const { agent, taskExecutor } = createAgentStub();
    const warnSpy = rs.spyOn(console, 'warn').mockImplementation(() => {});

    try {
      await agent.setAIActContext('Updated action context.');
      await agent.aiAct('Click the submit button');

      expect(taskExecutor.action.mock.calls[0][3]).toBe(
        'Updated action context.',
      );
      expect(warnSpy).toHaveBeenCalledWith(
        '[Midscene]',
        expect.stringContaining('setAIActContext() is deprecated'),
      );
    } finally {
      warnSpy.mockRestore();
    }
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
