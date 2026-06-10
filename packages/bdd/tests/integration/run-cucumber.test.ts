/**
 * End-to-end integration test for the @midscene/bdd pipeline over REAL
 * `.feature` fixture files, with stub agents (no browser, no model).
 *
 * APPROACH NOTE (decision documented per plan): cucumber v13's programmatic
 * API (`loadConfiguration` + `runCucumber` from '@cucumber/cucumber/api') can
 * only load support code from real files — `runCucumber(options)` accepts a
 * pre-built `ISupportCodeLibrary`, but the only public way to obtain one is
 * `loadSupport`, and its loader (lib/api/support.js) imports support files
 * via Node's native `import()`/`require()`, bypassing vitest's TS transform.
 * Our `src/` is TS-only (no dist in this repo state) and uses non-erasable
 * syntax, so Node cannot load it natively. Therefore this test drives the
 * pipeline programmatically: it loads the fixture `midscene.config.ts` via
 * `loadBddConfig` (jiti), scans fixture features via `scanAssets`, discovers
 * fixture skills, and for every pickle step builds a RouterContext EXACTLY
 * the way `src/register.ts` does (same annotation resolution, step typing,
 * data-table rendering, per-scenario vars, lazy agents) and runs it through
 * `src/router.ts#runStep`. This exercises config + assets + flows + vars +
 * annotations + skills + no-ai + router + the real uiAgent factory path
 * end to end; cucumber's own runner glue is covered structurally by
 * profile.test.ts and world.test.ts.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { GherkinDocument, Pickle, PickleStep } from '@cucumber/messages';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createUiAgent } from '../../src/agents/ui-agent';
import { buildStepContext } from '../../src/annotations';
import { parseFeature, scanAssets } from '../../src/assets';
import { loadBddConfig } from '../../src/config';
import { clearUserSteps, Given as noAiGiven } from '../../src/no-ai';
import { runStep } from '../../src/router';
import { discoverSkills } from '../../src/skills';
import type {
  FlowRegistryLike,
  GeneralAgent,
  GeneralAgentRequest,
  ResolvedBddConfig,
  RouterContext,
  Skill,
  UiAgent,
} from '../../src/types';

const FIXTURES_DIR = path.resolve(__dirname, 'fixtures');
const CONFIG_PATH = path.join(FIXTURES_DIR, 'midscene.config.ts');

// ———————————————————————— UI stub plumbing ————————————————————————

/** Must match the key used by fixtures/midscene.config.ts. */
const UI_STUB_KEY = '__midscene_bdd_integration_ui_stub__';

interface UiStubRecord {
  calls: Array<[method: 'act' | 'assert' | 'string', prompt: string]>;
  factoryCalls: number;
}

function uiRecord(): UiStubRecord {
  const g = globalThis as Record<string, unknown>;
  if (!g[UI_STUB_KEY]) {
    g[UI_STUB_KEY] = { calls: [], factoryCalls: 0 } satisfies UiStubRecord;
  }
  return g[UI_STUB_KEY] as UiStubRecord;
}

// ——————————————————————— general agent stub ———————————————————————

const generalCalls: GeneralAgentRequest[] = [];

const fakeGeneralAgent: GeneralAgent = {
  async run(req) {
    generalCalls.push(req);
    if (req.kind === 'assert') {
      if (req.prompt.includes('VERDICT_FAIL')) {
        return {
          text: 'probe found errors',
          verdict: { pass: false, reason: 'probe found errors' },
        };
      }
      return {
        text: 'all healthy',
        verdict: { pass: true, reason: 'all healthy' },
      };
    }
    return { text: 'acted' };
  },
};

// ————————————————— scenario harness (mirrors register.ts) —————————————————

interface ScenarioResult {
  status: 'passed' | 'failed';
  error?: Error;
  logs: string[];
  attachments: string[];
  vars: Map<string, string>;
}

let config: ResolvedBddConfig;
let flows: FlowRegistryLike;
let skills: Map<string, Skill>;

/**
 * Run one pickle the way register.ts runs a scenario: fresh vars (Before
 * hook), per-step RouterContext (BeforeStep + catch-all Given), lazy agents.
 */
async function runScenario(
  document: GherkinDocument,
  pickle: Pickle,
): Promise<ScenarioResult> {
  const vars = new Map<string, string>();
  const logs: string[] = [];
  const attachments: string[] = [];

  // Lazy UI agent through the REAL factory path (createUiAgent invokes the
  // fixture config's uiAgent factory), cached like MidsceneWorld does.
  let uiState: { agent: UiAgent } | undefined;
  const getUiAgent = async (): Promise<UiAgent> => {
    if (!uiState) {
      uiState = await createUiAgent(config);
    }
    return uiState.agent;
  };

  try {
    for (const pickleStep of pickle.steps) {
      // The SAME context builder register.ts uses, so this harness can never
      // drift from the production wiring.
      const ctx = buildStepContext({
        document,
        pickle,
        pickleStep,
        vars,
        flowDepth: 0,
        runtime: { flows, skills, config },
        agents: {
          getUiAgent,
          getGeneralAgent: async () => fakeGeneralAgent,
          peekUiAgent: () => uiState?.agent,
        },
        attach: (data) => {
          attachments.push(data);
        },
        log: (text) => {
          logs.push(text);
        },
      });
      await runStep(ctx);
    }
    return { status: 'passed', logs, attachments, vars };
  } catch (error) {
    return {
      status: 'failed',
      error: error as Error,
      logs,
      attachments,
      vars,
    };
  }
}

