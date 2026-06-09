import { describe, expect, it } from 'vitest';
import { createFlowRegistry, runScenario } from '../../src/flow-ir';
import type { FlowDefIR, ScenarioIR } from '../../src/flow-ir';
import {
  Soft,
  Then,
  When,
  callFlow,
  defineFlow,
  remember,
  scenario,
} from '../../src/frontends/js';
import { FakeGeneralAgent, FakeUiAgent } from './helpers/fake-agents';

const loginFlow: FlowDefIR = defineFlow({
  name: 'Login',
  params: ['role'],
  returns: ['greeting'],
  steps: [
    When('open the login page'),
    When('sign in as the "{role}" user'),
    remember('the greeting shown in the header', 'greeting'),
  ],
});

function run(
  s: ScenarioIR,
  opts: {
    flows?: FlowDefIR[];
    ui?: FakeUiAgent;
    general?: FakeGeneralAgent;
  } = {},
) {
  const ui = opts.ui ?? new FakeUiAgent();
  const general = opts.general ?? new FakeGeneralAgent();
  return runScenario({
    scenario: s,
    registry: createFlowRegistry(opts.flows ?? []),
    uiAgent: ui,
    generalAgent: general,
  }).then((result) => ({ result, ui, general }));
}

describe('runScenario: variable capture and substitution', () => {
  it('captures via the UI agent and substitutes before the model sees the prompt', async () => {
    const ui = new FakeUiAgent(['A-123']);
    const general = new FakeGeneralAgent();
    const { result } = await run(
      scenario('order confirmation', [
        When('place the order'),
        remember('the order id shown in the banner', 'orderId'),
        Then('the confirmation page shows order {orderId}'),
      ]),
      { ui, general },
    );

    expect(result.status).toBe('passed');
    expect(ui.stringCalls).toEqual(['the order id shown in the banner']);
    // The verify prompt reached the general agent already-resolved.
    expect(general.calls).toHaveLength(1);
    expect(general.calls[0].instruction).toBe(
      'the confirmation page shows order A-123',
    );
    // Machine-owned channel: the variable table holds the captured value.
    expect(result.variables.orderId).toBe('A-123');
  });

  it('seeds the scope from scenario vars and substitutes into ui prompts', async () => {
    const { result, ui } = await run(
      scenario('seeded', [When('search for {term}')], {
        vars: { term: 'backpack' },
      }),
    );
    expect(result.status).toBe('passed');
    expect(ui.actCalls).toEqual(['search for backpack']);
  });

  it('fails the capture step when the extraction returns an empty value', async () => {
    const ui = new FakeUiAgent(['   ']);
    const { result, general } = await run(
      scenario('blank capture', [
        remember('the order id shown in the banner', 'orderId'),
        Then('the confirmation page shows order {orderId}'),
      ]),
      { ui },
    );
    expect(result.status).toBe('failed');
    expect(result.steps[0].error).toMatch(
      /capture \{orderId\}.*returned an empty value/,
    );
    expect(result.variables).not.toHaveProperty('orderId');
    expect(general.calls).toEqual([]);
  });

  it('fails the step (and case) on an unknown variable, before any model call', async () => {
    const { result, ui, general } = await run(
      scenario('typo', [Then('the total is {totl}')]),
    );
    expect(result.status).toBe('failed');
    expect(result.steps[0].error).toMatch(/unknown variable \{totl\}/);
    expect(ui.actCalls).toEqual([]);
    expect(general.calls).toEqual([]);
  });
});

