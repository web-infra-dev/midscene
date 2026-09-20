import type { MidsceneYamlFlowItem } from '@/types';
import {
  type LegacyYamlActionIdentity,
  compileLegacyFlowItem,
} from '@/yaml/test-runner-compat';
import {
  getLegacyYamlResultData,
  legacyAgentTestRunnerNodeDefinitions,
} from '@/yaml/test-runner-nodes';
import { describe, expect, rstest as rs, test } from '@rstest/core';
import { z } from 'zod';

interface LegacyFlowContract {
  id: string;
  /** Frozen old fields exercised by this executable example. */
  legacyFields: readonly string[];
  input: MidsceneYamlFlowItem;
  actionSpace?: readonly LegacyYamlActionIdentity[];
  expected: ReturnType<typeof compileLegacyFlowItem>;
}

const resultMeta = (resultName?: string) => ({
  continueOnError: false,
  captureResult: true,
  ...(resultName ? { resultName } : {}),
});

const actions: readonly LegacyYamlActionIdentity[] = [
  { name: 'Echo', interfaceAlias: 'echo', paramSchema: z.string() },
  { name: 'Hover', interfaceAlias: 'aiHover' },
  { name: 'Launch', interfaceAlias: 'launch' },
  { name: 'Terminate', interfaceAlias: 'terminate' },
  { name: 'RunHdcShell', interfaceAlias: 'runHdcShell' },
  { name: 'RunAdbShell', interfaceAlias: 'runAdbShell' },
];

