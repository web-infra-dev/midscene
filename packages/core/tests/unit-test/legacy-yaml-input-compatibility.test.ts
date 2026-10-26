import { Agent } from '@/agent';
import { commonAgentTestRunnerNodeDefinitions } from '@/agent/test-runner-nodes';
import { TaskRunner } from '@/task-runner';
import type { MidsceneYamlFlowItem, MidsceneYamlScript } from '@/types';
import { ScriptPlayer } from '@/yaml/player';
import { compileLegacyFlowItem } from '@/yaml/test-runner-compat';
import { legacyAgentTestRunnerNodeDefinitions } from '@/yaml/test-runner-nodes';
import { describe, expect, rstest as rs, test } from '@rstest/core';

// Frozen calls from the old player, not reconstructed from the new compiler.
const accepted = [
  {
    id: 'locate observation options',
    input: {
      aiLocate: 'button',
      domIncluded: 'visible-only',
      screenshotIncluded: false,
    },
    method: 'aiLocate',
    prompt: 'button',
    options: { domIncluded: 'visible-only', screenshotIncluded: false },
  },
  ...['aiQuery', 'aiNumber', 'aiString', 'aiBoolean', 'aiAsk', 'aiAssert'].map(
    (method) => ({
      id: `${method} extra options`,
      input: {
        [method]: 'value',
        cacheable: false,
        extension: { enabled: true },
      },
      method,
      prompt: 'value',
      options: {
        cacheable: false,
        extension: { enabled: true },
        ...(method === 'aiAssert' ? { keepRawResponse: true } : {}),
      },
    }),
  ),
  {
    id: 'act observation options',
    input: { aiAct: 'open cart', domIncluded: 'visible-only' },
    method: 'aiAct',
    prompt: 'open cart',
    options: { domIncluded: 'visible-only' },
  },
  {
    id: 'tap observation options',
    input: { aiTap: 'button', domIncluded: 'visible-only' },
    method: 'aiTap',
    prompt: 'button',
    options: { domIncluded: 'visible-only' },
  },
  {
    id: 'scroll observation options',
    input: { aiScroll: 'list', screenshotIncluded: false },
    method: 'aiScroll',
    prompt: 'list',
    options: { screenshotIncluded: false },
  },
  {
    id: 'zero timeout and alias precedence',
    input: { aiWaitFor: 'ready', timeout: 0, timeoutMs: 25 },
    method: 'aiWaitFor',
    prompt: 'ready',
    options: { timeout: 0, timeoutMs: 0 },
  },
  {
    id: 'zero wait interval',
    input: { aiWaitFor: 'ready', checkIntervalMs: 0 },
    method: 'aiWaitFor',
    prompt: 'ready',
    options: { checkIntervalMs: 0 },
  },
  {
    id: 'empty images in tap options',
    input: { aiTap: 'button', images: [] },
    method: 'aiTap',
    prompt: 'button',
    options: { images: [] },
  },
  {
    id: 'empty images in structured act prompt',
    input: {
      aiAct: { prompt: 'open cart', images: [], legacyHint: 'preserved' },
    },
    method: 'aiAct',
    prompt: { prompt: 'open cart', images: [], legacyHint: 'preserved' },
    options: {},
  },
  {
    id: 'query options stay options',
    input: { aiQuery: 'title', images: [], convertHttpImage2Base64: false },
    method: 'aiQuery',
    prompt: 'title',
    options: { images: [], convertHttpImage2Base64: false },
  },
  {
    id: 'invalid instruction falls back to the action prompt',
    input: { aiAct: 'open cart', instruction: { prompt: '' } },
    method: 'aiAct',
    prompt: 'open cart',
    options: {},
  },
  {
    id: 'whitespace is not rejected by a new Node rule',
    input: { aiTap: ' ' },
    method: 'aiTap',
    prompt: ' ',
    options: {},
  },
  {
    id: 'nested locate has the old precedence',
    input: {
      aiTap: {
        prompt: 'fallback',
        locate: { prompt: 'preferred', images: [], cacheable: false },
      },
      cacheable: true,
    },
    method: 'aiTap',
    prompt: 'preferred',
    options: { images: [], cacheable: true },
  },
  {
    id: 'assert keeps structured prompt separate from options',
    input: {
      aiAssert: { prompt: 'ready', images: [] },
      convertHttpImage2Base64: false,
      keepRawResponse: false,
    },
    method: 'aiAssert',
    prompt: { prompt: 'ready', images: [] },
    options: { convertHttpImage2Base64: false, keepRawResponse: true },
  },
];

