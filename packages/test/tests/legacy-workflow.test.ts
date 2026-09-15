import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { MidsceneYamlScript } from '@midscene/core';
import type * as CoreRuntime from '@midscene/core';
import type { WorkflowDocumentRunResult } from '@midscene/core/internal/test-runner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  adaptLegacyExecutionPlan,
  adaptLegacyWorkflow,
} from '../src/cli/legacy-adapter';
import { collectLegacyWorkflow } from '../src/cli/legacy-collector';
import { loadTestProject } from '../src/cli/test-project';
import * as projectLoader from '../src/cli/test-project';
import {
  type TestProjectRunOptions,
  runTestProject as runNativeTestProject,
  runTestProjectWithYamlCompatibility,
} from '../src/cli/test-project-runner';
import * as browserRuntime from '../src/runtime/legacy-browser';
import {
  type LegacyTestRunPlan,
  defaultLegacyConfig,
} from '../src/runtime/legacy-config';

// Tests explicitly exercise the dedicated compatibility host, not native config.
const runTestProject = ({
  legacyPlan,
  ...options
}: TestProjectRunOptions & { legacyPlan?: LegacyTestRunPlan }) =>
  legacyPlan
    ? runTestProjectWithYamlCompatibility(options, { plan: legacyPlan })
    : runNativeTestProject(options);

// Exercise the published Node runtime; Vite must not resolve browser-only WASM.
const require = createRequire(import.meta.url);
const { Agent, ReportGenerator } =
  require('@midscene/core') as typeof CoreRuntime;

const host = vi.hoisted(() => ({
  createYamlAgent: vi.fn(),
  loadDotenvConfig: vi.fn(),
}));
vi.mock('../src/runtime/create-yaml-player', () => ({
  createYamlAgent: host.createYamlAgent,
}));
vi.mock('../src/runtime/dotenv-loader', () => ({
  loadDotenvConfig: host.loadDotenvConfig,
}));
let root: string;
let calls: string[];
let failOnce: boolean;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'legacy-workflow-'));
  vi.stubEnv('MIDSCENE_RUN_DIR', join(root, 'midscene_run'));
  calls = [];
  failOnce = false;
  host.loadDotenvConfig.mockReset();
  host.createYamlAgent.mockReset();
  host.createYamlAgent.mockImplementation(
    async (file: string, script: MidsceneYamlScript) => {
      const reportPath = join(
        root,
        script.agent?.reportFileName ?? 'same-name.html',
      );
      const agent = new Agent(
        {
          interfaceType: 'puppeteer',
          actionSpace: () => [],
          destroy: async () => {},
        } as any,
        {
          generateReport: false,
          autoPrintReportMsg: false,
          modelConfig: {
            MIDSCENE_MODEL_NAME: 'test',
            MIDSCENE_MODEL_API_KEY: 'test',
          },
        },
      );
      (agent as any).reportGenerator = new ReportGenerator({
        reportPath,
        screenshotMode: 'inline',
        autoPrint: false,
      });
      vi.spyOn(agent, 'evaluateJavaScript').mockImplementation(async (code) => {
        calls.push(code);
        if (code === 'second' && failOnce) {
          failOnce = false;
          throw new Error('retry me');
        }
        return { value: code };
      });
      return {
        agent,
        freeFn: [{ name: 'agent', fn: () => agent.destroy() }],
      };
    },
  );
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});

const oldYaml =
  'web:\n  url: https://example.com\ntasks:\n  - name: old first\n    flow:\n      - javascript: first\n        name: answer\n  - name: old second\n    flow:\n      - javascript: second\n';
const write = (name: string, content: string) => {
  const file = join(root, name);
  writeFileSync(file, content);
  return file;
};

const deferred = () => {
  let resolve!: () => void;
  const promise = new Promise<void>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
};