// Freeze both compiled inputs and (below) the old player's Agent calls. A
// successful mapping alone is not proof that the real Node can execute it.
const contracts: readonly LegacyFlowContract[] = [
  ...(['ai', 'aiAction', 'aiAct'] as const).map((field) => ({
    id: `${field}-alias-and-instruction-precedence`,
    legacyFields: [field, 'instruction', 'aiActionProgressTips', 'cacheable'],
    input: {
      [field]: 'fallback',
      instruction: 'preferred',
      aiActionProgressTips: ['accepted but historically not executed'],
      cacheable: false,
    } as MidsceneYamlFlowItem,
    expected: {
      node: 'aiAct',
      input: {
        prompt: 'preferred',
        options: {
          aiActionProgressTips: ['accepted but historically not executed'],
          cacheable: false,
        },
      },
      meta: { continueOnError: false },
    },
  })),
  ...(
    [
      'aiQuery',
      'aiNumber',
      'aiString',
      'aiBoolean',
      'aiAsk',
      'aiLocate',
    ] as const
  ).map((field) => ({
    id: `${field}-result-and-options`,
    legacyFields: [
      field,
      'name',
      'context',
      'domIncluded',
      'screenshotIncluded',
    ],
    input: {
      [field]: 'value',
      name: 'answer',
      context: '',
      domIncluded: 'visible-only',
      screenshotIncluded: false,
    } as MidsceneYamlFlowItem,
    expected: {
      node: field,
      input: {
        prompt: 'value',
        options: {
          context: '',
          domIncluded: 'visible-only',
          screenshotIncluded: false,
        },
      },
      meta: resultMeta('answer'),
    },
  })),
  {
    id: 'tap-multimodal-options',
    legacyFields: [
      'aiTap',
      'images',
      'convertHttpImage2Base64',
      'deepLocate',
      'xpath',
      'fileChooserAccept',
      'uiContext',
    ],
    input: {
      aiTap: 'button',
      images: [{ name: 'reference', url: 'data:image/png;base64,fixture' }],
      convertHttpImage2Base64: false,
      deepLocate: true,
      xpath: '//button',
      fileChooserAccept: ['./fixture.txt'],
      uiContext: { fixture: true },
    } as MidsceneYamlFlowItem,
    expected: {
      node: 'aiTap',
      input: {
        prompt: 'button',
        options: {
          images: [{ name: 'reference', url: 'data:image/png;base64,fixture' }],
          convertHttpImage2Base64: false,
          deepLocate: true,
          xpath: '//button',
          fileChooserAccept: ['./fixture.txt'],
          uiContext: { fixture: true },
        },
      },
      meta: { continueOnError: false },
    },
  },
  {
    id: 'tap-structured-prompt',
    legacyFields: ['aiTap'],
    input: {
      aiTap: {
        prompt: 'button',
        images: [{ name: 'reference', url: 'data:image/png;base64,fixture' }],
        convertHttpImage2Base64: false,
      },
    } as MidsceneYamlFlowItem,
    expected: {
      node: 'aiTap',
      input: {
        prompt: {
          prompt: 'button',
          images: [{ name: 'reference', url: 'data:image/png;base64,fixture' }],
          convertHttpImage2Base64: false,
        },
        options: {},
      },
      meta: { continueOnError: false },
    },
  },
  {
    id: 'tap-nested-locate-and-deep-think-alias',
    legacyFields: ['aiTap', 'locate', 'prompt', 'deepThink'],
    input: {
      aiTap: { locate: { prompt: 'nested button', deepThink: true } },
    } as MidsceneYamlFlowItem,
    expected: {
      node: 'aiTap',
      input: { prompt: 'nested button', options: { deepThink: true } },
      meta: { continueOnError: false },
    },
  },
  {
    id: 'input-current-shape-and-falsy-value',
    legacyFields: ['aiInput', 'value', 'mode'],
    input: {
      aiInput: 'field',
      value: 0,
      mode: 'replace',
    } as MidsceneYamlFlowItem,
    expected: {
      node: 'action',
      input: {
        name: 'Input',
        params: {
          mode: 'replace',
          value: '0',
          locate: { prompt: 'field', deepLocate: false, cacheable: true },
        },
      },
      meta: { continueOnError: false },
    },
  },
  {
    id: 'input-legacy-locate-shape',
    legacyFields: ['aiInput', 'locate', 'mode'],
    input: {
      aiInput: 'text',
      locate: 'field',
      mode: 'append',
    } as MidsceneYamlFlowItem,
    expected: {
      node: 'action',
      input: {
        name: 'Input',
        params: {
          mode: 'append',
          value: 'text',
          locate: { prompt: 'field', deepLocate: false, cacheable: true },
        },
      },
      meta: { continueOnError: false },
    },
  },
  {
    id: 'keyboard-global-shape',
    legacyFields: ['aiKeyboardPress'],
    input: { aiKeyboardPress: 'Enter' } as MidsceneYamlFlowItem,
    expected: {
      node: 'action',
      input: { name: 'KeyboardPress', params: { keyName: 'Enter' } },
      meta: { continueOnError: false },
    },
  },
  {
    id: 'keyboard-located-shape',
    legacyFields: ['aiKeyboardPress', 'keyName'],
    input: {
      aiKeyboardPress: 'field',
      keyName: 'Enter',
    } as MidsceneYamlFlowItem,
    expected: {
      node: 'action',
      input: {
        name: 'KeyboardPress',
        params: {
          keyName: 'Enter',
          locate: { prompt: 'field', deepLocate: false, cacheable: true },
        },
      },
      meta: { continueOnError: false },
    },
  },
  {
    id: 'scroll-prompt-and-options',
    legacyFields: ['aiScroll', 'direction', 'distance', 'scrollType'],
    input: {
      aiScroll: 'list',
      direction: 'down',
      distance: 0,
      scrollType: 'untilBottom',
    } as MidsceneYamlFlowItem,
    expected: {
      node: 'aiScroll',
      input: {
        prompt: 'list',
        options: {
          direction: 'down',
          distance: 0,
          scrollType: 'untilBottom',
        },
      },
      meta: { continueOnError: false },
    },
  },
  {
    id: 'wait-timeout-and-observation-options',
    legacyFields: ['aiWaitFor', 'timeout', 'domIncluded', 'screenshotIncluded'],
    input: {
      aiWaitFor: 'ready',
      timeout: 25,
      domIncluded: 'visible-only',
      screenshotIncluded: false,
    },
    expected: {
      node: 'aiWaitFor',
      input: {
        prompt: 'ready',
        options: {
          timeout: 25,
          timeoutMs: 25,
          domIncluded: 'visible-only',
          screenshotIncluded: false,
        },
      },
      meta: { continueOnError: false },
    },
  },
  {
    id: 'assert-message-and-raw-result',
    legacyFields: ['aiAssert', 'errorMessage', 'name'],
    input: {
      aiAssert: 'cart is ready',
      errorMessage: 'cart assertion failed',
      name: 'assertion',
    },
    expected: {
      node: 'aiAssert',
      input: {
        prompt: 'cart is ready',
        options: { keepRawResponse: true },
        message: 'cart assertion failed',
      },
      meta: resultMeta('assertion'),
    },
  },
  {
    id: 'javascript-named-result',
    legacyFields: ['javascript', 'name'],
    input: { javascript: 'value()', name: 'answer' },
    expected: {
      node: 'javascript',
      input: { script: 'value()' },
      meta: resultMeta('answer'),
    },
  },
  {
    id: 'gherkin-disables-plan-cache',
    legacyFields: ['runGherkinScenario'],
    input: { runGherkinScenario: 'Given a page' },
    expected: {
      node: 'runGherkinScenario',
      input: { scenario: 'Given a page', options: { cacheable: false } },
      meta: { continueOnError: false },
    },
  },
  ...(['recordToReport', 'logScreenshot'] as const).map((field) => ({
    id: `${field}-report-record`,
    legacyFields: [field, 'content'],
    input: { [field]: 'evidence', content: '' } as MidsceneYamlFlowItem,
    expected: {
      node: 'recordToReport',
      input: { title: 'evidence', options: { content: '' } },
      meta: { continueOnError: false },
    },
  })),
  {
    id: 'custom-string-action-alias',
    legacyFields: ['<ActionSpace.interfaceAlias>', 'name'],
    input: { echo: 'hello', name: 'answer' } as MidsceneYamlFlowItem,
    actionSpace: actions,
    expected: {
      node: 'action',
      input: { name: 'Echo', params: 'hello' },
      meta: resultMeta('answer'),
    },
  },
  {
    id: 'custom-locate-action-alias',
    legacyFields: ['<ActionSpace.interfaceAlias>', 'deepLocate'],
    input: { aiHover: 'field', deepLocate: true } as MidsceneYamlFlowItem,
    actionSpace: actions,
    expected: {
      node: 'action',
      input: {
        name: 'Hover',
        params: {
          locate: {
            prompt: 'field',
            deepLocate: true,
            cacheable: true,
            xpath: undefined,
          },
        },
      },
      meta: resultMeta(),
    },
  },
  {
    id: 'deferred-action-alias-preserves-options-until-runtime',
    legacyFields: ['<ActionSpace.interfaceAlias>', 'deepLocate'],
    input: { aiHover: 'field', deepLocate: true } as MidsceneYamlFlowItem,
    expected: {
      node: 'legacyAction',
      input: {
        flow: { aiHover: 'field', deepLocate: true },
      },
      meta: resultMeta(),
    },
  },
  ...(
    [
      ['launch', 'Launch', { uri: 'example.app' }],
      ['terminate', 'Terminate', { uri: 'example.app' }],
      ['runHdcShell', 'RunHdcShell', { command: 'example.app' }],
    ] as const
  ).map(([field, name, params]) => ({
    id: `${field}-string-shortcut`,
    legacyFields: [field],
    input: { [field]: 'example.app' } as MidsceneYamlFlowItem,
    actionSpace: actions,
    expected: {
      node: 'action',
      input: { name, params },
      meta: resultMeta(),
    },
  })),
  {
    id: 'adb-shell-timeout-helper',
    legacyFields: ['runAdbShell', 'timeout', 'name'],
    input: {
      runAdbShell: 'echo ready',
      timeout: 50,
      name: 'shell',
    } as MidsceneYamlFlowItem,
    expected: {
      node: 'runAdbShell',
      input: { command: 'echo ready', timeout: 50 },
      meta: resultMeta('shell'),
    },
  },
  {
    id: 'numeric-string-sleep',
    legacyFields: ['sleep'],
    input: { sleep: '25' } as unknown as MidsceneYamlFlowItem,
    expected: {
      node: 'sleep',
      input: { ms: 25 },
      meta: { continueOnError: false },
    },
  },
  {
    id: 'finalize-marker',
    legacyFields: ['Finalize'],
    input: { Finalize: true } as unknown as MidsceneYamlFlowItem,
    expected: {
      node: 'Finalize',
      input: {},
      meta: { continueOnError: false },
    },
  },
];

