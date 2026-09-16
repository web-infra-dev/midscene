import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runTestProject } from '../src/cli/test-project-runner';

const launcher = vi.hoisted(() => ({ createYamlAgent: vi.fn() }));
vi.mock('../src/runtime/create-yaml-player', () => ({
  createYamlAgent: launcher.createYamlAgent,
}));
vi.mock('../src/runtime/dotenv-loader', () => ({ loadDotenvConfig: vi.fn() }));

const createAgent = () => ({
  getActionSpace: vi.fn(async () => []),
  aiLocate: vi.fn(async () => ({ center: [10, 20] })),
  aiQuery: vi.fn(async () => ({ title: 'fixture' })),
  aiAssert: vi.fn(async () => ({
    pass: true,
    thought: 'ok',
    message: 'passed',
  })),
  aiAct: vi.fn(async () => undefined),
  aiTap: vi.fn(async () => undefined),
  aiWaitFor: vi.fn(async () => undefined),
  aiScroll: vi.fn(async () => undefined),
  sleep: vi.fn(async () => undefined),
  callActionInActionSpace: vi.fn(async () => undefined),
  evaluateJavaScript: vi.fn(async () => 42),
});

let root: string;
let agent: ReturnType<typeof createAgent>;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'legacy-yaml-input-'));
  vi.stubEnv('MIDSCENE_RUN_DIR', join(root, 'midscene_run'));
  agent = createAgent();
  launcher.createYamlAgent.mockReset();
  launcher.createYamlAgent.mockResolvedValue({ agent, freeFn: [] });
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
const run = async (tasks: unknown[]) => {
  const path = join(root, 'flow.yaml');
  writeFileSync(
    path,
    JSON.stringify({ agent: { generateReport: false }, tasks }),
  );
  return runTestProject({ cwd: root, projectRoot: path });
};
const readLegacyOutput = () => {
  const dir = join(root, 'midscene_run', 'output');
  const summaryPath = join(
    dir,
    readdirSync(dir).find((file) => /^summary-\d+\.json$/.test(file))!,
  );
  const summary = JSON.parse(readFileSync(summaryPath, 'utf8'));
  return JSON.parse(
    readFileSync(
      resolve(dirname(summaryPath), summary.results[0].output),
      'utf8',
    ),
  );
};

// Independently frozen old Agent calls; do not compare only with ScriptPlayer,
// which shares this host's compiler and can fail in exactly the same way.
const cases = [
  {
    id: 'locate observation options',
    node: 'aiLocate' as const,
    input: {
      aiLocate: 'button',
      domIncluded: 'visible-only',
      screenshotIncluded: false,
      name: 'button',
    },
    prompt: 'button',
    options: { domIncluded: 'visible-only', screenshotIncluded: false },
    output: { button: { center: [10, 20] } },
  },
  {
    id: 'query extra options',
    node: 'aiQuery' as const,
    input: { aiQuery: 'title', cacheable: false, extension: { enabled: true } },
    prompt: 'title',
    options: { cacheable: false, extension: { enabled: true } },
    output: { '0': { title: 'fixture' } },
  },
  {
    id: 'assert extra options',
    node: 'aiAssert' as const,
    input: { aiAssert: 'ready', cacheable: false, name: 'assertion' },
    prompt: 'ready',
    options: { cacheable: false, keepRawResponse: true },
    output: { assertion: { pass: true, thought: 'ok', message: 'passed' } },
  },
  {
    id: 'zero timeout alias',
    node: 'aiWaitFor' as const,
    input: { aiWaitFor: 'ready', timeout: 0, timeoutMs: 25 },
    prompt: 'ready',
    options: { timeout: 0, timeoutMs: 0 },
  },
  {
    id: 'zero wait interval',
    node: 'aiWaitFor' as const,
    input: { aiWaitFor: 'ready', checkIntervalMs: 0 },
    prompt: 'ready',
    options: { checkIntervalMs: 0 },
  },
  {
    id: 'tap empty images stay in options',
    node: 'aiTap' as const,
    input: { aiTap: 'button', images: [] },
    prompt: 'button',
    options: { images: [] },
  },
  {
    id: 'act structured empty images',
    node: 'aiAct' as const,
    input: {
      aiAct: { prompt: 'open cart', images: [], legacyHint: 'preserved' },
    },
    prompt: { prompt: 'open cart', images: [], legacyHint: 'preserved' },
    options: {},
  },
  {
    id: 'act extra options',
    node: 'aiAct' as const,
    input: { aiAct: 'open cart', domIncluded: 'visible-only' },
    prompt: 'open cart',
    options: { domIncluded: 'visible-only' },
  },
  {
    id: 'invalid instruction fallback',
    node: 'aiAct' as const,
    input: { aiAct: 'open cart', instruction: { prompt: '' } },
    prompt: 'open cart',
    options: {},
  },
  {
    id: 'scroll extra options',
    node: 'aiScroll' as const,
    input: { aiScroll: 'list', screenshotIncluded: false },
    prompt: 'list',
    options: { screenshotIncluded: false },
  },
];