const forbidden = [
  ...[
    { id: 'empty step', input: null },
    { id: 'undefined step', input: undefined },
    { id: 'string step', input: 'invalid' },
    { id: 'numeric step', input: 42 },
    { id: 'boolean step', input: false },
    { id: 'array step', input: [] },
  ].map((contract) => ({
    ...contract,
    error: 'flow item must be an object',
  })),
  ...[
    'aiAssert',
    'aiQuery',
    'aiNumber',
    'aiString',
    'aiBoolean',
    'aiAsk',
    'aiLocate',
  ].flatMap((method) =>
    [false, undefined].map((observe) => ({
      id: `${method} observe=${observe}`,
      input: { [method]: 'value', observe },
      error: '`observe` is not supported',
    })),
  ),
  ...[
    'aiAssert',
    'aiQuery',
    'aiNumber',
    'aiString',
    'aiBoolean',
    'aiAsk',
    'aiLocate',
    'aiWaitFor',
    'aiTap',
  ].map((method) => ({
    id: `${method} missing prompt`,
    input: { [method]: '' },
    error: `missing prompt for ${method}`,
  })),
  {
    id: 'act nullish alias precedence',
    input: { aiAct: '', aiAction: 'must not replace an empty primary alias' },
    error: 'missing prompt for ai (aiAct)',
  },
  {
    id: 'missing gherkin scenario',
    input: { runGherkinScenario: '' },
    error: 'missing scenario',
  },
  {
    id: 'invalid sleep',
    input: { sleep: 0 },
    error: 'ms for sleep must be greater than 0',
  },
  {
    id: 'unknown action',
    input: { unknownAction: 'target' },
    error: 'unknown flowItem in yaml',
  },
];

