import type { GherkinDocument, Pickle, PickleStep } from '@cucumber/messages';
import { describe, expect, it, vi } from 'vitest';
import { FlowRegistry, executeFlow, substituteParams } from '../../src/flows';
import type {
  FlowDef,
  ResolvedBddConfig,
  RouterContext,
} from '../../src/types';

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

describe('substituteParams', () => {
  const flow = makeFlow({
    name: 'I am logged in as {string}',
    params: ['role'],
    uri: 'features/login.feature',
  });

  it('replaces declared params, all occurrences', () => {
    expect(
      substituteParams('the dashboard for "<role>" greets <role>', flow, {
        role: 'admin',
      }),
    ).toBe('the dashboard for "admin" greets admin');
  });

  it('throws on an identifier-shaped placeholder that is not a param', () => {
    expect(() => substituteParams('use <typo>', flow, { role: 'x' })).toThrow(
      '[midscene-bdd] Flow "I am logged in as {string}" (features/login.feature): step "use <typo>" references <typo>, which is not a declared @param: (params: role)',
    );
  });

  it("reports '(none)' for a zero-param flow", () => {
    expect(() =>
      substituteParams('use <x>', makeFlow({ name: 'zero' }), {}),
    ).toThrow(/params: \(none\)/);
  });

  it('leaves non-identifier <...> content untouched', () => {
    expect(
      substituteParams('press <left-arrow> then <1abc> <role>', flow, {
        role: 'admin',
      }),
    ).toBe('press <left-arrow> then <1abc> admin');
    expect(substituteParams('compare 1 < 2 > 0', flow, { role: 'x' })).toBe(
      'compare 1 < 2 > 0',
    );
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
  it('runs steps in order through runStep with <param> substituted', async () => {
    const flow = makeFlow({
      name: 'login',
      params: ['role'],
      pickle: {
        steps: [
          makeStep('I open the login page'),
          makeStep('I sign in as "<role>"'),
          makeStep('the "<role>" dashboard is visible'),
        ],
      } as unknown as Pickle,
    });
    const seen: Array<{ text: string; depth: number }> = [];
    await executeFlow(
      { flow, args: { role: 'admin' } },
      makeParentCtx(),
      async (ctx) => {
        seen.push({ text: ctx.stepText, depth: ctx.flowDepth });
      },
    );
    expect(seen.map((s) => s.text)).toEqual([
      'I open the login page',
      'I sign in as "admin"',
      'the "admin" dashboard is visible',
    ]);
    expect(seen.map((s) => s.depth)).toEqual([1, 1, 1]);
  });

  it('throws when a flow-body step references an undeclared placeholder', async () => {
    const flow = makeFlow({
      name: 'login',
      params: ['role'],
      pickle: {
        steps: [makeStep('I sign in as "<typo>"')],
      } as unknown as Pickle,
    });
    const runStep = vi.fn();
    await expect(
      executeFlow({ flow, args: { role: 'admin' } }, makeParentCtx(), runStep),
    ).rejects.toThrow(/references <typo>, which is not a declared @param:/);
    expect(runStep).not.toHaveBeenCalled();
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