describe('runScenario: named flows', () => {
  it('runs a flow with a fresh scope and flows declared returns back', async () => {
    const ui = new FakeUiAgent(['Hello, Admin!']);
    const general = new FakeGeneralAgent();
    const { result } = await run(
      scenario('checkout', [
        callFlow('Login', { role: 'admin' }),
        Then('the header shows {greeting}'),
      ]),
      { flows: [loginFlow], ui, general },
    );

    expect(result.status).toBe('passed');
    // Args were substituted into the callee's prompts.
    expect(ui.actCalls).toContain('sign in as the "admin" user');
    // Declared return came back into the caller scope.
    expect(result.variables.greeting).toBe('Hello, Admin!');
    expect(general.calls[0].instruction).toBe('the header shows Hello, Admin!');
    // The call itself is visible in the step record.
    expect(result.steps[0]).toMatchObject({
      node: 'flow',
      input: 'Login(role="admin")',
    });
  });

  it('resolves arg templates against the caller scope', async () => {
    const ui = new FakeUiAgent(['Hi']);
    const { result } = await run(
      scenario('computed arg', [callFlow('Login', { role: '{whoami}' })], {
        vars: { whoami: 'guest' },
      }),
      { flows: [loginFlow], ui },
    );
    expect(result.status).toBe('passed');
    expect(ui.actCalls).toContain('sign in as the "guest" user');
  });

  it('does not leak caller variables into the flow scope', async () => {
    const leaky: FlowDefIR = {
      name: 'Leaky',
      params: [],
      returns: [],
      steps: [
        {
          kind: 'prompt',
          node: 'ui',
          template: 'use {secret}',
        },
      ],
    };
    const { result } = await run(
      scenario('caller', [callFlow('Leaky')], { vars: { secret: 'hunter2' } }),
      { flows: [leaky] },
    );
    expect(result.status).toBe('failed');
    expect(result.steps.at(-1)?.error).toMatch(/unknown variable \{secret\}/);
  });

  it('discards callee variables that are not declared returns', async () => {
    const flow = defineFlow({
      name: 'Capture2',
      params: [],
      returns: ['kept'],
      steps: [
        remember('the kept value', 'kept'),
        remember('the discarded value', 'dropped'),
      ],
    });
    const ui = new FakeUiAgent(['K', 'D']);
    const { result } = await run(scenario('scoping', [callFlow('Capture2')]), {
      flows: [flow],
      ui,
    });
    expect(result.status).toBe('passed');
    expect(result.variables.kept).toBe('K');
    expect(result.variables).not.toHaveProperty('dropped');
  });

  it('fails when a declared return was never captured', async () => {
    const flow: FlowDefIR = {
      name: 'NoCapture',
      params: [],
      returns: ['token'],
      steps: [{ kind: 'prompt', node: 'ui', template: 'do nothing' }],
    };
    const { result } = await run(
      scenario('missing return', [callFlow('NoCapture')]),
      {
        flows: [flow],
      },
    );
    expect(result.status).toBe('failed');
    expect(result.steps.at(-1)?.error).toMatch(/return "token"/);
  });

  it('fails on missing or undeclared arguments', async () => {
    const { result: missing } = await run(
      scenario('missing arg', [callFlow('Login')]),
      { flows: [loginFlow] },
    );
    expect(missing.status).toBe('failed');
    expect(missing.steps[0].error).toMatch(/missing argument "role"/);

    const { result: unknown } = await run(
      scenario('unknown arg', [callFlow('Login', { role: 'a', nope: 'b' })]),
      { flows: [loginFlow] },
    );
    expect(unknown.status).toBe('failed');
    expect(unknown.steps[0].error).toMatch(/unknown argument "nope"/);
  });

  it('fails on unregistered flows', async () => {
    const { result } = await run(scenario('nope', [callFlow('Ghost')]));
    expect(result.status).toBe('failed');
    expect(result.steps[0].error).toMatch(/Unknown flow "Ghost"/);
  });
});