interface FrozenAgentCall {
  method: string;
  args: readonly unknown[];
}

// Expectations transcribed from the pre-refactor player, independently of the
// compiler and Node schemas. Do not derive these from NormalizedStep.input or
// compare only the two new hosts: both hosts can share the same regression.
const frozenAgentCalls: Readonly<Record<string, FrozenAgentCall | null>> = {
  ...Object.fromEntries(
    ['ai', 'aiAction', 'aiAct'].map((alias) => [
      `${alias}-alias-and-instruction-precedence`,
      {
        method: 'aiAct',
        args: [
          'preferred',
          {
            aiActionProgressTips: ['accepted but historically not executed'],
            cacheable: false,
          },
        ],
      },
    ]),
  ),
  ...Object.fromEntries(
    ['aiQuery', 'aiNumber', 'aiString', 'aiBoolean', 'aiAsk', 'aiLocate'].map(
      (method) => [
        `${method}-result-and-options`,
        {
          method,
          args: [
            'value',
            {
              context: '',
              domIncluded: 'visible-only',
              screenshotIncluded: false,
            },
          ],
        },
      ],
    ),
  ),
  'tap-multimodal-options': {
    method: 'aiTap',
    args: [
      'button',
      {
        images: [{ name: 'reference', url: 'data:image/png;base64,fixture' }],
        convertHttpImage2Base64: false,
        deepLocate: true,
        xpath: '//button',
        fileChooserAccept: ['./fixture.txt'],
        uiContext: { fixture: true },
      },
    ],
  },
  'tap-structured-prompt': {
    method: 'aiTap',
    args: [
      {
        prompt: 'button',
        images: [{ name: 'reference', url: 'data:image/png;base64,fixture' }],
        convertHttpImage2Base64: false,
      },
      {},
    ],
  },
  'tap-nested-locate-and-deep-think-alias': {
    method: 'aiTap',
    args: ['nested button', { deepThink: true }],
  },
  'input-current-shape-and-falsy-value': {
    method: 'callActionInActionSpace',
    args: [
      'Input',
      {
        mode: 'replace',
        value: '0',
        locate: {
          prompt: 'field',
          deepLocate: false,
          cacheable: true,
          xpath: undefined,
        },
      },
    ],
  },
  'input-legacy-locate-shape': {
    method: 'callActionInActionSpace',
    args: [
      'Input',
      {
        locate: {
          prompt: 'field',
          deepLocate: false,
          cacheable: true,
          xpath: undefined,
        },
        mode: 'append',
        value: 'text',
      },
    ],
  },
  'keyboard-global-shape': {
    method: 'callActionInActionSpace',
    args: ['KeyboardPress', { keyName: 'Enter' }],
  },
  'keyboard-located-shape': {
    method: 'callActionInActionSpace',
    args: [
      'KeyboardPress',
      {
        keyName: 'Enter',
        locate: {
          prompt: 'field',
          deepLocate: false,
          cacheable: true,
          xpath: undefined,
        },
      },
    ],
  },
  'scroll-prompt-and-options': {
    method: 'aiScroll',
    args: [
      'list',
      { direction: 'down', distance: 0, scrollType: 'untilBottom' },
    ],
  },
  'wait-timeout-and-observation-options': {
    method: 'aiWaitFor',
    args: [
      'ready',
      {
        timeout: 25,
        timeoutMs: 25,
        domIncluded: 'visible-only',
        screenshotIncluded: false,
      },
    ],
  },
  'assert-message-and-raw-result': {
    method: 'aiAssert',
    args: ['cart is ready', 'cart assertion failed', { keepRawResponse: true }],
  },
  'javascript-named-result': {
    method: 'evaluateJavaScript',
    args: ['value()'],
  },
  'gherkin-disables-plan-cache': {
    method: 'runGherkinScenario',
    args: ['Given a page', { cacheable: false }],
  },
  'recordToReport-report-record': {
    method: 'recordToReport',
    args: ['evidence', { content: '' }],
  },
  'logScreenshot-report-record': {
    method: 'recordToReport',
    args: ['evidence', { content: '' }],
  },
  'custom-string-action-alias': {
    method: 'callActionInActionSpace',
    args: ['Echo', 'hello'],
  },
  'custom-locate-action-alias': {
    method: 'callActionInActionSpace',
    args: [
      'Hover',
      {
        locate: {
          prompt: 'field',
          deepLocate: true,
          cacheable: true,
          xpath: undefined,
        },
      },
    ],
  },
  'deferred-action-alias-preserves-options-until-runtime': {
    method: 'callActionInActionSpace',
    args: [
      'Hover',
      {
        locate: {
          prompt: 'field',
          deepLocate: true,
          cacheable: true,
          xpath: undefined,
        },
      },
    ],
  },
  'launch-string-shortcut': {
    method: 'callActionInActionSpace',
    args: ['Launch', { uri: 'example.app' }],
  },
  'terminate-string-shortcut': {
    method: 'callActionInActionSpace',
    args: ['Terminate', { uri: 'example.app' }],
  },
  'runHdcShell-string-shortcut': {
    method: 'callActionInActionSpace',
    args: ['RunHdcShell', { command: 'example.app' }],
  },
  'adb-shell-timeout-helper': {
    method: 'runAdbShell',
    args: ['echo ready', { timeout: 50 }],
  },
  'numeric-string-sleep': { method: 'sleep', args: [25] },
  'finalize-marker': null,
};

