import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import type { MidsceneConfig } from '../../src/config/types';
import type {
  GeneralAgentAdapter,
  GeneralAgentInput,
} from '../../src/general-agent/types';
import { runAll } from '../../src/runner/run';
import { defineRuntime } from '../../src/runtime';
import type { Agent, RunSummary } from '../../src/types';

/**
 * CI-friendly mock-model smoke. Runs the REAL runner end-to-end over the REAL
 * example cases — discovery, YAML parsing, the node engine, output store, and
 * summary writing — while mocking the two external boundaries the sandbox/CI
 * cannot reach: the browser (a fake UI Agent) and the model (a mock agent
 * runtime). No network, no Chrome, fully deterministic.
 */

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');
const exampleDir = join(repoRoot, 'example');

function fakeUiAgent(): Agent {
  return {
    aiAct: vi.fn(async () => undefined),
    aiAsk: vi.fn(async () => 'recorded the requested values'),
    interface: {
      screenshotBase64: vi.fn(async () => 'data:image/png;base64,AAAA'),
    },
    reportFile: undefined,
  } as unknown as Agent;
}

describe('runner mock-model smoke (example cases)', () => {
  it('runs the example suite green with a mocked browser + model', async () => {
    const seenVerify: GeneralAgentInput[] = [];

    const mockGeneralAgent: GeneralAgentAdapter = {
      run: async (input) => {
        if (input.kind === 'verify' || input.kind === 'soft') {
          seenVerify.push(input);
          return {
            text: 'verified',
            verdict: { pass: true, reason: 'mock pass' },
          };
        }
        return { text: 'mock analysis' };
      },
    };

    const summaryPath = join(
      mkdtempSync(join(tmpdir(), 'mts-smoke-')),
      'summary.json',
    );

    const config: MidsceneConfig = {
      uiAgent: async () => ({ agent: fakeUiAgent() }),
      testDir: join(exampleDir, 'e2e'),
      include: ['**/*.yaml'],
      exclude: ['**/*.draft.yaml'],
      output: { summary: summaryPath },
      generalAgent: mockGeneralAgent,
      runtime: {
        prepareCartFixture: defineRuntime(async (rawInput, ctx) => {
          const input = (rawInput ?? {}) as { scenario?: string };
          ctx.state.cartFixture = { scenario: input.scenario };
          return { conclusion: `Prepared a "${input.scenario}" cart fixture.` };
        }),
        notify: defineRuntime(async (_input, ctx) => {
          const failed = ctx.result.steps.filter((s) => s.status === 'failed');
          return {
            conclusion: failed.length === 0 ? 'no alert needed' : 'would alert',
          };
        }),
      },
    };

    const summary = await runAll(config, { projectRoot: exampleDir });

    // both example cases discovered and green
    expect(summary.total).toBe(2);
    expect(summary.failed).toBe(0);
    expect(summary.passed).toBe(2);

    // the $catalog skill reference reached the verify boundary
    const referenced = seenVerify.flatMap((i) => i.referencedSkills);
    expect(referenced).toContain('catalog');

    // verify always received the (mocked) current screenshot
    expect(seenVerify.every((i) => Boolean(i.screenshotBase64))).toBe(true);

    // a runtime conclusion is visible in later context; engineering state is not
    const ctxWithFixture = seenVerify.find((i) =>
      i.context.includes('cart fixture'),
    );
    expect(ctxWithFixture).toBeDefined();
    expect(ctxWithFixture?.context).not.toContain('cartFixture');

    // the summary file was written and round-trips
    const written = JSON.parse(
      readFileSync(summaryPath, 'utf-8'),
    ) as RunSummary;
    expect(written.total).toBe(2);
    expect(written.cases.map((c) => c.status)).toEqual(['passed', 'passed']);
  });
});
