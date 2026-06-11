import { beforeEach, describe, expect, it, vi } from 'vitest';
import { executeFlow } from '../../src/flows';
import { clearUserSteps, defineStep } from '../../src/no-ai';
import { runStep } from '../../src/router';
import type {
  FlowDef,
  FlowMatch,
  FlowRegistryLike,
  GeneralAgent,
  GeneralAgentRequest,
  GeneralAgentResult,
  ResolvedBddConfig,
  RouterContext,
  Skill,
  UiAgent,
} from '../../src/types';

// Real './no-ai' and './skills' are used; only the flow EXECUTOR is mocked
// (ctx.flows.matchStep is a hand-built fake on the context anyway).
vi.mock('../../src/flows', () => ({
  executeFlow: vi.fn(async () => {}),
}));

const mockedExecuteFlow = vi.mocked(executeFlow);

function makeFlowMatch(overrides: Partial<FlowMatch> = {}): FlowMatch {
  return { flow: { name: 'fake flow' } as FlowDef, args: {}, ...overrides };
}

function makeFlows(
  matchResult?: FlowMatch,
): FlowRegistryLike & { seenTexts: string[] } {
  const seenTexts: string[] = [];
  return {
    seenTexts,
    matchStep(text: string) {
      seenTexts.push(text);
      return matchResult;
    },
    getByName: () => undefined,
    list: () => [],
  };
}

function makeUi(overrides: Partial<UiAgent> = {}) {
  return {
    aiAct: vi.fn(async () => undefined),
    aiAssert: vi.fn(async () => undefined),
    ...overrides,
  };
}

function makeGeneralAgent(result: GeneralAgentResult = { text: 'done' }) {
  const run = vi.fn(async (_request: GeneralAgentRequest) => result);
  const agent: GeneralAgent = { run };
  return { agent, run };
}

function makeSkill(name: string): Skill {
  return { name, content: `${name} content`, file: `skills/${name}.md` };
}

function makeCtx(overrides: Partial<RouterContext> = {}): RouterContext {
  return {
    stepText: 'do something',
    stepType: 'action',
    annotations: { agent: false, noAi: false, soft: false, skills: [] },
    flowDepth: 0,
    flows: makeFlows(),
    skills: new Map(),
    config: {} as ResolvedBddConfig,
    getUiAgent: async () => {
      throw new Error('getUiAgent must not be called in this test');
    },
    getGeneralAgent: async () => {
      throw new Error('getGeneralAgent must not be called in this test');
    },
    peekUiAgent: () => undefined,
    ...overrides,
  };
}

beforeEach(() => {
  clearUserSteps();
  mockedExecuteFlow.mockClear();
  mockedExecuteFlow.mockResolvedValue(undefined);
});

describe('precedence', () => {
  it('noAi beats the agent annotation', async () => {
    const fn = vi.fn();
    defineStep('I do the thing', fn);
    const { run } = makeGeneralAgent();
    const ctx = makeCtx({
      stepText: 'I do the thing',
      annotations: { agent: true, noAi: true, soft: false, skills: [] },
      getGeneralAgent: async () => ({ run }),
    });
    await runStep(ctx);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(run).not.toHaveBeenCalled();
  });

  it('agent beats a flow match (flow matching is never attempted)', async () => {
    const flows = makeFlows(makeFlowMatch());
    const { agent, run } = makeGeneralAgent({ text: 'acted' });
    const ctx = makeCtx({
      stepText: 'I do the thing',
      annotations: { agent: true, noAi: false, soft: false, skills: [] },
      flows,
      getGeneralAgent: async () => agent,
    });
    await runStep(ctx);
    expect(run).toHaveBeenCalledTimes(1);
    expect(flows.seenTexts).toEqual([]);
    expect(mockedExecuteFlow).not.toHaveBeenCalled();
  });

  it('flow beats the default UI route', async () => {
    const match = makeFlowMatch();
    const ctx = makeCtx({
      stepText: 'I am logged in as "admin"',
      flows: makeFlows(match),
      getUiAgent: async () => {
        throw new Error('UI agent must not be created for a flow call');
      },
    });
    await runStep(ctx);
    expect(mockedExecuteFlow).toHaveBeenCalledTimes(1);
    expect(mockedExecuteFlow.mock.calls[0][0]).toBe(match);
  });
});