const agentResults: Readonly<Record<string, unknown>> = {
  aiAssert: { pass: true, thought: 'ok', message: 'passed' },
  aiBoolean: true,
  aiNumber: 7,
  aiString: 'value',
  aiAsk: 'answer',
  aiQuery: { title: 'fixture' },
  aiLocate: { center: [10, 20] },
  evaluateJavaScript: 'javascript value',
  callActionInActionSpace: 'action value',
  runAdbShell: 'shell output',
};

const frozenLegacySyntax = [
  'Finalize',
  '<ActionSpace.interfaceAlias>',
  'ai',
  'aiAct',
  'aiAction',
  'aiActionProgressTips',
  'aiAsk',
  'aiAssert',
  'aiBoolean',
  'aiInput',
  'aiKeyboardPress',
  'aiLocate',
  'aiNumber',
  'aiQuery',
  'aiScroll',
  'aiString',
  'aiTap',
  'aiWaitFor',
  'content',
  'convertHttpImage2Base64',
  'deepLocate',
  'deepThink',
  'direction',
  'distance',
  'domIncluded',
  'errorMessage',
  'fileChooserAccept',
  'images',
  'instruction',
  'javascript',
  'keyName',
  'launch',
  'locate',
  'logScreenshot',
  'mode',
  'name',
  'recordToReport',
  'runAdbShell',
  'runGherkinScenario',
  'runHdcShell',
  'screenshotIncluded',
  'scrollType',
  'sleep',
  'terminate',
  'timeout',
  'uiContext',
  'value',
  'xpath',
] as const;