function loadFeature(relPath: string): {
  document: GherkinDocument;
  pickles: Pickle[];
} {
  const file = path.join(FIXTURES_DIR, relPath);
  return parseFeature(readFileSync(file, 'utf-8'), file);
}

function pickleByName(parsed: { pickles: Pickle[] }, name: string): Pickle {
  const matches = parsed.pickles.filter((pickle) => pickle.name === name);
  if (matches.length !== 1) {
    throw new Error(
      `expected exactly one pickle named "${name}", found ${matches.length}`,
    );
  }
  return matches[0];
}

// ———————————————————————————— tests ————————————————————————————

beforeAll(async () => {
  config = await loadBddConfig({ configPath: CONFIG_PATH });
  const scanned = await scanAssets(config);
  flows = scanned.flows;
  skills = await discoverSkills(
    path.resolve(config.baseDir, config.paths.skills),
  );

  expect(scanned.files.length).toBeGreaterThanOrEqual(5);
  expect(flows.list().map((flow) => flow.name)).toEqual([
    'I am logged in as {string}',
  ]);
  expect(Array.from(skills.keys())).toEqual(['probe']);
});

beforeEach(() => {
  clearUserSteps();
  generalCalls.length = 0;
  const record = uiRecord();
  record.calls.length = 0;
  record.factoryCalls = 0;
});

describe('route 1: default UI agent', () => {
  it('acts on Given/When and asserts on Then, in order', async () => {
    const parsed = loadFeature('features/ui-basic.feature');
    const result = await runScenario(
      parsed.document,
      pickleByName(parsed, 'happy path acts then asserts'),
    );

    expect(result.status).toBe('passed');
    expect(uiRecord().calls).toEqual([
      ['act', 'I open the demo shop'],
      ['act', 'I add the first item to the cart'],
      ['assert', 'the cart badge shows 1'],
    ]);
    // The factory ran exactly once: lazy creation, cached for the scenario.
    expect(uiRecord().factoryCalls).toBe(1);
  });

  it('fails the scenario with the agent-thrown error on a hard Then', async () => {
    const parsed = loadFeature('features/ui-basic.feature');
    const result = await runScenario(
      parsed.document,
      pickleByName(parsed, 'failing assertion'),
    );

    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('stub assertion failed');
    expect(result.error?.message).toContain('FAIL_ME');
    expect(uiRecord().calls).toEqual([
      ['act', 'I open the demo shop'],
      ['assert', 'the page shows the FAIL_ME banner'],
    ]);
  });
});

describe('route 2: @soft', () => {
  it('downgrades a failing soft Then to a logged warning', async () => {
    const parsed = loadFeature('features/soft.feature');
    const result = await runScenario(
      parsed.document,
      pickleByName(parsed, 'soft assertion failure is downgraded to a warning'),
    );

    expect(result.status).toBe('passed');
    expect(uiRecord().calls).toEqual([
      ['act', 'I open the demo shop'],
      ['assert', 'the promo banner is in SOFT_FAIL state'],
    ]);
    const warning = result.logs.find((line) =>
      line.includes('soft check failed'),
    );
    expect(warning).toBeDefined();
    expect(warning).toContain('the promo banner is in SOFT_FAIL state');
    expect(warning).toContain('soft-fail');
    expect(result.attachments).toContainEqual(warning);
  });
});

describe('route 3: @no-ai', () => {
  it('runs a registered callback with the RouterContext as `this`', async () => {
    let receivedThis: RouterContext | undefined;
    let receivedArg: unknown;
    noAiGiven(
      'the counter is reset to {string}',
      function (this: unknown, value: unknown) {
        receivedThis = this as RouterContext;
        receivedArg = value;
      },
    );

    const parsed = loadFeature('features/no-ai.feature');
    const result = await runScenario(
      parsed.document,
      pickleByName(parsed, 'matched user callback'),
    );

    expect(result.status).toBe('passed');
    expect(receivedArg).toBe('5');
    expect(receivedThis?.stepText).toBe('the counter is reset to "5"');
    expect(receivedThis?.annotations.noAi).toBe(true);
    // No-AI steps must never touch the UI agent.
    expect(uiRecord().calls).toEqual([]);
    expect(uiRecord().factoryCalls).toBe(0);
  });

  it('fails an unmatched @no-ai step with an implementation snippet', async () => {
    const parsed = loadFeature('features/no-ai.feature');
    const result = await runScenario(
      parsed.document,
      pickleByName(parsed, 'unmatched user callback'),
    );

    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('Implement it');
    expect(result.error?.message).toContain('some step nobody implemented yet');
  });
});