describe('@no-ai route', () => {
  it('invokes the registered callback with `this` === ctx and string args', async () => {
    let seenThis: unknown;
    let seenArgs: unknown[] = [];
    defineStep('I tap {string} {int} times', function (...args) {
      seenThis = this;
      seenArgs = args;
    });
    const ctx = makeCtx({
      stepText: 'I tap "go" 3 times',
      annotations: { agent: false, noAi: true, soft: false, skills: [] },
    });
    await runStep(ctx);
    expect(seenThis).toBe(ctx);
    expect(seenArgs).toEqual(['go', '3']);
  });

  it('throws an actionable error when no step definition matches', async () => {
    const ctx = makeCtx({
      stepText: 'I press the magic button',
      annotations: { agent: false, noAi: true, soft: false, skills: [] },
    });
    await expect(runStep(ctx)).rejects.toThrow(
      /Implement it[\s\S]*I press the magic button|I press the magic button[\s\S]*Implement it/,
    );
  });

  it('propagates a rejection from the user callback', async () => {
    defineStep('I explode', async () => {
      throw new Error('boom');
    });
    const ctx = makeCtx({
      stepText: 'I explode',
      annotations: { agent: false, noAi: true, soft: false, skills: [] },
    });
    await expect(runStep(ctx)).rejects.toThrow('boom');
  });
});

