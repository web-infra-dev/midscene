import { describe, expect, it, vi } from 'vitest';
import { runCase } from '../../src/engine/run-case';
import type {
  GeneralAgentAdapter,
  GeneralAgentInput,
  GeneralAgentResult,
} from '../../src/general-agent/types';
import { defineRuntime } from '../../src/runtime';
import type { Agent } from '../../src/types';
import { parseCaseYaml } from '../../src/yaml/parse';

function fakeAgent(overrides: Partial<Record<string, unknown>> = {}): Agent {
  const agent = {
    aiAct: vi.fn(async () => undefined),
    aiAsk: vi.fn(async () => 'did the thing'),
    interface: {
      screenshotBase64: vi.fn(async () => 'data:image/png;base64,AAAA'),
    },
    reportFile: '/tmp/report.html',
    ...overrides,
  };
  return agent as unknown as Agent;
}

function fakeGeneralAgent(
  handler: (input: GeneralAgentInput) => GeneralAgentResult,
): GeneralAgentAdapter {
  return { run: async (input) => handler(input) };
}

const base = {
  projectRoot: '/proj',
  env: {} as NodeJS.ProcessEnv,
  runtimeNodes: {},
};

describe('runCase node semantics', () => {
  it('ui produces a natural-language output', async () => {
    const parsed = parseCaseYaml('flow:\n  - ui: do something');
    const result = await runCase({
      ...base,
      parsed,
      file: 'c.yaml',
      uiAgent: fakeAgent(),
      generalAgent: fakeGeneralAgent(() => ({ text: '' })),
    });
    expect(result.status).toBe('passed');
    expect(result.steps[0].output?.text).toBe('did the thing');
  });

  it('verify pass keeps case green', async () => {
    const parsed = parseCaseYaml('flow:\n  - verify: ok?');
    const result = await runCase({
      ...base,
      parsed,
      file: 'c.yaml',
      uiAgent: fakeAgent(),
      generalAgent: fakeGeneralAgent(() => ({
        text: 'looks good',
        verdict: { pass: true, reason: 'all good' },
      })),
    });
    expect(result.status).toBe('passed');
    expect(result.steps[0].verdict?.pass).toBe(true);
  });

  it('verify fail fails the case and stops the flow', async () => {
    const parsed = parseCaseYaml('flow:\n  - verify: ok?\n  - ui: next');
    const uiAgent = fakeAgent();
    const result = await runCase({
      ...base,
      parsed,
      file: 'c.yaml',
      uiAgent,
      generalAgent: fakeGeneralAgent(() => ({
        text: 'nope',
        verdict: { pass: false, reason: 'missing' },
      })),
    });
    expect(result.status).toBe('failed');
    expect(result.steps).toHaveLength(1); // stopped before ui
  });

  it('verify prompts carry the adapter-supplied verdict instructions', async () => {
    const parsed = parseCaseYaml('flow:\n  - verify: ok?');
    const seen: string[] = [];
    const result = await runCase({
      ...base,
      parsed,
      file: 'c.yaml',
      uiAgent: fakeAgent(),
      generalAgent: {
        verdictInstructions: 'Reply with VERDICT: pass or VERDICT: fail.',
        run: async (input) => {
          seen.push(input.context);
          return { text: 'ok', verdict: { pass: true, reason: 'fine' } };
        },
      },
    });
    expect(result.status).toBe('passed');
    // The adapter's own verdict channel is what the prompt demands — no
    // hardcoded report_verdict wording for adapters without that tool.
    expect(seen[0]).toContain('Reply with VERDICT: pass or VERDICT: fail.');
    expect(seen[0]).not.toContain('report_verdict');
  });

  it('verify with NO verdict is fail-closed', async () => {
    const parsed = parseCaseYaml('flow:\n  - verify: ok?');
    const result = await runCase({
      ...base,
      parsed,
      file: 'c.yaml',
      uiAgent: fakeAgent(),
      generalAgent: fakeGeneralAgent(() => ({ text: 'I am not sure' })),
    });
    expect(result.status).toBe('failed');
    expect(result.steps[0].verdict?.pass).toBe(false);
    expect(result.steps[0].verdict?.reason).toMatch(/fail-closed/);
  });

  it('soft fail only warns, does not gate', async () => {
    const parsed = parseCaseYaml('flow:\n  - soft: nit?\n  - ui: keep going');
    const result = await runCase({
      ...base,
      parsed,
      file: 'c.yaml',
      uiAgent: fakeAgent(),
      generalAgent: fakeGeneralAgent((input) =>
        input.kind === 'soft'
          ? { text: 'minor', verdict: { pass: false, reason: 'tiny glitch' } }
          : { text: '' },
      ),
    });
    expect(result.status).toBe('passed');
    expect(result.steps).toHaveLength(2);
    expect(result.warnings.join(' ')).toMatch(/tiny glitch/);
  });

  it('agent is advisory and never gates, even on error', async () => {
    const parsed = parseCaseYaml('flow:\n  - agent: explore');
    const result = await runCase({
      ...base,
      parsed,
      file: 'c.yaml',
      uiAgent: fakeAgent(),
      generalAgent: {
        run: async () => {
          throw new Error('boom');
        },
      },
    });
    expect(result.status).toBe('passed');
    expect(result.warnings.join(' ')).toMatch(/boom/);
  });

  it('ui action throwing fails the case', async () => {
    const parsed = parseCaseYaml('flow:\n  - ui: do');
    const result = await runCase({
      ...base,
      parsed,
      file: 'c.yaml',
      uiAgent: fakeAgent({
        aiAct: vi.fn(async () => {
          throw new Error('click failed');
        }),
      }),
      generalAgent: fakeGeneralAgent(() => ({ text: '' })),
    });
    expect(result.status).toBe('failed');
    expect(result.steps[0].error).toMatch(/click failed/);
  });

  it('custom runtime node exposes conclusion and state', async () => {
    const parsed = parseCaseYaml(
      'flow:\n  - prep:\n      scenario: paid\n  - verify: check',
    );
    const seen: string[] = [];
    const result = await runCase({
      ...base,
      runtimeNodes: {
        prep: defineRuntime(async (input, ctx) => {
          ctx.state.fixtureId = 'fx-1';
          return {
            conclusion: `prepared ${(input as { scenario: string }).scenario}`,
          };
        }),
      },
      parsed,
      file: 'c.yaml',
      uiAgent: fakeAgent(),
      generalAgent: fakeGeneralAgent((input) => {
        seen.push(input.context);
        return { text: 'ok', verdict: { pass: true, reason: 'fine' } };
      }),
    });
    expect(result.status).toBe('passed');
    expect(result.steps[0].output?.text).toBe('prepared paid');
    // conclusion flows into later verify context; state never does
    expect(seen[0]).toContain('prepared paid');
    expect(seen[0]).not.toContain('fixtureId');
  });

  it('unknown node fails the case', async () => {
    const parsed = parseCaseYaml('flow:\n  - mysteryNode: x');
    const result = await runCase({
      ...base,
      parsed,
      file: 'c.yaml',
      uiAgent: fakeAgent(),
      generalAgent: fakeGeneralAgent(() => ({ text: '' })),
    });
    expect(result.status).toBe('failed');
    expect(result.steps[0].error).toMatch(/Unknown node/);
  });
});
