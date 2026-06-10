import type { GherkinDocument, Pickle, PickleStep } from '@cucumber/messages';
import { describe, expect, it, vi } from 'vitest';
import { FlowRegistry, executeFlow } from '../../src/flows';
import type {
  FlowDef,
  ResolvedBddConfig,
  RouterContext,
} from '../../src/types';
import { matchRemember, substituteVars } from '../../src/vars';

vi.mock('../../src/annotations', () => {
  const stepTypeOf = () => 'action';
  const resolveStepAnnotations = () => ({
    agent: false,
    noAi: false,
    soft: false,
    skills: [],
  });
  const renderDataTable = (step: {
    argument?: {
      dataTable?: { rows: { cells: { value: string }[] }[] };
      docString?: { content?: string };
    };
  }) => {
    const table = step.argument?.dataTable;
    if (!table) return undefined;
    return table.rows
      .map(
        (row: { cells: { value: string }[] }) =>
          `| ${row.cells.map((cell) => cell.value).join(' | ')} |`,
      )
      .join('\n');
  };
  // Mirrors the real buildStepContext shape so executeFlow tests exercise
  // the context wiring without needing real AST/comment linkage.
  const buildStepContext = (input: {
    pickleStep: {
      text: string;
      argument?: {
        dataTable?: { rows: { cells: { value: string }[] }[] };
        docString?: { content?: string };
      };
    };
    vars: Map<string, string>;
    flowDepth: number;
    runtime: { flows: unknown; skills: unknown; config: unknown };
    agents: {
      getUiAgent: unknown;
      getGeneralAgent: unknown;
      peekUiAgent: unknown;
    };
    attach?: unknown;
    log?: unknown;
  }) => ({
    stepText: input.pickleStep.text,
    stepType: stepTypeOf(),
    annotations: resolveStepAnnotations(),
    dataTable: renderDataTable(input.pickleStep),
    docString: input.pickleStep.argument?.docString?.content,
    vars: input.vars,
    flowDepth: input.flowDepth,
    flows: input.runtime.flows,
    skills: input.runtime.skills,
    config: input.runtime.config,
    getUiAgent: input.agents.getUiAgent,
    getGeneralAgent: input.agents.getGeneralAgent,
    peekUiAgent: input.agents.peekUiAgent,
    attach: input.attach,
    log: input.log,
  });
  return {
    stepTypeOf,
    resolveStepAnnotations,
    parseSkillTokens: () => [],
    renderDataTable,
    buildStepContext,
  };
});

function makeFlow(partial: Partial<FlowDef> & { name: string }): FlowDef {
  return {
    params: [],
    returns: [],
    pickle: { steps: [] } as unknown as Pickle,
    document: {} as GherkinDocument,
    uri: 'features/flows.feature',
    ...partial,
  };
}

function makeStep(text: string): PickleStep {
  return { text } as PickleStep;
}

function makeParentCtx(overrides: Partial<RouterContext> = {}): RouterContext {
  return {
    stepText: '',
    stepType: 'action',
    annotations: { agent: false, noAi: false, soft: false, skills: [] },
    vars: new Map(),
    flowDepth: 0,
    flows: new FlowRegistry(),
    skills: new Map(),
    config: {} as ResolvedBddConfig,
    getUiAgent: async () => {
      throw new Error('no ui agent in test');
    },
    getGeneralAgent: async () => {
      throw new Error('no general agent in test');
    },
    peekUiAgent: () => undefined,
    ...overrides,
  };
}

describe('substituteVars', () => {
  it('replaces known variables', () => {
    const vars = new Map([['name', 'world']]);
    expect(substituteVars('hello <name>', vars)).toBe('hello world');
  });

  it('replaces multiple occurrences of the same and different variables', () => {
    const vars = new Map([
      ['a', '1'],
      ['b', '2'],
    ]);
    expect(substituteVars('<a> + <a> = <b>', vars)).toBe('1 + 1 = 2');
  });

  it('throws on an unknown identifier-shaped placeholder, listing known vars', () => {
    const vars = new Map([
      ['a', '1'],
      ['b', '2'],
    ]);
    expect(() => substituteVars('use <c>', vars)).toThrow(
      '[midscene-bdd] unknown variable <c> in step "use <c>". Known variables: a, b',
    );
  });

  it("reports '(none)' when no variables are known", () => {
    expect(() => substituteVars('use <c>', new Map())).toThrow(
      '[midscene-bdd] unknown variable <c> in step "use <c>". Known variables: (none)',
    );
  });

  it('leaves non-identifier <...> content untouched', () => {
    const vars = new Map([['a', '1']]);
    expect(substituteVars('press <left-arrow> then <1abc> <a>', vars)).toBe(
      'press <left-arrow> then <1abc> 1',
    );
    expect(substituteVars('compare 1 < 2 > 0', vars)).toBe('compare 1 < 2 > 0');
  });
});