describe('agent route', () => {
  function agentCtx(
    result: GeneralAgentResult,
    overrides: Partial<RouterContext> = {},
  ) {
    const { agent, run } = makeGeneralAgent(result);
    const ctx = makeCtx({
      stepText: 'the cart shows the right total',
      stepType: 'outcome',
      annotations: { agent: true, noAi: false, soft: false, skills: [] },
      getGeneralAgent: async () => agent,
      ...overrides,
    });
    return { ctx, run };
  }

  it('assert kind: missing verdict is fail-closed', async () => {
    const { ctx } = agentCtx({ text: 'maybe?' });
    await expect(runStep(ctx)).rejects.toThrow(
      '[midscene-bdd] General agent reported no verdict for: "the cart shows the right total" — treated as failure (fail-closed).',
    );
  });

  it('assert kind: pass:false throws with the reason', async () => {
    const { ctx } = agentCtx({
      text: 'checked',
      verdict: { pass: false, reason: 'total is $0' },
    });
    await expect(runStep(ctx)).rejects.toThrow(
      '[midscene-bdd] Agent assertion failed: "the cart shows the right total"\nReason: total is $0',
    );
  });

  it('assert kind: pass:false + @soft logs and attaches but does not throw', async () => {
    const log = vi.fn();
    const attach = vi.fn();
    const { ctx } = agentCtx(
      { text: 'checked', verdict: { pass: false, reason: 'total is $0' } },
      {
        annotations: { agent: true, noAi: false, soft: true, skills: [] },
        log,
        attach,
      },
    );
    await expect(runStep(ctx)).resolves.toBeUndefined();
    const expected =
      '[midscene-bdd] soft check failed: "the cart shows the right total" — total is $0';
    expect(log).toHaveBeenCalledWith(expected);
    expect(attach).toHaveBeenCalledWith(expected, 'text/plain');
  });

  it('assert kind: pass:true logs a PASS line with the reason', async () => {
    const log = vi.fn();
    const { ctx } = agentCtx(
      { text: 'checked', verdict: { pass: true, reason: 'all good' } },
      { log },
    );
    await runStep(ctx);
    expect(log).toHaveBeenCalledTimes(1);
    expect(log.mock.calls[0][0]).toContain('PASS');
    expect(log.mock.calls[0][0]).toContain('all good');
  });

  it('act kind: ignores the verdict and logs result text (truncated)', async () => {
    const log = vi.fn();
    const longText = 'x'.repeat(600);
    const { ctx, run } = agentCtx(
      { text: longText, verdict: { pass: false, reason: 'irrelevant' } },
      { stepType: 'action', log },
    );
    await expect(runStep(ctx)).resolves.toBeUndefined();
    expect(run.mock.calls[0][0].kind).toBe('act');
    expect(log).toHaveBeenCalledTimes(1);
    const logged = log.mock.calls[0][0] as string;
    expect(logged.length).toBeLessThanOrEqual(501);
    expect(logged.startsWith('xxx')).toBe(true);
  });

  it('resolves $skill tokens into the request', async () => {
    const checkLogs = makeSkill('check-logs');
    const { ctx, run } = agentCtx(
      { text: 'ok', verdict: { pass: true, reason: 'ok' } },
      {
        annotations: {
          agent: false,
          noAi: false,
          soft: false,
          skills: ['check-logs'],
        },
        skills: new Map([['check-logs', checkLogs]]),
      },
    );
    await runStep(ctx);
    expect(run.mock.calls[0][0].skills).toEqual([checkLogs]);
  });

  it('propagates the selectSkills error for unknown skill tokens', async () => {
    const { ctx, run } = agentCtx(
      { text: 'ok' },
      {
        annotations: {
          agent: false,
          noAi: false,
          soft: false,
          skills: ['nope'],
        },
      },
    );
    await expect(runStep(ctx)).rejects.toThrow(/Unknown skill \$nope/);
    expect(run).not.toHaveBeenCalled();
  });

  it('includes a screenshot only when peekUiAgent exposes interface.screenshotBase64', async () => {
    const withShot = agentCtx(
      { text: 'ok', verdict: { pass: true, reason: 'ok' } },
      {
        peekUiAgent: () =>
          makeUi({
            interface: { screenshotBase64: async () => 'base64-shot' },
          }),
      },
    );
    await runStep(withShot.ctx);
    expect(withShot.run.mock.calls[0][0].screenshotBase64).toBe('base64-shot');

    const noAgent = agentCtx({
      text: 'ok',
      verdict: { pass: true, reason: 'ok' },
    });
    await runStep(noAgent.ctx);
    expect(noAgent.run.mock.calls[0][0].screenshotBase64).toBeUndefined();

    const noInterface = agentCtx(
      { text: 'ok', verdict: { pass: true, reason: 'ok' } },
      { peekUiAgent: () => makeUi() },
    );
    await runStep(noInterface.ctx);
    expect(noInterface.run.mock.calls[0][0].screenshotBase64).toBeUndefined();
  });

  it('propagates a screenshot failure', async () => {
    const { ctx } = agentCtx(
      { text: 'ok', verdict: { pass: true, reason: 'ok' } },
      {
        peekUiAgent: () =>
          makeUi({
            interface: {
              screenshotBase64: async () => {
                throw new Error('screenshot failed');
              },
            },
          }),
      },
    );
    await expect(runStep(ctx)).rejects.toThrow('screenshot failed');
  });

  it('appends the data table to the prompt', async () => {
    const { ctx, run } = agentCtx(
      { text: 'ok', verdict: { pass: true, reason: 'ok' } },
      { dataTable: '| a | b |\n| 1 | 2 |' },
    );
    await runStep(ctx);
    expect(run.mock.calls[0][0].prompt).toBe(
      'the cart shows the right total\n\nTable:\n| a | b |\n| 1 | 2 |',
    );
  });

  it('routes via skills tokens alone (no @agent annotation needed)', async () => {
    const skill = makeSkill('s');
    const { ctx, run } = agentCtx(
      { text: 'ok' },
      {
        stepType: 'action',
        annotations: { agent: false, noAi: false, soft: false, skills: ['s'] },
        skills: new Map([['s', skill]]),
      },
    );
    await runStep(ctx);
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('flow route', () => {
  it('calls executeFlow with the match, ctx, and the same runStep reference', async () => {
    const match = makeFlowMatch({ args: { role: 'admin' } });
    const flows = makeFlows(match);
    const ctx = makeCtx({
      stepText: 'I am logged in as "admin"',
      flows,
    });
    await runStep(ctx);
    expect(flows.seenTexts).toEqual(['I am logged in as "admin"']);
    expect(mockedExecuteFlow).toHaveBeenCalledTimes(1);
    const [seenMatch, seenCtx, seenRunStep] = mockedExecuteFlow.mock.calls[0];
    expect(seenMatch).toBe(match);
    expect(seenCtx).toBe(ctx);
    expect(seenRunStep).toBe(runStep);
  });

  it('propagates an ambiguity error thrown by matchStep', async () => {
    const ctx = makeCtx({
      flows: {
        matchStep: () => {
          throw new Error('[midscene-bdd] Ambiguous flow call');
        },
        getByName: () => undefined,
        list: () => [],
      },
    });
    await expect(runStep(ctx)).rejects.toThrow('Ambiguous flow call');
  });
});

describe('default Midscene route', () => {
  it('routes remember-style prose to the UI agent like any other step', async () => {
    // The old custom capture statement is gone: nothing special-cases this
    // shape anymore, so it falls through to the default route as prose.
    const ui = makeUi();
    const ctx = makeCtx({
      stepText: 'I remember the cart total as "total"',
      stepType: 'action',
      getUiAgent: async () => ui,
    });
    await runStep(ctx);
    expect(ui.aiAct).toHaveBeenCalledWith(
      'I remember the cart total as "total"',
    );
  });

  it('outcome → aiAssert with the prompt', async () => {
    const ui = makeUi();
    const ctx = makeCtx({
      stepText: 'the page shows a greeting',
      stepType: 'outcome',
      getUiAgent: async () => ui,
    });
    await runStep(ctx);
    expect(ui.aiAssert).toHaveBeenCalledWith('the page shows a greeting');
    expect(ui.aiAct).not.toHaveBeenCalled();
  });

  it('outcome → a throwing aiAssert propagates (fail-closed)', async () => {
    const ui = makeUi({
      aiAssert: vi.fn(async () => {
        throw new Error('assertion failed: no greeting');
      }),
    });
    const ctx = makeCtx({
      stepText: 'the page shows a greeting',
      stepType: 'outcome',
      getUiAgent: async () => ui,
    });
    await expect(runStep(ctx)).rejects.toThrow('assertion failed: no greeting');
  });

  it('outcome + @soft → keepRawResponse passed; pass:false warns but does not throw', async () => {
    const log = vi.fn();
    const ui = makeUi({
      aiAssert: vi.fn(async () => ({ pass: false, thought: 'no greeting' })),
    });
    const ctx = makeCtx({
      stepText: 'the page shows a greeting',
      stepType: 'outcome',
      annotations: { agent: false, noAi: false, soft: true, skills: [] },
      getUiAgent: async () => ui,
      log,
    });
    await expect(runStep(ctx)).resolves.toBeUndefined();
    expect(ui.aiAssert).toHaveBeenCalledWith(
      'the page shows a greeting',
      undefined,
      { keepRawResponse: true },
    );
    expect(log).toHaveBeenCalledWith(
      '[midscene-bdd] soft check failed: "the page shows a greeting" — no greeting',
    );
  });

  it('outcome + @soft → pass:true does not warn', async () => {
    const log = vi.fn();
    const ui = makeUi({
      aiAssert: vi.fn(async () => ({ pass: true, thought: 'looks right' })),
    });
    const ctx = makeCtx({
      stepText: 'the page shows a greeting',
      stepType: 'outcome',
      annotations: { agent: false, noAi: false, soft: true, skills: [] },
      getUiAgent: async () => ui,
      log,
    });
    await runStep(ctx);
    expect(log).not.toHaveBeenCalled();
  });

  it('action and context → aiAct', async () => {
    for (const stepType of ['action', 'context', 'unknown'] as const) {
      const ui = makeUi();
      const ctx = makeCtx({
        stepText: 'I click the button',
        stepType,
        getUiAgent: async () => ui,
      });
      await runStep(ctx);
      expect(ui.aiAct).toHaveBeenCalledWith('I click the button');
      expect(ui.aiAssert).not.toHaveBeenCalled();
    }
  });

  it('appends the doc string to the prompt', async () => {
    const ui = makeUi();
    const ctx = makeCtx({
      stepText: 'I fill the form',
      stepType: 'action',
      docString: 'line one\nline two',
      getUiAgent: async () => ui,
    });
    await runStep(ctx);
    expect(ui.aiAct).toHaveBeenCalledWith(
      'I fill the form\n\n"""\nline one\nline two\n"""',
    );
  });

  it('passes <...> content through to the model verbatim', async () => {
    // Scenario Outline placeholders are substituted by Gherkin at compile
    // time and flow params by the flow executor; the router itself never
    // rewrites step text.
    const ui = makeUi();
    const ctx = makeCtx({
      stepText: 'press <Enter> in the search box',
      getUiAgent: async () => ui,
    });
    await runStep(ctx);
    expect(ui.aiAct).toHaveBeenCalledWith('press <Enter> in the search box');
  });
});