describe('zero-config legacy format routing', () => {
  it('maps old batch scheduling fields to one standard Execution Project', () => {
    const setup = join(root, 'setup.yaml');
    const first = join(root, 'nested', 'first.yaml');
    const adapted = adaptLegacyExecutionPlan(
      {
        ...defaultLegacyConfig,
        files: [first, first],
        setup,
        concurrent: 3,
        retry: 2,
        summary: join(root, 'summary.json'),
        bail: 1,
      },
      root,
    );

    expect(adapted).toEqual({
      bail: 1,
      project: {
        name: 'legacy',
        files: {
          include: ['nested/first.yaml', 'nested/first.yaml'],
        },
        retry: 2,
      },
    });
  });

  it('adapts parsed tasks/flow into public document, case, and Node input without I/O', () => {
    const workflow = adaptLegacyWorkflow(
      {
        projectId: 'project-7',
        projectName: 'legacy',
        sourcePath: 'old.yaml',
        absolutePath: '/unused/old.yaml',
        invocationIndex: 2,
      },
      {
        tasks: [
          {
            name: 'old case',
            flow: [{ javascript: 'return 42', name: 'answer' }],
          },
        ],
      },
    );

    expect(workflow.document).toMatchObject({
      projectId: 'project-7',
      sourcePath: 'old.yaml',
      cases: [
        {
          projectId: 'project-7',
          caseIndex: 0,
          definition: {
            name: 'old case',
            steps: [
              {
                node: 'javascript',
                input: { script: 'return 42' },
                meta: { captureResult: true, resultName: 'answer' },
              },
            ],
          },
        },
      ],
    });
  });

  it('passes explicit setup resources to the shared legacy host', async () => {
    write('old.yaml', oldYaml);
    write(
      'midscene.config.ts',
      `export default {
      nodes: [],
      setup: { name: 'shared', setup() { return { headed: true }; } },
    };`,
    );
    const result = await runTestProjectWithYamlCompatibility(
      { projectRoot: root },
      {
        getPlayerOptions: (context) => ({
          headed: (context as { headed: boolean }).headed,
        }),
      },
    );
    expect(result.status).toBe('success');
    expect(host.createYamlAgent).toHaveBeenCalledWith(
      join(root, 'old.yaml'),
      expect.any(Object),
      { headed: true },
    );
  });

  it('loads legacy env before parsing inline mapping values', async () => {
    const file = write(
      'inline.yaml',
      'web: { url: ${LEGACY_INLINE_URL} }\ntasks:\n  - name: legacy\n    flow: [{ javascript: ${LEGACY_INLINE_CODE} }]\n',
    );
    host.loadDotenvConfig.mockImplementation(() => {
      vi.stubEnv('LEGACY_INLINE_URL', 'https://example.com');
      vi.stubEnv('LEGACY_INLINE_CODE', 'first');
    });
    const result = await runTestProject({ projectRoot: file, cwd: root });
    expect(host.loadDotenvConfig).toHaveBeenCalledWith({ cwd: root });
    expect(host.createYamlAgent).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ web: { url: 'https://example.com' } }),
      { headed: false, keepWindow: false },
    );
    expect(calls).toEqual(['first']);
    expect(result.status).toBe('success');
  });

  it('does not load legacy dotenv for native-only files', async () => {
    write('native.yaml', 'cases: [{ name: native, steps: [{ noop: hello }] }]');
    write(
      'midscene.config.ts',
      `export default { nodes: [{ name: 'noop', stringInputKey: 'prompt', execute() { return { data: 'native' }; } }] };`,
    );
    const result = await runTestProject({ projectRoot: root });
    expect(result.status).toBe('success');
    expect(host.loadDotenvConfig).not.toHaveBeenCalled();
    expect(host.createYamlAgent).not.toHaveBeenCalled();
  });

  it.each(['aiTap', 'aiScroll'])(
    'accepts old %s uiContext only through the YAML host',
    async (node) => {
      const action = vi.fn(async () => undefined);
      host.createYamlAgent.mockResolvedValue({
        agent: { [node]: action },
        freeFn: [],
      });
      const file = write(
        'locate.yaml',
        `agent: { generateReport: false }\ntasks:\n  - name: locate\n    flow:\n      - ${node}: target\n        uiContext: { fixture: true }\n`,
      );
      const result = await runTestProject({ projectRoot: file, cwd: root });
      expect(result.status).toBe('success');
      expect(action).toHaveBeenCalledWith(
        'target',
        expect.objectContaining({ uiContext: { fixture: true } }),
      );
    },
  );

  it('keeps an unchanged YAML report-disable intent inside the compatibility host', async () => {
    const file = write(
      'disabled.yaml',
      `agent: { generateReport: false, reportFileName: disabled }\n${oldYaml}`,
    );
    const result = await runTestProject({ projectRoot: file, cwd: root });
    expect(result.status).toBe('success');
    expect(result.reportPath).toBeUndefined();
    expect(result.legacyResults?.[0].report).toBeUndefined();
    expect(result.documents[0].reportPaths).toBeUndefined();
    expect(existsSync(join(root, 'disabled'))).toBe(false);
    expect(
      JSON.parse(readFileSync(result.legacyResults![0].output!, 'utf8')).answer,
    ).toEqual({ value: 'first' });
  });

  it('does not add a combined report link to disabled YAML in a mixed legacy batch', async () => {
    write('01-disabled.yaml', `agent: { generateReport: false }\n${oldYaml}`);
    write('02-enabled.yaml', oldYaml);
    const result = await runTestProject({ projectRoot: root, cwd: root });
    expect(result.status).toBe('success');
    expect(result.reportPath).toBeDefined();
    expect(result.legacyResults).toHaveLength(2);
    expect(result.legacyResults![0].report).toBeUndefined();
    expect(result.legacyResults![1].report).toBe(result.reportPath);
  });

  it('does not let disabled legacy reporting switch off a mixed native run', async () => {
    write('01-disabled.yaml', `agent: { generateReport: false }\n${oldYaml}`);
    write(
      '02-native.yaml',
      'cases: [{ name: native, steps: [{ noop: run }] }]',
    );
    write(
      'midscene.config.ts',
      `export default { nodes: [{ name: 'noop', stringInputKey: 'prompt', execute() {} }] };`,
    );
    const result = await runTestProject({ projectRoot: root, cwd: root });
    expect(result.status).toBe('success');
    expect(result.summary.passed).toBe(3);
    expect(result.reportPath).toBe(
      join(root, 'midscene_run/report', `midscene-e2e-${result.runId}.html`),
    );
    expect(existsSync(result.reportPath!)).toBe(true);
    expect(result.documents[0].reportPaths).toBeUndefined();
    expect(result.documents[0]).not.toHaveProperty('outputs');
  });

  it('runs a single unchanged YAML file without a test config or Node registration', async () => {
    const file = write('old.yaml', oldYaml);
    write(
      'not-selected.yaml',
      'cases: [{ name: other, steps: [{ unknown: nope }] }]',
    );
    const result = await runTestProject({ projectRoot: file });
    expect(result.status).toBe('success');
    expect(result.summary).toMatchObject({ total: 2, passed: 2, failed: 0 });
    expect(calls).toEqual(['first', 'second']);
    expect(host.createYamlAgent).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ web: { url: 'https://example.com' } }),
      { headed: false, keepWindow: false },
    );
    expect(result.documents[0]).not.toHaveProperty('outputs');
    expect(
      JSON.parse(readFileSync(result.legacyResults![0].output!, 'utf8')).answer,
    ).toEqual({ value: 'first' });
    expect(readFileSync(result.reportPath!, 'utf8')).toContain(
      'midscene_test_run_dump',
    );
    expect(existsSync(join(root, 'midscene.config.ts'))).toBe(false);
  });

  it('collects native and legacy files in the same directory through their own adapters', async () => {
    write('old.yaml', oldYaml);
    write('new.yaml', 'cases: [{ name: native, steps: [{ noop: hello }] }]');
    write(
      'midscene.config.ts',
      `export default { nodes: [{ name: 'noop', stringInputKey: 'prompt', execute() { return { data: 'native' }; } }] };`,
    );
    const result = await runTestProject({ projectRoot: root });
    expect(result.summary).toMatchObject({ total: 3, passed: 3 });
    expect(result.documents).toHaveLength(2);
    expect(host.createYamlAgent).toHaveBeenCalledTimes(1);
  });

  it('retries the whole legacy file, preserves each attempt and summarizes the final one', async () => {
    write('old.yaml', oldYaml);
    write(
      'midscene.config.ts',
      `export default { nodes: [], projects: [{ name: 'retry', retry: 1 }] };`,
    );
    failOnce = true;
    const result = await runTestProject({ projectRoot: root });
    expect(calls).toEqual(['first', 'second', 'first', 'second']);
    expect(result.status).toBe('success');
    expect(result.summary).toMatchObject({
      total: 2,
      passed: 2,
      failed: 0,
      documentFailures: 0,
    });
    expect(result.documents.map((item) => item.attemptIndex)).toEqual([0, 1]);
    expect(result.cases).toHaveLength(4);
    const summary = JSON.parse(readFileSync(result.summaryPath, 'utf8'));
    const facts = summary.projects[0].documents.map(
      (item: { resultFile: string }) => item.resultFile,
    );
    expect(new Set(facts).size).toBe(2);
    for (const fact of facts)
      expect(existsSync(join(dirname(result.summaryPath), fact))).toBe(true);
    const sources = result.documents.flatMap(
      (item) =>
        (item as WorkflowDocumentRunResult).reportSources?.map(
          (source) => source.dumpPath,
        ) ?? [],
    );
    expect(new Set(sources).size).toBe(2);
    for (const source of sources) expect(existsSync(source)).toBe(true);
    expect(result.documents).toHaveLength(2);
  });

  it('rejects ambiguous mixed syntax before creating any Agent', async () => {
    write('mixed.yaml', `${oldYaml}\ncases: []\n`);
    const result = await runTestProject({ projectRoot: root });
    expect(result.status).toBe('failed');
    expect(result.collectionErrors[0].error.message).toContain('cannot mix');
    expect(host.createYamlAgent).not.toHaveBeenCalled();
  });
});