describe('legacy YAML input contracts without native schema narrowing', () => {
  test.each(accepted)(
    '$id reaches Agent unchanged through ScriptPlayer',
    async ({ input, method, prompt, options }) => {
      const result =
        method === 'aiAct'
          ? undefined
          : method === 'aiAssert'
            ? { pass: true, thought: 'ok', message: 'passed' }
            : { value: 'result' };
      const call = rs.fn().mockResolvedValue(result);
      const player = new ScriptPlayer(
        {
          agent: { generateReport: false },
          tasks: [{ name: 'old input', flow: [input as MidsceneYamlFlowItem] }],
        },
        async () => ({
          agent: { [method]: call, getActionSpace: async () => [] } as any,
          freeFn: [],
        }),
      );
      await player.run();
      expect(player.status).toBe('done');
      expect(player.taskStatusList[0].status).toBe('done');
      expect(call).toHaveBeenCalledTimes(1);
      const args = call.mock.calls[0];
      expect(args[0]).toEqual(prompt);
      if (method === 'aiAssert') expect(args[1]).toBeUndefined();
      const { abortSignal: _signal, ...actualOptions } =
        args[method === 'aiAssert' ? 2 : 1];
      expect(actualOptions).toEqual(options);
      const step = compileLegacyFlowItem(input as MidsceneYamlFlowItem);
      if (step.meta.captureResult)
        expect(player.result).toEqual({ '0': result });
    },
  );

  test('passes empty JavaScript to Agent instead of adding a nonblank requirement', async () => {
    const evaluateJavaScript = rs.fn().mockResolvedValue(undefined);
    const player = new ScriptPlayer(
      {
        agent: { generateReport: false },
        tasks: [{ name: 'empty script', flow: [{ javascript: '' }] }],
      },
      async () => ({
        agent: { evaluateJavaScript, getActionSpace: async () => [] } as any,
        freeFn: [],
      }),
    );
    await player.run();
    expect(player.status).toBe('done');
    expect(evaluateJavaScript).toHaveBeenCalledWith('');
  });

  test.each(forbidden)(
    '$id fails at its task and preserves continuation',
    async ({ input, error }) => {
      for (const continueOnError of [false, true]) {
        const evaluateJavaScript = rs.fn().mockResolvedValue(1);
        const forbiddenCall = rs.fn();
        const agent = {
          ...Object.fromEntries(
            [
              'aiAct',
              'aiAssert',
              'aiQuery',
              'aiNumber',
              'aiString',
              'aiBoolean',
              'aiAsk',
              'aiLocate',
              'aiWaitFor',
              'aiTap',
              'runGherkinScenario',
              'sleep',
              'callActionInActionSpace',
            ].map((method) => [method, forbiddenCall]),
          ),
          evaluateJavaScript,
          getActionSpace: async () => [],
        };
        const script = {
          agent: { generateReport: false },
          tasks: [
            { name: 'first', flow: [{ javascript: 'first' }] },
            { name: 'invalid', continueOnError, flow: [input] },
            { name: 'last', flow: [{ javascript: 'last' }] },
          ],
        } as MidsceneYamlScript;
        const player = new ScriptPlayer(script, async () => ({
          agent: agent as any,
          freeFn: [],
        }));
        await player.run();
        expect(evaluateJavaScript.mock.calls.map(([code]) => code)).toEqual(
          continueOnError ? ['first', 'last'] : ['first'],
        );
        expect(player.taskStatusList.map(({ status }) => status)).toEqual([
          'done',
          'error',
          continueOnError ? 'done' : 'init',
        ]);
        expect(player.taskStatusList[1].error?.message).toContain(error);
        expect(forbiddenCall).not.toHaveBeenCalled();
      }
    },
  );

  test.each([
    {
      node: 'aiLocate',
      input: {
        prompt: 'button',
        options: { domIncluded: 'visible-only', screenshotIncluded: false },
      },
    },
    {
      node: 'aiQuery',
      input: { prompt: 'title', options: { cacheable: false } },
    },
    {
      node: 'aiAct',
      input: { prompt: 'open cart', options: { domIncluded: 'visible-only' } },
    },
    {
      node: 'aiWaitFor',
      input: { prompt: 'ready', options: { timeoutMs: 0 } },
    },
    {
      node: 'aiWaitFor',
      input: { prompt: 'ready', options: { checkIntervalMs: 0 } },
    },
    { node: 'aiTap', input: { prompt: { prompt: 'button', images: [] } } },
    { node: 'aiAct', input: { prompt: { prompt: 'open cart', images: [] } } },
    { node: 'aiTap', input: { prompt: ' ' } },
    { node: 'javascript', input: { script: '' } },
  ])('keeps native $node input validation strict', ({ node, input }) => {
    const native = commonAgentTestRunnerNodeDefinitions.find(
      (definition) => definition.name === node,
    )!;
    expect(native.inputSchema.safeParse(input).success).toBe(false);
  });

  test('selects only explicitly bound legacy protocols and reuses shared execution', () => {
    const shared = new Map(
      commonAgentTestRunnerNodeDefinitions.map((node) => [node.name, node]),
    );
    for (const legacy of legacyAgentTestRunnerNodeDefinitions) {
      const native = shared.get(legacy.name);
      if (!native) continue;
      expect(legacy.inputSchema).not.toBe(native.inputSchema);
      expect(legacy.execute).toBe(native.execute);
    }
    expect(
      legacyAgentTestRunnerNodeDefinitions.some(
        (node) => node.name === 'aiDoubleClick',
      ),
    ).toBe(false);
    const locate = legacyAgentTestRunnerNodeDefinitions.find(
      (node) => node.name === 'aiLocate',
    )!;
    expect(
      locate.inputSchema.safeParse({
        prompt: 'button',
        options: {},
        accidentalEnvelopeField: true,
      }).success,
    ).toBe(false);
  });
});