describe('matchRemember', () => {
  it('matches the remember statement', () => {
    expect(matchRemember('I remember the order id as "orderId"')).toEqual({
      description: 'the order id',
      varName: 'orderId',
    });
  });

  it('is case-insensitive and tolerates a trailing period', () => {
    expect(matchRemember('i remember the total as "total".')).toEqual({
      description: 'the total',
      varName: 'total',
    });
  });

  it('returns undefined for non-identifier variable names', () => {
    expect(matchRemember('I remember the id as "order-id"')).toBeUndefined();
  });

  it('returns undefined for unrelated text', () => {
    expect(matchRemember('I click the button')).toBeUndefined();
  });
});

describe('FlowRegistry', () => {
  it('add/list/getByName work', () => {
    const a = makeFlow({ name: 'flow a' });
    const b = makeFlow({ name: 'flow b' });
    const registry = new FlowRegistry([a]);
    registry.add(b);
    expect(registry.list()).toEqual([a, b]);
    expect(registry.getByName('flow b')).toBe(b);
    expect(registry.getByName('nope')).toBeUndefined();
  });

  it('matches a cucumber expression name and binds {string}/{int} positionally', () => {
    const registry = new FlowRegistry([
      makeFlow({
        name: 'I am logged in as {string} with {int} retries',
        params: ['role', 'retries'],
      }),
    ]);
    const match = registry.matchStep(
      'I am logged in as "admin" with 3 retries',
    );
    expect(match).toBeDefined();
    expect(match?.args).toEqual({ role: 'admin', retries: '3' });
  });

  it('returns undefined when no flow matches', () => {
    const registry = new FlowRegistry([
      makeFlow({ name: 'I am logged in as {string}', params: ['role'] }),
    ]);
    expect(registry.matchStep('something unrelated')).toBeUndefined();
  });

  it('falls back to exact-string equality when the name fails to compile', () => {
    const registry = new FlowRegistry([
      makeFlow({ name: 'I do {unknownType} stuff' }),
    ]);
    const match = registry.matchStep('I do {unknownType} stuff');
    expect(match).toBeDefined();
    expect(match?.args).toEqual({});
    expect(registry.matchStep('I do other stuff')).toBeUndefined();
  });

  it('throws an ambiguous error listing each flow name + uri when 2+ match', () => {
    const registry = new FlowRegistry([
      makeFlow({
        name: 'I log in as {string}',
        params: ['role'],
        uri: 'features/a.feature',
      }),
      makeFlow({
        name: 'I log in as "admin"',
        uri: 'features/b.feature',
      }),
    ]);
    expect(() => registry.matchStep('I log in as "admin"')).toThrow(
      /\[midscene-bdd\] Ambiguous[\s\S]*"I log in as \{string\}" \(features\/a\.feature\)[\s\S]*"I log in as "admin"" \(features\/b\.feature\)/,
    );
  });

  it('throws when capture count and @param: count disagree', () => {
    const registry = new FlowRegistry([
      makeFlow({
        name: 'I am logged in as {string}',
        params: [],
        uri: 'features/login.feature',
      }),
    ]);
    expect(() => registry.matchStep('I am logged in as "admin"')).toThrow(
      '[midscene-bdd] Flow "I am logged in as {string}" (features/login.feature): expression captures 1 values but @param: declares 0 (params: (none))',
    );
  });

  describe('literal "I run the ... flow" sugar', () => {
    it('looks up the flow by name and binds args by NAME, not position', () => {
      const registry = new FlowRegistry([
        makeFlow({ name: 'login', params: ['role', 'name'] }),
      ]);
      const match = registry.matchStep(
        'I run the "login" flow with name "bob" role "admin"',
      );
      expect(match?.flow.name).toBe('login');
      expect(match?.args).toEqual({ role: 'admin', name: 'bob' });
    });

    it('works without a with-clause for zero-param flows', () => {
      const registry = new FlowRegistry([makeFlow({ name: 'logout' })]);
      const match = registry.matchStep('I run the "logout" flow');
      expect(match?.flow.name).toBe('logout');
      expect(match?.args).toEqual({});
    });

    it('throws on an unknown flow name, listing registered flows', () => {
      const registry = new FlowRegistry([
        makeFlow({ name: 'login' }),
        makeFlow({ name: 'logout' }),
      ]);
      expect(() => registry.matchStep('I run the "nope" flow')).toThrow(
        '[midscene-bdd] Unknown flow "nope". Registered flows: "login", "logout"',
      );
    });

    it('throws on an unknown argument name', () => {
      const registry = new FlowRegistry([
        makeFlow({ name: 'login', params: ['role'] }),
      ]);
      expect(() =>
        registry.matchStep('I run the "login" flow with bogus "x"'),
      ).toThrow(/unknown argument "bogus"/);
    });

    it('throws on missing arguments', () => {
      const registry = new FlowRegistry([
        makeFlow({ name: 'login', params: ['role', 'name'] }),
      ]);
      expect(() =>
        registry.matchStep('I run the "login" flow with role "admin"'),
      ).toThrow(/missing argument\(s\): name/);
    });
  });
});