describe('legacy batch plans on the Test scheduler', () => {
  const plan = (
    files: string[],
    overrides: Partial<LegacyTestRunPlan> = {},
  ): LegacyTestRunPlan => ({
    ...defaultLegacyConfig,
    files,
    summary: join(root, 'legacy-summary.json'),
    bail: 1,
    ...overrides,
  });
  const script = (name: string) => `web:
  url: https://example.com
  output: ${join(root, `${name}.json`)}
agent:
  reportFileName: ${name}.html
tasks:
  - name: ${name}
    flow:
      - javascript: ${name}
`;

  it('preserves repeated file occurrences and input order in execution and summary', async () => {
    const a = write('a.yaml', script('first'));
    const b = write('b.yaml', script('third'));
    const result = await runTestProject({
      cwd: root,
      legacyPlan: plan([b, a, b]),
    });
    expect(calls).toEqual(['third', 'first', 'third']);
    expect(result.projects).toHaveLength(1);
    expect(new Set(result.cases.map((item) => item.caseId)).size).toBe(3);
    const summary = JSON.parse(
      readFileSync(join(root, 'legacy-summary.json'), 'utf8'),
    );
    expect(summary.summary).toMatchObject({
      total: 3,
      successful: 3,
      failed: 0,
    });
    expect(summary.results.map((item: any) => item.script)).toEqual([
      'b.yaml',
      'a.yaml',
      'b.yaml',
    ]);
    expect(
      summary.results.every((item: any) => item.attempts.length === 1),
    ).toBe(true);
  });

  it('uses old fail-stop defaults for an unchanged directory and ignores hidden configuration YAML', async () => {
    write('a.yaml', script('second'));
    write('b.yaml', script('third'));
    mkdirSync(join(root, '.github'));
    write('.github/ci.yaml', 'jobs: {build: true}');
    failOnce = true;
    const result = await runTestProject({ cwd: root });
    expect(calls).toEqual(['second']);
    expect(result.summary).toMatchObject({
      total: 2,
      failed: 1,
      notRun: 1,
      collectionErrors: 0,
    });
    expect(result.cases[1]).toMatchObject({
      status: 'not-run',
      notRunReason: 'bail',
    });
  });

  it('runs independent legacy files concurrently within one Project', async () => {
    const a = write('a.yaml', script('first'));
    const b = write('b.yaml', script('third'));
    const gate = deferred();
    let active = 0;
    let maximum = 0;
    const create = host.createYamlAgent.getMockImplementation()!;
    host.createYamlAgent.mockImplementation(async (...args) => {
      active++;
      maximum = Math.max(maximum, active);
      try {
        await gate.promise;
        return await create(...args);
      } finally {
        active--;
      }
    });
    const pending = runTestProject({
      cwd: root,
      legacyPlan: plan([a, b], { concurrent: 2 }),
    });
    try {
      await vi.waitFor(() => expect(active).toBe(2));
    } finally {
      gate.resolve();
    }
    expect((await pending).status).toBe('success');
    expect(maximum).toBe(2);
  });

  it('uses the common document retry boundary for legacy files', async () => {
    const file = write('retry.yaml', script('second'));
    failOnce = true;
    const result = await runTestProject({
      cwd: root,
      legacyPlan: plan([file], { retry: 1 }),
    });
    expect(result.status).toBe('success');
    expect(calls).toEqual(['second', 'second']);
    expect(result.documents.map((item) => item.attemptIndex)).toEqual([0, 1]);
    expect(result.reportPath).toBeDefined();
    expect(result.legacyResults?.[0].report).toBe(result.reportPath);
    expect(
      result.legacyResults?.[0].attempts?.map((attempt) => attempt.report),
    ).toEqual([result.reportPath, result.reportPath]);
    expect(result.legacyResults?.[0].retryReport).toBe(result.reportPath);

    const summary = JSON.parse(
      readFileSync(join(root, 'legacy-summary.json'), 'utf8'),
    );
    expect(summary.results[0].report).toBe(summary.results[0].retryReport);
    expect(
      summary.results[0].attempts.every(
        (attempt: { report: string }) =>
          attempt.report === summary.results[0].report,
      ),
    ).toBe(true);
    expect(
      readFileSync(
        join(
          dirname(join(root, 'legacy-summary.json')),
          summary.results[0].report,
        ),
        'utf8',
      ),
    ).toContain('midscene_test_run_dump');
  });

  it('retries setup in a fresh shared browser context before starting main files', async () => {
    const setup = write('setup.yaml', script('second'));
    const main = write('main.yaml', script('third'));
    failOnce = true;
    const options: any = { browser: {}, browserContext: { id: 0 } };
    const reset = vi.fn(async () => {
      options.browserContext = { id: 1 };
    });
    const close = vi.fn(async () => {});
    vi.spyOn(browserRuntime, 'createYamlBatchBrowser').mockResolvedValue({
      options,
      reset,
      close,
    });
    const result = await runTestProject({
      cwd: root,
      legacyPlan: plan([main], { setup, retry: 1, shareBrowserContext: true }),
    });
    expect(result.status).toBe('success');
    expect(calls).toEqual(['second', 'second', 'third']);
    expect(reset).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(
      host.createYamlAgent.mock.calls.map((call) => call[2]?.browserContext.id),
    ).toEqual([0, 1, 1]);
    expect(result.projects).toHaveLength(1);
    expect(result.documents.map((document) => document.sourcePath)).toEqual([
      'setup.yaml',
      'setup.yaml',
      'main.yaml',
    ]);
  });

  it('stops main files after failed setup even with continueOnError enabled', async () => {
    const setup = write(
      'setup.yaml',
      script('second').replace('web:', 'interface:'),
    );
    const main = write('main.yaml', script('third'));
    failOnce = true;
    const result = await runTestProject({
      cwd: root,
      legacyPlan: plan([main], { setup, continueOnError: true, bail: 0 }),
    });
    expect(calls).toEqual(['second']);
    expect(result.cases[1]).toMatchObject({
      status: 'not-run',
      notRunReason: 'project-setup-failed',
    });
    expect(result.exitCode).toBe(1);
  });

  it('applies global target options and keeps partialFailed distinct in the legacy summary', async () => {
    const a = write(
      'a.yaml',
      script('second').replace(
        'name: second',
        'name: second\n    continueOnError: true',
      ),
    );
    const b = write('b.yaml', script('third'));
    failOnce = true;
    const result = await runTestProject({
      cwd: root,
      legacyPlan: plan([a, b], {
        continueOnError: true,
        bail: 0,
        headed: true,
        globalConfig: {
          web: { url: 'https://global.example', viewportWidth: 800 },
        },
      }),
    });
    expect(calls).toEqual(['second', 'third']);
    expect(host.createYamlAgent.mock.calls[0][1].web).toMatchObject({
      url: 'https://global.example',
      viewportWidth: 800,
    });
    expect(host.createYamlAgent.mock.calls[0][2]).toMatchObject({
      headed: true,
    });
    const summary = JSON.parse(
      readFileSync(join(root, 'legacy-summary.json'), 'utf8'),
    );
    expect(summary.summary).toMatchObject({
      partialFailed: 1,
      successful: 1,
      failed: 0,
    });
    expect(result.exitCode).toBe(1);
  });

  it('rejects native files in a legacy batch before executing any file', async () => {
    const a = write('a.yaml', script('first'));
    const b = write('b.yaml', 'cases: [{name: native, steps: []}]');
    const result = await runTestProject({
      cwd: root,
      legacyPlan: plan([a, b]),
    });
    expect(result.exitCode).toBe(1);
    expect(result.summary.collectionErrors).toBe(1);
    expect(host.createYamlAgent).not.toHaveBeenCalled();
  });
});