describe('runScenario: flow memoization (once-per-run)', () => {
  const memoLogin = defineFlow({
    name: 'Login',
    params: ['role'],
    returns: ['greeting'],
    memo: 'once-per-run',
    steps: [
      When('open the login page'),
      When('sign in as the "{role}" user'),
      remember('the greeting shown in the header', 'greeting'),
    ],
  });

  it('replays returns on a hit without re-running the flow steps', async () => {
    // Only ONE scripted aiString result: a re-run of the capture would throw.
    const ui = new FakeUiAgent(['Hello, Admin!']);
    const events: string[] = [];
    const result = await runScenario({
      scenario: scenario('memo hit', [
        callFlow('Login', { role: 'admin' }),
        callFlow('Login', { role: 'admin' }),
        Then('the header shows {greeting}'),
      ]),
      registry: createFlowRegistry([memoLogin]),
      uiAgent: ui,
      generalAgent: new FakeGeneralAgent(),
      onEvent: (e) => events.push(`${e.type}@${'depth' in e ? e.depth : '?'}`),
    });

    expect(result.status).toBe('passed');
    // The flow body executed exactly once.
    expect(ui.actCalls).toEqual([
      'open the login page',
      'sign in as the "admin" user',
    ]);
    expect(ui.stringCalls).toEqual(['the greeting shown in the header']);
    // The replay still delivered the declared return into the caller scope.
    expect(result.variables.greeting).toBe('Hello, Admin!');
    // The hit stays narratable: an info step records the replay...
    const memoSteps = result.steps.filter((s) =>
      s.output?.text.includes('Memo hit'),
    );
    expect(memoSteps).toHaveLength(1);
    expect(memoSteps[0]).toMatchObject({
      node: 'flow',
      status: 'info',
      input: 'Login(role="admin")',
    });
    // ...and flowEnter/flowExit still fire for the replayed call.
    expect(
      events.filter((e) => e === 'flowEnter@1' || e === 'flowExit@1'),
    ).toEqual(['flowEnter@1', 'flowExit@1', 'flowEnter@1', 'flowExit@1']);
  });

  it('misses when the resolved args differ', async () => {
    const ui = new FakeUiAgent(['Hello, Admin!', 'Hello, Guest!']);
    const { result } = await run(
      scenario('memo miss', [
        callFlow('Login', { role: 'admin' }),
        callFlow('Login', { role: 'guest' }),
      ]),
      { flows: [memoLogin], ui },
    );
    expect(result.status).toBe('passed');
    expect(ui.actCalls).toEqual([
      'open the login page',
      'sign in as the "admin" user',
      'open the login page',
      'sign in as the "guest" user',
    ]);
    expect(result.variables.greeting).toBe('Hello, Guest!');
  });

  it('shares hits across scenarios through a caller-provided memoStore', async () => {
    const memoStore = new Map<string, Record<string, string>>();
    const runWith = (ui: FakeUiAgent) =>
      runScenario({
        scenario: scenario('login once', [
          callFlow('Login', { role: 'admin' }),
          Then('the header shows {greeting}'),
        ]),
        registry: createFlowRegistry([memoLogin]),
        uiAgent: ui,
        generalAgent: new FakeGeneralAgent(),
        memoStore,
      });

    const first = new FakeUiAgent(['Hello, Admin!']);
    expect((await runWith(first)).status).toBe('passed');

    // No scripted aiString results: any flow re-execution would fail.
    const second = new FakeUiAgent();
    const replayed = await runWith(second);
    expect(replayed.status).toBe('passed');
    expect(second.actCalls).toEqual([]);
    expect(second.stringCalls).toEqual([]);
    expect(replayed.variables.greeting).toBe('Hello, Admin!');
  });

  it('defaults to a per-call store (no sharing across runScenario calls)', async () => {
    const loginOnce = scenario('login once', [
      callFlow('Login', { role: 'admin' }),
    ]);
    const first = new FakeUiAgent(['Hello, Admin!']);
    await run(loginOnce, { flows: [memoLogin], ui: first });

    const second = new FakeUiAgent(['Hello, Admin!']);
    const { result } = await run(loginOnce, { flows: [memoLogin], ui: second });
    expect(result.status).toBe('passed');
    // Without a shared store the flow executed again.
    expect(second.actCalls).toContain('sign in as the "admin" user');
  });

  it('never memoizes a failed flow run', async () => {
    const guard = defineFlow({
      name: 'Guard',
      params: [],
      returns: [],
      memo: 'once-per-run',
      steps: [When('prepare'), Then('precondition holds')],
    });
    const memoStore = new Map<string, Record<string, string>>();
    const runWith = (ui: FakeUiAgent, general: FakeGeneralAgent) =>
      runScenario({
        scenario: scenario('guarded', [callFlow('Guard')]),
        registry: createFlowRegistry([guard]),
        uiAgent: ui,
        generalAgent: general,
        memoStore,
      });

    const failing = await runWith(
      new FakeUiAgent(),
      new FakeGeneralAgent(() => ({
        text: 'nope',
        verdict: { pass: false, reason: 'not ready' },
      })),
    );
    expect(failing.status).toBe('failed');

    // The failure was not cached: the next run re-executes the flow.
    const retryUi = new FakeUiAgent();
    const retried = await runWith(retryUi, new FakeGeneralAgent());
    expect(retried.status).toBe('passed');
    expect(retryUi.actCalls).toEqual(['prepare']);
  });

  it('flows without memo always execute, even with a shared store', async () => {
    const ui = new FakeUiAgent(['Hello, Admin!', 'Hello, Admin!']);
    const { result } = await run(
      scenario('no memo', [
        callFlow('Login', { role: 'admin' }),
        callFlow('Login', { role: 'admin' }),
      ]),
      { flows: [loginFlow], ui },
    );
    expect(result.status).toBe('passed');
    expect(ui.actCalls).toHaveLength(4);
    expect(ui.stringCalls).toHaveLength(2);
  });
});

describe('runScenario: call-depth cap', () => {
  const leaf: FlowDefIR = {
    name: 'Leaf',
    params: [],
    returns: [],
    steps: [{ kind: 'prompt', node: 'ui', template: 'leaf action' }],
  };
  const mid: FlowDefIR = {
    name: 'Mid',
    params: [],
    returns: [],
    steps: [{ kind: 'callFlow', flowName: 'Leaf', args: {} }],
  };
  const top: FlowDefIR = {
    name: 'Top',
    params: [],
    returns: [],
    steps: [{ kind: 'callFlow', flowName: 'Mid', args: {} }],
  };

  it('allows two levels of nesting (scenario → flow → flow)', async () => {
    const { result, ui } = await run(scenario('ok depth', [callFlow('Mid')]), {
      flows: [leaf, mid],
    });
    expect(result.status).toBe('passed');
    expect(ui.actCalls).toEqual(['leaf action']);
  });

  it('rejects a third level of nesting', async () => {
    const { result } = await run(scenario('too deep', [callFlow('Top')]), {
      flows: [leaf, mid, top],
    });
    expect(result.status).toBe('failed');
    expect(result.steps.at(-1)?.error).toMatch(/depth exceeds the cap of 2/);
  });
});