describe('executable legacy YAML flow contract', () => {
  test('freezes an independent Agent call expectation for every contract', () => {
    expect(Object.keys(frozenAgentCalls).sort()).toEqual(
      contracts.map(({ id }) => id).sort(),
    );
  });

  test('assigns every frozen built-in field to an executable example', () => {
    const covered = new Set(contracts.flatMap((item) => item.legacyFields));
    expect(frozenLegacySyntax.filter((field) => !covered.has(field))).toEqual(
      [],
    );
  });

  test.each(contracts)('$id', async ({ id, input, actionSpace, expected }) => {
    const step = compileLegacyFlowItem(input, actionSpace);
    expect(step).toMatchObject(expected);
    const definition = legacyAgentTestRunnerNodeDefinitions.find(
      (node) => node.name === step.node,
    )!;
    expect(definition).toBeDefined();
    const parsed = await definition.inputSchema.parseAsync(step.input);
    const signal = new AbortController().signal;
    const agent = {
      ...Object.fromEntries(
        [
          ...new Set(
            Object.values(frozenAgentCalls).flatMap((call) =>
              call ? [call.method] : [],
            ),
          ),
        ].map((method) => [
          method,
          rs.fn().mockResolvedValue(agentResults[method]),
        ]),
      ),
      getActionSpace: rs.fn().mockResolvedValue(actions),
    };
    const output = await definition.execute(agent, parsed, { signal });
    const call = frozenAgentCalls[id];
    if (!call) {
      for (const method of Object.values(agent))
        expect(method).not.toHaveBeenCalled();
      return;
    }
    const method = agent[call.method as keyof typeof agent];
    expect(method).toHaveBeenCalledTimes(1);
    const runtimeArgs = method.mock.calls[0];
    const args = runtimeArgs.slice(0, call.args.length).map((arg: unknown) => {
      if (
        arg &&
        typeof arg === 'object' &&
        'abortSignal' in arg &&
        arg.abortSignal === signal
      ) {
        const { abortSignal: _signal, ...options } = arg;
        return options;
      }
      return arg;
    });
    expect(args).toEqual(call.args);
    // Shared sleep adds an internal cancellation argument absent in old calls.
    for (const extra of runtimeArgs.slice(call.args.length)) {
      expect(extra).toEqual({ abortSignal: signal });
    }
    if (step.meta.captureResult) {
      expect(output).toBeDefined();
      expect(getLegacyYamlResultData(step.node, output!)).toEqual(
        agentResults[call.method],
      );
    }
  });
});