describe('route 4: agent / $skill', () => {
  it('routes a $skill Then to the general agent with the skill loaded', async () => {
    const parsed = loadFeature('features/agent-skill.feature');
    const result = await runScenario(
      parsed.document,
      pickleByName(parsed, 'skill-backed assert passes'),
    );

    expect(result.status).toBe('passed');
    expect(generalCalls).toHaveLength(1);
    const request = generalCalls[0];
    expect(request.kind).toBe('assert');
    expect(request.prompt).toContain('the backend logs are clean per $probe');
    expect(request.skills.map((skill) => skill.name)).toEqual(['probe']);
    expect(request.skills[0].content).toContain('backend service logs');
    // No UI session existed, so no screenshot and no browser launch.
    expect(request.screenshotBase64).toBeUndefined();
    expect(uiRecord().factoryCalls).toBe(0);
  });

  it('fails the step with the verdict reason on a failing verdict', async () => {
    const parsed = loadFeature('features/agent-skill.feature');
    const result = await runScenario(
      parsed.document,
      pickleByName(parsed, 'skill-backed assert fails'),
    );

    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('Agent assertion failed');
    expect(result.error?.message).toContain('probe found errors');
  });

  it('fails an unknown $skill token listing the available skills', async () => {
    const parsed = loadFeature('features/agent-skill.feature');
    const result = await runScenario(
      parsed.document,
      pickleByName(parsed, 'unknown skill token'),
    );

    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('Unknown skill $nope');
    expect(result.error?.message).toContain('probe');
    expect(generalCalls).toHaveLength(0);
  });
});

describe('route 5: flows + vars', () => {
  it('runs a declarative flow call, copies @returns, captures and substitutes vars', async () => {
    const parsed = loadFeature('features/flows-vars.feature');
    const result = await runScenario(
      parsed.document,
      pickleByName(parsed, 'declarative flow call, returns and capture'),
    );

    expect(result.status).toBe('passed');
    expect(uiRecord().calls).toEqual([
      // Flow body, with <role> bound to "admin" from the expression capture.
      ['act', 'I open the login page'],
      ['act', 'I sign in with the "admin" account'],
      ['assert', 'the dashboard is visible'],
      ['string', 'the greeting banner text'],
      // Back at scenario level: capture, then substituted assert.
      ['string', 'the first item price'],
      ['assert', 'the order total equals 42.00 and greets hello-from-stub'],
    ]);
    // @returns:greeting copied into the caller scope; price captured there.
    expect(result.vars.get('greeting')).toBe('hello-from-stub');
    expect(result.vars.get('price')).toBe('42.00');
  });

  it('supports the literal `I run the ... flow with ...` sugar', async () => {
    const parsed = loadFeature('features/flows-vars.feature');
    const result = await runScenario(
      parsed.document,
      pickleByName(parsed, 'literal flow sugar'),
    );

    expect(result.status).toBe('passed');
    expect(uiRecord().calls).toEqual([
      ['act', 'I open the login page'],
      ['act', 'I sign in with the "guest" account'],
      ['assert', 'the dashboard is visible'],
      ['string', 'the greeting banner text'],
    ]);
    expect(result.vars.get('greeting')).toBe('hello-from-stub');
  });

  it('fails an empty capture when capture.failOnEmpty is on (default)', async () => {
    const parsed = loadFeature('features/flows-vars.feature');
    const result = await runScenario(
      parsed.document,
      pickleByName(parsed, 'empty capture fails'),
    );

    expect(result.status).toBe('failed');
    expect(result.error?.message).toContain('empty value');
    expect(result.error?.message).toContain('missing');
  });

  it('feeds the flow expression from Scenario Outline examples', async () => {
    const parsed = loadFeature('features/flows-vars.feature');
    const outlinePickles = parsed.pickles.filter(
      (pickle) => pickle.name === 'outline feeds the flow expression',
    );
    expect(outlinePickles).toHaveLength(2);

    const signIns: string[] = [];
    for (const pickle of outlinePickles) {
      uiRecord().calls.length = 0;
      const result = await runScenario(parsed.document, pickle);
      expect(result.status).toBe('passed');
      const signIn = uiRecord().calls.find(([, prompt]) =>
        prompt.startsWith('I sign in'),
      );
      expect(signIn).toBeDefined();
      signIns.push((signIn as [string, string])[1]);
    }

    expect(signIns).toEqual([
      'I sign in with the "admin" account',
      'I sign in with the "guest" account',
    ]);
  });
});