describe('runScenario: soft vs verify gating', () => {
  const failingGeneral = () =>
    new FakeGeneralAgent(() => ({
      text: 'nope',
      verdict: { pass: false, reason: 'not visible' },
    }));

  it('soft failures warn but the case passes and continues', async () => {
    const general = failingGeneral();
    const { result, ui } = await run(
      scenario('soft path', [
        Soft('a promo banner is visible'),
        When('continue browsing'),
      ]),
      { general },
    );
    expect(result.status).toBe('passed');
    expect(result.steps[0].status).toBe('warning');
    expect(result.warnings[0]).toMatch(/soft check failed.*not visible/);
    expect(ui.actCalls).toEqual(['continue browsing']);
  });

  it('verify failures gate the case and stop execution', async () => {
    const general = failingGeneral();
    const { result, ui } = await run(
      scenario('hard path', [
        Then('the cart shows 1 item'),
        When('never reached'),
      ]),
      { general },
    );
    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(1);
    expect(result.steps[0].verdict).toEqual({
      pass: false,
      reason: 'not visible',
    });
    expect(ui.actCalls).toEqual([]);
  });

  it('a verify failure inside a flow stops the whole scenario', async () => {
    const flow = defineFlow({
      name: 'Guard',
      params: [],
      returns: [],
      steps: [Then('precondition holds')],
    });
    const general = failingGeneral();
    const { result, ui } = await run(
      scenario('gated', [callFlow('Guard'), When('never reached')]),
      { flows: [flow], general },
    );
    expect(result.status).toBe('failed');
    expect(ui.actCalls).toEqual([]);
  });
});

describe('runScenario: observability events', () => {
  it('emits stepStart/varSet/flowEnter/flowExit in execution order', async () => {
    const ui = new FakeUiAgent(['Hello, Admin!']);
    const events: string[] = [];
    await runScenario({
      scenario: scenario(
        'observed',
        [
          callFlow('Login', { role: '{whoami}' }),
          Then('header shows {greeting}'),
        ],
        { vars: { whoami: 'admin' } },
      ),
      registry: createFlowRegistry([loginFlow]),
      uiAgent: ui,
      generalAgent: new FakeGeneralAgent(),
      onEvent: (e) => {
        switch (e.type) {
          case 'stepStart':
            events.push(`start:${e.node}@${e.depth}:${e.input}`);
            break;
          case 'stepEnd':
            events.push(`end:${e.result.node}:${e.result.status}`);
            break;
          case 'varSet':
            events.push(`var:${e.name}=${e.value}:${e.source}`);
            break;
          case 'flowEnter':
            events.push(`enter:${e.flowName}(${e.args.role})@${e.depth}`);
            break;
          case 'flowExit':
            events.push(`exit:${e.flowName}@${e.depth}`);
            break;
        }
      },
    });

    expect(events).toEqual([
      'var:whoami=admin:seed',
      'enter:Login(admin)@1',
      'end:flow:info',
      'start:ui@1:open the login page',
      'end:ui:info',
      'start:ui@1:sign in as the "admin" user',
      'end:ui:info',
      'start:capture@1:the greeting shown in the header',
      'var:greeting=Hello, Admin!:capture',
      'end:capture:info',
      'var:greeting=Hello, Admin!:return',
      'exit:Login@1',
      'start:verify@0:header shows Hello, Admin!',
      'end:verify:passed',
    ]);
  });
});

describe('runScenario: end-to-end with the Gherkin front-end', () => {
  it('runs a compiled .feature scenario against the fake agents', async () => {
    const { compileFeature } = await import('../../src/frontends/gherkin');
    const compiled = compileFeature(
      `Feature: Mini checkout
  @flow @param:role @returns:greeting
  Scenario: Login
    When I sign in as the "{role}" user
    When I remember the greeting shown in the header as "greeting"

  Scenario: Greet
    When I run the "Login" flow with role "admin"
    Then the header shows {greeting}
`,
      'mini.feature',
    );

    const ui = new FakeUiAgent(['Hello, Admin!']);
    const general = new FakeGeneralAgent();
    const { result } = await run(compiled.scenarios[0], {
      flows: compiled.flows,
      ui,
      general,
    });

    expect(result.status).toBe('passed');
    expect(ui.actCalls).toEqual(['I sign in as the "admin" user']);
    expect(general.calls[0].instruction).toBe('the header shows Hello, Admin!');
  });
});