describe('executeFlow', () => {
  it('runs steps in order through runStep with a fresh scope seeded from args', async () => {
    const flow = makeFlow({
      name: 'login',
      params: ['role'],
      pickle: {
        steps: [makeStep('one'), makeStep('two'), makeStep('three')],
      } as unknown as Pickle,
    });
    const parentCtx = makeParentCtx({ vars: new Map([['outer', 'x']]) });
    const seen: Array<{
      text: string;
      vars: Map<string, string>;
      depth: number;
    }> = [];
    await executeFlow(
      { flow, args: { role: 'admin' } },
      parentCtx,
      async (ctx) => {
        seen.push({ text: ctx.stepText, vars: ctx.vars, depth: ctx.flowDepth });
      },
    );
    expect(seen.map((s) => s.text)).toEqual(['one', 'two', 'three']);
    // Fresh scope: seeded ONLY with args, no parent vars leak in.
    expect(seen[0].vars.get('role')).toBe('admin');
    expect(seen[0].vars.has('outer')).toBe(false);
    // Same scope shared across all steps of the flow.
    expect(seen[1].vars).toBe(seen[0].vars);
    expect(seen[0].depth).toBe(1);
    // Parent scope untouched (no returns declared).
    expect(parentCtx.vars).toEqual(new Map([['outer', 'x']]));
  });

  it('copies @returns vars back into the parent scope', async () => {
    const flow = makeFlow({
      name: 'login',
      returns: ['token'],
      pickle: { steps: [makeStep('capture')] } as unknown as Pickle,
    });
    const parentCtx = makeParentCtx();
    await executeFlow({ flow, args: {} }, parentCtx, async (ctx) => {
      ctx.vars.set('token', 'abc123');
      ctx.vars.set('internal', 'hidden');
    });
    expect(parentCtx.vars.get('token')).toBe('abc123');
    expect(parentCtx.vars.has('internal')).toBe(false);
  });

  it('throws when a declared @returns var was never captured', async () => {
    const flow = makeFlow({
      name: 'login',
      returns: ['token'],
      pickle: { steps: [makeStep('noop')] } as unknown as Pickle,
    });
    await expect(
      executeFlow({ flow, args: {} }, makeParentCtx(), async () => {}),
    ).rejects.toThrow(
      '[midscene-bdd] Flow "login": declares @returns:token but never captured it',
    );
  });

  it('throws when the depth cap is exceeded (2 -> 3)', async () => {
    const flow = makeFlow({
      name: 'deep',
      pickle: { steps: [makeStep('noop')] } as unknown as Pickle,
    });
    const runStep = vi.fn();
    await expect(
      executeFlow({ flow, args: {} }, makeParentCtx({ flowDepth: 2 }), runStep),
    ).rejects.toThrow(
      '[midscene-bdd] Flow "deep": call depth exceeds 2; flatten the composition.',
    );
    expect(runStep).not.toHaveBeenCalled();
  });

  it('passes dataTable/docString from the step argument', async () => {
    const tableStep = {
      text: 'with table',
      argument: {
        dataTable: {
          rows: [
            { cells: [{ value: 'a' }, { value: 'b' }] },
            { cells: [{ value: '1' }, { value: '2' }] },
          ],
        },
      },
    } as unknown as PickleStep;
    const docStep = {
      text: 'with doc',
      argument: { docString: { content: 'hello\nworld' } },
    } as unknown as PickleStep;
    const flow = makeFlow({
      name: 'args',
      pickle: { steps: [tableStep, docStep] } as unknown as Pickle,
    });
    const seen: Array<{ dataTable?: string; docString?: string }> = [];
    await executeFlow({ flow, args: {} }, makeParentCtx(), async (ctx) => {
      seen.push({ dataTable: ctx.dataTable, docString: ctx.docString });
    });
    expect(seen[0].dataTable).toBe('| a | b |\n| 1 | 2 |');
    expect(seen[0].docString).toBeUndefined();
    expect(seen[1].dataTable).toBeUndefined();
    expect(seen[1].docString).toBe('hello\nworld');
  });
});
