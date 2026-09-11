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
import type * as YamlRuntime from '@midscene/core/yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { collectLegacyWorkflow } from '../src/cli/legacy-workflow';
import { loadTestProject } from '../src/cli/test-project';
import * as projectLoader from '../src/cli/test-project';
import { runTestProject } from '../src/cli/test-project-runner';
import * as browserRuntime from '../src/runtime/legacy-browser';
import {
  type LegacyTestRunPlan,
  defaultLegacyConfig,
} from '../src/runtime/legacy-config';

// Exercise the published Node runtime; Vite must not resolve browser-only WASM.
const require = createRequire(import.meta.url);
const { Agent, ReportGenerator } =
  require('@midscene/core') as typeof CoreRuntime;
const { ScriptPlayer } = require('@midscene/core/yaml') as typeof YamlRuntime;

const host = vi.hoisted(() => ({
  createYamlPlayer: vi.fn(),
  loadDotenvConfig: vi.fn(),
}));
vi.mock('../src/runtime/create-yaml-player', () => ({
  createYamlPlayer: host.createYamlPlayer,
}));
vi.mock('../src/runtime/dotenv-loader', () => ({
  loadDotenvConfig: host.loadDotenvConfig,
}));
let root: string;
let calls: string[];
let failOnce: boolean;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'legacy-workflow-'));
  calls = [];
  failOnce = false;
  host.loadDotenvConfig.mockReset();
  host.createYamlPlayer.mockReset();
  host.createYamlPlayer.mockImplementation(
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
      const player = new ScriptPlayer(
        script,
        async () => ({
          agent,
          freeFn: [{ name: 'agent', fn: () => agent.destroy() }],
        }),
        undefined,
        file,
      );
      player.output = join(
        root,
        script.web?.output ?? script.config?.output ?? 'old-output.json',
      );
      player.reportFile = reportPath;
      return player;
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
  it('passes explicit setup resources to the shared legacy host', async () => {
    write('old.yaml', oldYaml);
    write(
      'midscene.config.ts',
      `export default {
      nodes: [],
      setup: { name: 'shared', setup() { return { headed: true }; } },
      legacy: { getOptions(context) { return { headed: context.headed }; } },
    };`,
    );
    const result = await runTestProject({ projectRoot: root });
    expect(result.status).toBe('success');
    expect(host.createYamlPlayer).toHaveBeenCalledWith(
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
    expect(host.createYamlPlayer).toHaveBeenCalledWith(
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
    expect(host.createYamlPlayer).not.toHaveBeenCalled();
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
    expect(host.createYamlPlayer).toHaveBeenCalledWith(
      file,
      expect.objectContaining({ web: { url: 'https://example.com' } }),
      { headed: false, keepWindow: false },
    );
    expect(
      JSON.parse(readFileSync(join(root, 'old-output.json'), 'utf8')).answer,
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
    expect(host.createYamlPlayer).toHaveBeenCalledTimes(1);
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
      (item) => item.reportSources?.map((source) => source.dumpPath) ?? [],
    );
    expect(new Set(sources).size).toBe(2);
    for (const source of sources) expect(existsSync(source)).toBe(true);
    expect(
      readdirSync(
        join(
          dirname(result.summaryPath),
          result.projects[0].projectId,
          'execution-records',
        ),
      ),
    ).toHaveLength(2);
  });

  it('rejects ambiguous mixed syntax before creating any Agent', async () => {
    write('mixed.yaml', `${oldYaml}\ncases: []\n`);
    const result = await runTestProject({ projectRoot: root });
    expect(result.status).toBe('failed');
    expect(result.collectionErrors[0].error.message).toContain('cannot mix');
    expect(host.createYamlPlayer).not.toHaveBeenCalled();
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
  output: ${name}.json
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
      summary.results.every(
        (item: any) => item.executionRecord && item.attempts.length === 1,
      ),
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
    const create = host.createYamlPlayer.getMockImplementation()!;
    host.createYamlPlayer.mockImplementation(async (...args) => {
      const player = await create(...args);
      const run = player.run.bind(player);
      player.run = async (...runArgs: any[]) => {
        active++;
        maximum = Math.max(maximum, active);
        try {
          await gate.promise;
          return await run(...runArgs);
        } finally {
          active--;
        }
      };
      return player;
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

  it.each([true, false])(
    'keeps in-flight file retries after batch bail only in legacy mode (%s)',
    async (legacyBatch) => {
      const a = write('a.yaml', script('second'));
      const b = write(
        'b.yaml',
        script('broken').replace('javascript: broken', 'unknownAction: true'),
      );
      const c = write('c.yaml', script('later'));
      const configPath = legacyBatch
        ? undefined
        : write(
            'midscene.config.ts',
            `export default {
              nodes: [], test: {maxConcurrency: 2, bail: 1},
              projects: ${JSON.stringify(
                ['a', 'b', 'c'].map((name) => ({
                  name,
                  retry: 1,
                  files: { include: [`${name}.yaml`] },
                })),
              )}
            };`,
          );
      const slowStarted = deferred();
      const fastFinished = deferred();
      const definition = await loadTestProject(configPath);
      vi.spyOn(projectLoader, 'loadTestProject').mockResolvedValue({
        ...definition,
        projects: definition.projects.map((project) => ({
          ...project,
          setup: {
            name: 'coordinate-file-completion',
            async setup(ctx: any) {
              if (!legacyBatch && ctx.project.projectId === 'project-1') {
                await slowStarted.promise;
                // Teardown follows the final failure count update, so A sees
                // bail deterministically without depending on a timer race.
                ctx.onTeardown(() => fastFinished.resolve());
              }
            },
            async onDocumentResult(document: any) {
              if (
                legacyBatch &&
                document.sourcePath === 'b.yaml' &&
                document.attemptIndex === 1
              ) {
                // Let the scheduler consume B's final result before releasing A.
                setTimeout(() => fastFinished.resolve(), 0);
              }
            },
          },
        })),
      });
      const create = host.createYamlPlayer.getMockImplementation()!;
      host.createYamlPlayer.mockImplementation(async (...args) => {
        if (args[0] === b) await slowStarted.promise;
        const player = await create(...args);
        if (args[0] === a) {
          const run = player.run.bind(player);
          player.run = async (...runArgs: any[]) => {
            slowStarted.resolve();
            await fastFinished.promise;
            return run(...runArgs);
          };
        }
        return player;
      });
      failOnce = true;
      const result = await runTestProject({
        cwd: root,
        ...(legacyBatch
          ? { legacyPlan: plan([a, b, c], { concurrent: 2, retry: 1 }) }
          : { configPath }),
      });
      expect(result.status).toBe('failed');
      const records = result.projects.flatMap(
        (project) => project.executionRecords ?? [],
      );
      expect(
        records.filter((record) => record.sourcePath === 'a.yaml'),
      ).toHaveLength(legacyBatch ? 2 : 1);
      expect(
        records.filter((record) => record.sourcePath === 'b.yaml'),
      ).toHaveLength(2);
      expect(
        records.filter((record) => record.sourcePath === 'c.yaml'),
      ).toHaveLength(0);
      expect(
        result.cases.find((item) => item.sourcePath === 'c.yaml'),
      ).toMatchObject({ status: 'not-run', notRunReason: 'bail' });
      expect(calls).toEqual(legacyBatch ? ['second', 'second'] : ['second']);
    },
  );

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
      host.createYamlPlayer.mock.calls.map(
        (call) => call[2]?.browserContext.id,
      ),
    ).toEqual([0, 1, 1]);
    expect(result.projects).toHaveLength(1);
    expect(
      result.projects[0].executionRecords?.map((record) => record.sourcePath),
    ).toEqual(['setup.yaml', 'setup.yaml', 'main.yaml']);
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
    expect(host.createYamlPlayer.mock.calls[0][1].web).toMatchObject({
      url: 'https://global.example',
      viewportWidth: 800,
    });
    expect(host.createYamlPlayer.mock.calls[0][2]).toMatchObject({
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
    expect(host.createYamlPlayer).not.toHaveBeenCalled();
  });
});
