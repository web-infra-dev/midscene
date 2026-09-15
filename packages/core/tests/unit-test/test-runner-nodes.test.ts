import { describe, expect, it, rs } from '@rstest/core';
import { Agent } from '../../src/agent/agent';
import { commonAgentTestRunnerNodeDefinitions } from '../../src/agent/test-runner-nodes';

describe('Agent Test Runner Node definitions', () => {
  it('forwards sleep through the reportable Agent API with cancellation', async () => {
    const definition = commonAgentTestRunnerNodeDefinitions.find(
      (node) => node.name === 'sleep',
    )!;
    const signal = new AbortController().signal;
    const sleep = rs.fn().mockResolvedValue(undefined);
    await definition.execute(
      { sleep },
      definition.inputSchema.parse({ ms: 20 }),
      { signal },
    );
    expect(sleep).toHaveBeenCalledWith(20, { abortSignal: signal });
  });

  it('does not dispatch an already-aborted sleep', async () => {
    const definition = commonAgentTestRunnerNodeDefinitions.find(
      (node) => node.name === 'sleep',
    )!;
    const controller = new AbortController();
    const reason = new Error('Stopped sleep');
    controller.abort(reason);
    const sleep = rs.fn();
    await expect(
      definition.execute({ sleep }, definition.inputSchema.parse({ ms: 20 }), {
        signal: controller.signal,
      }),
    ).rejects.toBe(reason);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('fails an assertion even when keepRawResponse returns pass: false', async () => {
    const definition = commonAgentTestRunnerNodeDefinitions.find(
      (node) => node.name === 'aiAssert',
    )!;
    const input = definition.inputSchema.parse({
      prompt: 'condition',
      options: { keepRawResponse: true },
    });
    await expect(
      definition.execute(
        {
          aiAssert: async () => ({ pass: false, message: 'not matched' }),
        } as any,
        input,
        {
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow('not matched');
  });

  it('exposes the complete common Agent capability set', () => {
    expect(Agent.getTestRunnerNodeDefinitions()).toBe(
      commonAgentTestRunnerNodeDefinitions,
    );
    expect(
      commonAgentTestRunnerNodeDefinitions.map((definition) => [
        definition.name,
        definition.stringInputKey,
      ]),
    ).toEqual([
      ['sleep', undefined],
      ['Finalize', undefined],
      ['aiAct', 'prompt'],
      ['aiTap', 'prompt'],
      ['aiAssert', 'prompt'],
      ['aiBoolean', 'prompt'],
      ['aiNumber', 'prompt'],
      ['aiString', 'prompt'],
      ['aiAsk', 'prompt'],
      ['recordToReport', 'title'],
      ['aiHover', 'prompt'],
      ['aiDoubleClick', 'prompt'],
      ['aiRightClick', 'prompt'],
      ['aiClearInput', 'prompt'],
      ['aiInput', undefined],
      ['aiKeyboardPress', 'keyName'],
      ['aiScroll', 'prompt'],
      ['aiPinch', undefined],
      ['aiLongPress', 'prompt'],
      ['aiDragAndDrop', undefined],
      ['aiLocate', 'prompt'],
      ['aiQuery', 'prompt'],
      ['aiWaitFor', 'prompt'],
      ['javascript', 'script'],
      ['runGherkinScenario', 'scenario'],
      ['action', undefined],
    ]);
  });

  it('documents every common Agent Node', () => {
    expect(
      commonAgentTestRunnerNodeDefinitions.filter(
        (definition) => !definition.description?.trim(),
      ),
    ).toEqual([]);
  });

  it('preserves explicit empty context overrides for every AI node', async () => {
    for (const definition of commonAgentTestRunnerNodeDefinitions) {
      if (
        !definition.name.startsWith('ai') ||
        ['aiInput', 'aiKeyboardPress', 'aiPinch', 'aiDragAndDrop'].includes(
          definition.name,
        )
      )
        continue;
      const calls: unknown[][] = [];
      const agent = {
        [definition.name]: async (...args: unknown[]) => {
          calls.push(args);
          return undefined;
        },
      };
      const input = definition.inputSchema.parse({
        prompt: 'Inspect the page',
        options: { context: '' },
      });
      await definition.execute(agent, input, {
        signal: new AbortController().signal,
      });
      const options = calls[0][definition.name === 'aiAssert' ? 2 : 1];
      expect(options).toEqual(expect.objectContaining({ context: '' }));
    }
  });

  it.each([
    {
      name: 'aiInput',
      input: {
        prompt: 'Amount',
        value: 0,
        options: { context: '', mode: 'replace', inputStrategy: 'bulk' },
      },
      args: [
        'Amount',
        { context: '', mode: 'replace', inputStrategy: 'bulk', value: 0 },
      ],
    },
    {
      name: 'aiKeyboardPress',
      input: { keyName: 'Control+A', options: { context: '' } },
      args: [undefined, { context: '', keyName: 'Control+A' }],
    },
    {
      name: 'aiScroll',
      input: { options: { scrollType: 'scrollToBottom', distance: null } },
      args: [undefined, { scrollType: 'scrollToBottom', distance: null }],
    },
    {
      name: 'aiPinch',
      input: { direction: 'out', options: { context: '', duration: 500 } },
      args: [undefined, { context: '', duration: 500, direction: 'out' }],
    },
    {
      name: 'aiLongPress',
      input: { prompt: 'Card', options: { duration: 800 } },
      args: ['Card', { duration: 800 }],
    },
  ])(
    'forwards $name through its current Agent signature',
    async ({ name, input, args }) => {
      const call = rs.fn().mockResolvedValue(undefined);
      const node = commonAgentTestRunnerNodeDefinitions.find(
        (node) => node.name === name,
      )!;
      await node.execute({ [name]: call }, node.inputSchema.parse(input), {
        signal: new AbortController().signal,
      });
      expect(call).toHaveBeenCalledWith(...args);
    },
  );

  it('passes both drag targets through the shared locator normalization', async () => {
    const callActionInActionSpace = rs.fn().mockResolvedValue(undefined);
    const node = commonAgentTestRunnerNodeDefinitions.find(
      (node) => node.name === 'aiDragAndDrop',
    )!;
    const from = {
      prompt: 'Source card',
      images: [{ name: 'card', url: './card.png' }],
    };
    await node.execute(
      { callActionInActionSpace },
      node.inputSchema.parse({
        from,
        to: 'Destination column',
        options: { context: '', deepLocate: true },
      }),
      { signal: new AbortController().signal },
    );
    expect(callActionInActionSpace).toHaveBeenCalledWith('DragAndDrop', {
      from: expect.objectContaining({ prompt: from, deepLocate: true }),
      to: expect.objectContaining({
        prompt: 'Destination column',
        deepLocate: true,
      }),
    });
  });

  it('returns query and JavaScript values without coercing false or structured data', async () => {
    for (const { name, method, input, value, args } of [
      {
        name: 'aiQuery',
        method: 'aiQuery',
        input: { prompt: { total: 'The basket total' } },
        value: { total: 0 },
        args: [
          { total: 'The basket total' },
          { abortSignal: expect.any(AbortSignal) },
        ],
      },
      {
        name: 'javascript',
        method: 'evaluateJavaScript',
        input: { script: 'window.isReady' },
        value: false,
        args: ['window.isReady'],
      },
    ]) {
      const call = rs.fn().mockResolvedValue(value);
      const node = commonAgentTestRunnerNodeDefinitions.find(
        (node) => node.name === name,
      )!;
      expect(
        await node.execute({ [method]: call }, node.inputSchema.parse(input), {
          signal: new AbortController().signal,
        }),
      ).toEqual({ data: value });
      expect(call).toHaveBeenCalledWith(...args);
    }
  });

  it('forwards cancellation and timing options to wait and Gherkin calls', async () => {
    const signal = new AbortController().signal;
    for (const { name, input, args } of [
      {
        name: 'aiWaitFor',
        input: {
          prompt: 'Ready',
          options: { timeoutMs: 100, checkIntervalMs: 10 },
        },
        args: [
          'Ready',
          { timeoutMs: 100, checkIntervalMs: 10, abortSignal: signal },
        ],
      },
      {
        name: 'runGherkinScenario',
        input: {
          scenario: 'Given I open the page\nThen it is ready',
          options: { context: '' },
        },
        args: [
          'Given I open the page\nThen it is ready',
          { context: '', abortSignal: signal },
        ],
      },
    ]) {
      const call = rs.fn().mockResolvedValue(undefined);
      const node = commonAgentTestRunnerNodeDefinitions.find(
        (node) => node.name === name,
      )!;
      await node.execute({ [name]: call }, node.inputSchema.parse(input), {
        signal,
      });
      expect(call).toHaveBeenCalledWith(...args);
    }
  });

  it('defers custom action validation to the executing ActionSpace', async () => {
    const node = commonAgentTestRunnerNodeDefinitions.find(
      (node) => node.name === 'action',
    )!;
    const input = node.inputSchema.parse({
      name: 'CustomPlatformAction',
      params: { platformSpecific: 42 },
    });
    const callActionInActionSpace = rs
      .fn()
      .mockResolvedValue({ customResult: false });
    const agent = { callActionInActionSpace, getActionSpace: rs.fn() };
    const context = { signal: new AbortController().signal };
    expect(await node.execute(agent, input, context)).toEqual({
      data: { customResult: false },
    });
    expect(callActionInActionSpace).toHaveBeenCalledWith(
      'CustomPlatformAction',
      { platformSpecific: 42 },
    );
    expect(agent.getActionSpace).not.toHaveBeenCalled();
    await node.execute(
      agent,
      node.inputSchema.parse({ name: 'CustomStringAction', params: 'text' }),
      context,
    );
    expect(callActionInActionSpace).toHaveBeenLastCalledWith(
      'CustomStringAction',
      'text',
    );
    callActionInActionSpace.mockRejectedValueOnce(
      new Error('Invalid parameters for action CustomPlatformAction'),
    );
    await expect(node.execute(agent, input, context)).rejects.toThrow(
      'Invalid parameters for action CustomPlatformAction',
    );
  });

  it('rejects a missing optional capability only when its Node executes', async () => {
    const node = commonAgentTestRunnerNodeDefinitions.find(
      (node) => node.name === 'aiInput',
    )!;
    await expect(
      node.execute(
        {},
        { prompt: 'Amount', value: '' },
        {
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow('with aiInput()');
  });

  it('keeps multimodal prompts and method options nested', () => {
    expect(
      commonAgentTestRunnerNodeDefinitions
        .find((node) => node.name === 'aiAct')!
        .inputSchema.safeParse({
          prompt: {
            prompt: 'Match the target',
            images: [{ name: 'target', url: './target.png' }],
          },
          options: { deepLocate: true },
        }).success,
    ).toBe(true);
    expect(
      commonAgentTestRunnerNodeDefinitions
        .find((node) => node.name === 'aiAct')!
        .inputSchema.safeParse({
          prompt: 'Match the target',
          images: [{ name: 'target', url: './target.png' }],
        }).success,
    ).toBe(false);
  });
});