describe('legacy input compatibility through the public Test entry', () => {
  it.each(cases)(
    '$id',
    async ({ node, input, prompt, options, ...contract }) => {
      const result = await run([{ name: 'old input', flow: [input] }]);
      expect(result.status).toBe('success');
      expect(result.collectionErrors).toEqual([]);
      const call = agent[node];
      expect(call).toHaveBeenCalledTimes(1);
      const args = call.mock.calls[0] as unknown[];
      expect(args[0]).toEqual(prompt);
      if (node === 'aiAssert') expect(args[1]).toBeUndefined();
      const { abortSignal: _signal, ...actualOptions } = args[
        node === 'aiAssert' ? 2 : 1
      ] as Record<string, unknown>;
      expect(actualOptions).toEqual(options);
      if ('output' in contract)
        expect(readLegacyOutput()).toEqual(contract.output);
    },
  );

  it.each([
    ...[
      { id: 'empty step', input: null },
      { id: 'string step', input: 'invalid' },
      { id: 'numeric step', input: 42 },
      { id: 'boolean step', input: false },
      { id: 'array step', input: [] },
    ].map((contract) => ({
      ...contract,
      error: 'flow item must be an object',
    })),
    {
      id: 'assert observe',
      input: { aiAssert: 'ready', observe: false },
      error: '`observe` is not supported',
    },
    {
      id: 'query observe',
      input: { aiQuery: 'title', observe: false },
      error: '`observe` is not supported',
    },
    {
      id: 'locate observe',
      input: { aiLocate: 'button', observe: false },
      error: '`observe` is not supported',
    },
    {
      id: 'missing wait prompt',
      input: { aiWaitFor: '' },
      error: 'missing prompt for aiWaitFor',
    },
    {
      id: 'nullish act aliases',
      input: { aiAct: '', aiAction: 'must not replace primary' },
      error: 'missing prompt for ai (aiAct)',
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
  ])('$id fails at its task, not collection', async ({ input, error }) => {
    const result = await run([
      { name: 'first', flow: [{ javascript: 'first' }] },
      { name: 'invalid', continueOnError: true, flow: [input] },
      { name: 'last', flow: [{ javascript: 'last' }] },
    ]);
    expect(result.collectionErrors).toEqual([]);
    expect(result.cases.map(({ status }) => status)).toEqual([
      'success',
      'failed',
      'success',
    ]);
    expect(result.cases[1].run?.steps[0].error?.message).toContain(error);
    expect(agent.evaluateJavaScript).toHaveBeenNthCalledWith(1, 'first');
    expect(agent.evaluateJavaScript).toHaveBeenNthCalledWith(2, 'last');
    for (const node of [
      'aiAssert',
      'aiQuery',
      'aiLocate',
      'aiWaitFor',
      'aiAct',
      'sleep',
      'callActionInActionSpace',
    ] as const)
      expect(agent[node]).not.toHaveBeenCalled();
  });

  it('retains full custom assertion diagnostics in Test results, legacy output and summary', async () => {
    const diagnostic =
      'Assertion failed: submission failed\nReason: the success toast is missing';
    agent.aiAssert.mockResolvedValue({
      pass: false,
      thought: 'the success toast is missing',
      message: diagnostic,
    });
    const result = await run([
      {
        name: 'assertion',
        flow: [
          {
            aiAssert: 'success toast',
            errorMessage: 'submission failed',
            name: 'assertion',
          },
        ],
      },
    ]);
    expect(result.collectionErrors).toEqual([]);
    expect(result.cases[0].status).toBe('failed');
    expect(result.cases[0].run?.steps[0].error?.message).toContain(diagnostic);
    expect(readLegacyOutput()).toEqual({
      assertion: {
        pass: false,
        thought: 'the success toast is missing',
        message: diagnostic,
      },
    });
    const outputDir = join(root, 'midscene_run', 'output');
    const summary = JSON.parse(
      readFileSync(
        join(
          outputDir,
          readdirSync(outputDir).find((file) =>
            /^summary-\d+\.json$/.test(file),
          )!,
        ),
        'utf8',
      ),
    );
    expect(summary.results[0].error).toContain(diagnostic);
  });
});