const createRealAgent = () =>
  new Agent(
    {
      interfaceType: 'fixture',
      actionSpace: () => [],
      describe: () => 'legacy input test',
      size: async () => ({ width: 1, height: 1 }),
      screenshotBase64: async () =>
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR4nGNgYAAAAAMAASsJTYQAAAAASUVORK5CYII=',
    } as any,
    {
      generateReport: false,
      modelConfig: {
        MIDSCENE_MODEL_NAME: 'test-model',
        MIDSCENE_MODEL_FAMILY: 'qwen3-vl',
        MIDSCENE_MODEL_BASE_URL: 'https://example.invalid/v1',
        MIDSCENE_MODEL_API_KEY: 'test-key',
      },
    },
  );

describe('legacy inputs reach the real Agent before model execution', () => {
  test('preserves the real Agent assertion diagnostic with a custom YAML error message', async () => {
    const agent = createRealAgent();
    rs.spyOn(agent.taskExecutor, 'createTypeQueryExecution').mockResolvedValue({
      output: false,
      thought: 'the success toast is missing',
      runner: new TaskRunner('stubbed assertion', () => agent.getUIContext()),
    });
    const player = new ScriptPlayer(
      {
        agent: { generateReport: false },
        tasks: [
          {
            name: 'assertion',
            flow: [
              {
                aiAssert: 'a success toast is visible',
                errorMessage: 'submission failed',
              },
            ],
          },
        ],
      },
      async () => ({ agent, freeFn: [] }),
    );
    try {
      await player.run();
      expect(player.taskStatusList[0].status).toBe('error');
      expect(player.taskStatusList[0].error?.message).toBe(
        'Assertion failed: submission failed\nReason: the success toast is missing',
      );
      expect(player.result['0']).toEqual({
        pass: false,
        thought: 'the success toast is missing',
        message:
          'Assertion failed: submission failed\nReason: the success toast is missing',
      });
    } finally {
      await agent.destroy();
    }
  });

  test.each([
    { timeout: 0 },
    { checkIntervalMs: 0 },
    { timeout: 0, timeoutMs: 25, checkIntervalMs: 0 },
  ])('keeps real Agent wait defaults for %o', async (options) => {
    const agent = createRealAgent();
    const waitFor = rs.spyOn(agent.taskExecutor, 'waitFor').mockResolvedValue({
      output: undefined,
      runner: new TaskRunner('stubbed wait', () => agent.getUIContext()),
    });
    const player = new ScriptPlayer(
      {
        agent: { generateReport: false },
        tasks: [{ name: 'wait', flow: [{ aiWaitFor: 'ready', ...options }] }],
      },
      async () => ({ agent, freeFn: [] }),
    );
    try {
      await player.run();
      expect(player.status).toBe('done');
      expect(waitFor).toHaveBeenCalledWith(
        'ready',
        expect.objectContaining({ timeoutMs: 15_000, checkIntervalMs: 3_000 }),
        expect.anything(),
      );
    } finally {
      await agent.destroy();
    }
  });

  test('accepts the reported aiLocate flags without calling a model', async () => {
    const agent = createRealAgent();
    const runPlans = rs
      .spyOn(agent.taskExecutor, 'runPlans')
      .mockResolvedValue({
        output: { element: { center: [10, 20] } },
        runner: new TaskRunner('stubbed locate', () => agent.getUIContext()),
      });
    const player = new ScriptPlayer(
      {
        agent: { generateReport: false },
        tasks: [
          {
            name: 'locate',
            flow: [
              {
                aiLocate: 'button',
                domIncluded: 'visible-only',
                screenshotIncluded: false,
              },
            ],
          },
        ],
      },
      async () => ({ agent, freeFn: [] }),
    );
    try {
      await player.run();
      expect(player.status).toBe('done');
      expect(runPlans).toHaveBeenCalledTimes(1);
      expect(player.result['0']).toMatchObject({ center: [10, 20] });
    } finally {
      await agent.destroy();
    }
  });
});
