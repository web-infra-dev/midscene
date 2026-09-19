import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { MidsceneYamlScript } from '@midscene/core';
import { WorkflowExecutionFailure } from '@midscene/core/internal/test-runner';
import type * as CoreYaml from '@midscene/core/yaml';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import { runTestProject } from '../src/cli/test-project-runner';

const require = createRequire(import.meta.url);
const { ScriptPlayer } = require('@midscene/core/yaml') as typeof CoreYaml;
const launcher = vi.hoisted(() => ({ createYamlAgent: vi.fn() }));
vi.mock('../src/runtime/create-yaml-player', () => ({
  createYamlAgent: launcher.createYamlAgent,
}));
vi.mock('../src/runtime/dotenv-loader', () => ({ loadDotenvConfig: vi.fn() }));

const actions = [
  {
    name: 'Launch',
    interfaceAlias: 'launch',
    paramSchema: z.object({ uri: z.string() }),
  },
  {
    name: 'Hover',
    interfaceAlias: 'customHover',
    paramSchema: z.object({ locate: z.object({ prompt: z.string() }) }),
  },
  {
    name: 'RunAdbShell',
    interfaceAlias: 'runAdbShell',
    paramSchema: z.object({ command: z.string() }),
  },
];
const createAgent = () => ({
  getActionSpace: vi.fn(async () => actions),
  callActionInActionSpace: vi.fn(async (name: string, _params: unknown) => {
    if (!actions.some((action) => action.name === name))
      throw new Error(`unknown action: ${name}`);
    return name === 'Launch' ? undefined : 'ready';
  }),
  runAdbShell: vi.fn(async () => 'ready'),
  evaluateJavaScript: vi.fn(async (code: string) => {
    if (code === 'fail') throw new Error('query failed');
    return (
      {
        first: 1,
        third: 3,
        other: 9,
        zero: 0,
        empty: '',
        null: null,
        false: false,
        true: true,
        answer: 42,
      } as Record<string, unknown>
    )[code];
  }),
  aiQuery: vi.fn(async () => {
    throw new Error('query failed');
  }),
});

let root: string;
let agents: ReturnType<typeof createAgent>[];
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'yaml-compat-regression-'));
  vi.stubEnv('MIDSCENE_RUN_DIR', join(root, 'midscene_run'));
  agents = [];
  launcher.createYamlAgent.mockReset();
  launcher.createYamlAgent.mockImplementation(async () => {
    const agent = createAgent();
    agents.push(agent);
    return { agent, freeFn: [] };
  });
});
afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(root, { recursive: true, force: true });
});
const write = (name: string, content: unknown) => {
  const path = join(root, name);
  writeFileSync(path, JSON.stringify(content));
  return path;
};
const readSummary = (name?: string) => {
  const outputDir = join(root, 'midscene_run', 'output');
  const summaryName =
    name ??
    readdirSync(outputDir).find((file) => /^summary-\d+\.json$/.test(file));
  const path = join(outputDir, summaryName!);
  return { path, data: JSON.parse(readFileSync(path, 'utf8')) };
};
const readOutput = (summaryPath: string, output: string) =>
  JSON.parse(readFileSync(resolve(dirname(summaryPath), output), 'utf8'));
const goldenPlayer = async (script: MidsceneYamlScript) => {
  const agent = createAgent();
  const player = new ScriptPlayer(script, async () => ({
    agent: agent as any,
    freeFn: [],
  }));
  await player.run();
  return { agent, player };
};

describe('old YAML behavior across the public Test entry and ScriptPlayer', () => {
  it('preserves actual-storage numbering, failed queries, falsy values and named overwrites', async () => {
    const script = {
      agent: { generateReport: false },
      tasks: [
        {
          name: 'first',
          flow: [
            { launch: 'com.example.app' },
            { javascript: 'zero' },
            { javascript: 'false', name: 'flag' },
            { javascript: 'empty' },
          ],
        },
        { name: 'query', continueOnError: true, flow: [{ aiQuery: 'fail' }] },
        {
          name: 'last',
          flow: [
            { javascript: 'null' },
            { javascript: 'true', name: 'flag' },
            { javascript: 'undefined' },
            { javascript: 'answer' },
          ],
        },
      ],
    } satisfies MidsceneYamlScript;
    const file = write('flow.yaml', script);
    const result = await runTestProject({ cwd: root, projectRoot: file });
    const summary = readSummary();
    const output = readOutput(summary.path, summary.data.results[0].output);
    expect(output).toEqual({ '0': 0, '1': '', '2': null, '4': 42, flag: true });
    const { player } = await goldenPlayer(script);
    expect(output).toEqual(JSON.parse(JSON.stringify(player.result)));
    expect(result).not.toHaveProperty('legacyResults');
    expect(result.collectionErrors).toEqual([]);
  });

  it('restarts anonymous numbering for each whole-document retry', async () => {
    write('flow.yaml', {
      agent: { generateReport: false },
      tasks: [
        {
          name: 'result',
          flow: [
            { launch: 'com.example.app' },
            { javascript: 'first' },
            { javascript: 'answer' },
          ],
        },
      ],
    });
    write('batch.yaml', {
      files: ['flow.yaml'],
      retry: 1,
      summary: 'old-summary.json',
    });
    const create = launcher.createYamlAgent.getMockImplementation()!;
    let failOnce = true;
    launcher.createYamlAgent.mockImplementation(async (...args) => {
      const created = await create(...args);
      const evaluate =
        created.agent.evaluateJavaScript.getMockImplementation()!;
      created.agent.evaluateJavaScript.mockImplementation(
        async (code: string) => {
          if (code === 'answer' && failOnce) {
            failOnce = false;
            throw new Error('retry');
          }
          return evaluate(code);
        },
      );
      return created;
    });
    const result = await runTestProject({
      cwd: root,
      configPath: 'batch.yaml',
    });
    expect(result.status).toBe('success');
    const summary = readSummary('old-summary.json');
    const attempts = summary.data.results[0].attempts;
    expect(attempts).toHaveLength(2);
    expect(readOutput(summary.path, attempts[0].output)).toEqual({ '0': 1 });
    expect(readOutput(summary.path, attempts[1].output)).toEqual({
      '0': 1,
      '1': 42,
    });
  });

  it.each([
    { invalid: 'sleep', continueOnError: false },
    { invalid: 'sleep', continueOnError: true },
    { invalid: 'missing flow', continueOnError: false },
    { invalid: 'missing flow', continueOnError: true },
    { invalid: 'empty step', continueOnError: false },
    { invalid: 'empty step', continueOnError: true },
  ])(
    'keeps $invalid at its task, with continuation=$continueOnError, in a retried batch',
    async ({ invalid, continueOnError }) => {
      const script = {
        agent: { generateReport: false },
        tasks: [
          { name: 'first', flow: [{ javascript: 'first' }] },
          {
            name: 'invalid',
            continueOnError,
            ...(invalid === 'sleep'
              ? { flow: [{ sleep: 0 }] }
              : invalid === 'empty step'
                ? { flow: [null] }
                : {}),
          },
          { name: 'third', flow: [{ javascript: 'third' }] },
        ],
      } as MidsceneYamlScript;
      write('invalid.yaml', script);
      write('other.yaml', {
        agent: { generateReport: false },
        tasks: [{ name: 'other', flow: [{ javascript: 'other' }] }],
      });
      write('batch.yaml', {
        files: ['invalid.yaml', 'other.yaml'],
        retry: 1,
        continueOnError: true,
        summary: 'old-summary.json',
      });
      const result = await runTestProject({
        cwd: root,
        configPath: 'batch.yaml',
      });
      expect(result.collectionErrors).toEqual([]);
      expect(
        agents.flatMap((agent) =>
          agent.evaluateJavaScript.mock.calls.map(([code]) => code),
        ),
      ).toEqual(
        continueOnError
          ? ['first', 'third', 'first', 'third', 'other']
          : ['first', 'first', 'other'],
      );
      const summary = readSummary('old-summary.json');
      expect(summary.data.results.map((item: any) => item.resultType)).toEqual([
        continueOnError ? 'partialFailed' : 'failed',
        'success',
      ]);
      expect(summary.data.results[0].attempts).toHaveLength(2);
      const { agent, player } = await goldenPlayer(script);
      expect(agent.evaluateJavaScript.mock.calls.map(([code]) => code)).toEqual(
        continueOnError ? ['first', 'third'] : ['first'],
      );
      expect(player.taskStatusList.map((task) => task.status)).toEqual([
        'done',
        'error',
        continueOnError ? 'done' : 'init',
      ]);
    },
  );

  it.each([
    { runAdbShell: 'echo ready', timeout: 50, name: 'shell' },
    { name: 'shell', timeout: 50, runAdbShell: 'echo ready' },
  ])('does not depend on helper/name field order: %j', async (flow) => {
    const script = {
      agent: { generateReport: false },
      tasks: [{ name: 'shell', flow: [flow] }],
    };
    const result = await runTestProject({
      cwd: root,
      projectRoot: write('shell.yaml', script),
    });
    expect(result.status).toBe('success');
    expect(agents[0].runAdbShell).toHaveBeenCalledWith('echo ready', {
      timeout: 50,
    });
    const { agent, player } = await goldenPlayer(script);
    expect(agents[0].runAdbShell.mock.calls).toEqual(
      agent.runAdbShell.mock.calls,
    );
    const summary = readSummary();
    expect(readOutput(summary.path, summary.data.results[0].output)).toEqual(
      player.result,
    );
  });

  it.each([
    { customHover: 'menu', deepLocate: true, name: 'hover' },
    { deepLocate: true, name: 'hover', customHover: 'menu' },
    { name: 'hover', deepLocate: true, customHover: 'menu' },
  ])(
    'resolves a custom alias against ActionSpace regardless of field order: %j',
    async (flow) => {
      const script = {
        agent: { generateReport: false },
        tasks: [{ name: 'hover', flow: [flow] }],
      } as MidsceneYamlScript;
      const result = await runTestProject({
        cwd: root,
        projectRoot: write('hover.yaml', script),
      });
      expect(result.status).toBe('success');
      expect(agents[0].callActionInActionSpace).toHaveBeenCalledWith('Hover', {
        locate: expect.objectContaining({
          prompt: 'menu',
          deepLocate: true,
          cacheable: true,
        }),
      });
      const { agent, player } = await goldenPlayer(script);
      expect(agents[0].callActionInActionSpace.mock.calls).toEqual(
        agent.callActionInActionSpace.mock.calls,
      );
      const summary = readSummary();
      expect(readOutput(summary.path, summary.data.results[0].output)).toEqual(
        player.result,
      );
    },
  );
});

describe('disabled report policy survives missing or failed artifacts', () => {
  it.each(['web', 'page', 'browser', 'target'])(
    'keeps a disabled batch %s report off when every document fails collection',
    async (target) => {
      write('invalid.yaml', { tasks: 'not-an-array' });
      write('batch.yaml', {
        files: ['invalid.yaml'],
        [target]: { generateReport: false },
        summary: 'old-summary.json',
      });
      const result = await runTestProject({
        cwd: root,
        configPath: 'batch.yaml',
      });
      expect(result.collectionErrors).toHaveLength(1);
      expect(result.reportPath).toBeUndefined();
      expect(launcher.createYamlAgent).not.toHaveBeenCalled();
      expect(
        readSummary('old-summary.json').data.results[0],
      ).not.toHaveProperty('report');
      expect(
        readdirSync(join(root, 'midscene_run')).filter(
          (entry) => entry === 'report',
        ),
      ).toEqual([]);
    },
  );

  it('keeps disabled file Agent reports off when every batch document fails collection', async () => {
    write('invalid.yaml', {
      agent: { generateReport: false },
      tasks: 'not-an-array',
    });
    write('batch.yaml', {
      files: ['invalid.yaml'],
      summary: 'old-summary.json',
    });
    const result = await runTestProject({
      cwd: root,
      configPath: 'batch.yaml',
    });
    expect(result.collectionErrors).toHaveLength(1);
    expect(result.reportPath).toBeUndefined();
    expect(launcher.createYamlAgent).not.toHaveBeenCalled();
    expect(readSummary('old-summary.json').data.results[0]).not.toHaveProperty(
      'report',
    );
  });

  it.each(['agent', 'web', 'page', 'browser', 'target'])(
    'retains the file %s report intent before legacy task validation fails',
    async (target) => {
      const file = write('invalid.yaml', {
        [target]: { generateReport: false },
        tasks: 'not-an-array',
      });
      const result = await runTestProject({ cwd: root, projectRoot: file });
      expect(result.collectionErrors).toHaveLength(1);
      expect(result.reportPath).toBeUndefined();
      expect(launcher.createYamlAgent).not.toHaveBeenCalled();
    },
  );

  it('retains a literal disabled file report when environment interpolation fails', async () => {
    vi.stubEnv('MIDSCENE_TEST_MISSING_REPORT_ENV', undefined);
    const file = join(root, 'invalid.yaml');
    writeFileSync(
      file,
      'agent:\n  generateReport: false\nweb:\n  url: ${MIDSCENE_TEST_MISSING_REPORT_ENV}\ntasks: []\n',
    );
    const result = await runTestProject({ cwd: root, projectRoot: file });
    expect(result.collectionErrors).toHaveLength(1);
    expect(result.reportPath).toBeUndefined();
    expect(launcher.createYamlAgent).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'uses the resolved environment report flag before task validation (enabled: %s)',
    async (enabled) => {
      vi.stubEnv('MIDSCENE_TEST_REPORT_ENABLED', String(enabled));
      const file = join(root, 'invalid.yaml');
      writeFileSync(
        file,
        'agent:\n  generateReport: ${MIDSCENE_TEST_REPORT_ENABLED}\ntasks: not-an-array\n',
      );
      const result = await runTestProject({ cwd: root, projectRoot: file });
      expect(result.collectionErrors).toHaveLength(1);
      expect(Boolean(result.reportPath)).toBe(enabled);
      expect(launcher.createYamlAgent).not.toHaveBeenCalled();
    },
  );

  it.each([
    { fileConfig: { web: { generateReport: false } }, enabled: true },
    { fileConfig: { agent: { generateReport: false } }, enabled: false },
  ])(
    'preserves file Agent priority and batch target overrides during collection failure (enabled: $enabled)',
    async ({ fileConfig, enabled }) => {
      write('invalid.yaml', { ...fileConfig, tasks: 'not-an-array' });
      write('batch.yaml', {
        files: ['invalid.yaml'],
        web: { generateReport: true },
        summary: 'old-summary.json',
      });
      const result = await runTestProject({
        cwd: root,
        configPath: 'batch.yaml',
      });
      expect(result.collectionErrors).toHaveLength(1);
      expect(Boolean(result.reportPath)).toBe(enabled);
      expect(launcher.createYamlAgent).not.toHaveBeenCalled();
    },
  );

  it('still creates the default native report when every native document fails collection', async () => {
    const file = write('native.yaml', { cases: 'not-an-array' });
    const result = await runTestProject({ cwd: root, projectRoot: file });
    expect(result.collectionErrors).toHaveLength(1);
    expect(result.reportPath).toBeDefined();
    expect(launcher.createYamlAgent).not.toHaveBeenCalled();
  });

  it('keeps a native collection-failure report in a mixed run with disabled legacy reports', async () => {
    write('legacy.yaml', {
      agent: { generateReport: false },
      tasks: [{ name: 'old case', flow: [] }],
    });
    write('native.yaml', { cases: 'not-an-array' });
    writeFileSync(
      join(root, 'midscene.config.ts'),
      'export default { nodes: [] };',
    );
    const result = await runTestProject({ cwd: root });
    expect(result.collectionErrors).toHaveLength(1);
    expect(result.reportPath).toBeDefined();
    expect(launcher.createYamlAgent).not.toHaveBeenCalled();
  });

  it.each([
    { phase: 'setup', target: 'agent' },
    { phase: 'execute', target: 'agent' },
    { phase: 'cleanup', target: 'agent' },
    { phase: 'setup', target: 'web' },
    { phase: 'execute', target: 'web' },
    { phase: 'cleanup', target: 'web' },
  ])(
    'does not publish a disabled $target report after $phase failure',
    async ({ phase, target }) => {
      write('enabled.yaml', {
        tasks: [{ name: 'good', flow: [{ javascript: 'first' }] }],
      });
      write('disabled.yaml', {
        [target]: { generateReport: false },
        tasks: [{ name: 'bad', flow: [{ javascript: 'fail' }] }],
      });
      write('batch.yaml', {
        files: ['enabled.yaml', 'disabled.yaml'],
        continueOnError: true,
        summary: 'old-summary.json',
      });
      const create = launcher.createYamlAgent.getMockImplementation()!;
      launcher.createYamlAgent.mockImplementation(
        async (file: string, ...args) => {
          if (file.endsWith('disabled.yaml') && phase === 'setup')
            throw new Error('setup failed');
          const created = await create(file, ...args);
          if (file.endsWith('disabled.yaml') && phase === 'cleanup') {
            created.agent.evaluateJavaScript.mockResolvedValue(1);
            created.freeFn.push({
              name: 'cleanup',
              fn: async () => {
                throw new Error('cleanup failed');
              },
            });
          }
          return created;
        },
      );
      const result = await runTestProject({
        cwd: root,
        configPath: 'batch.yaml',
      }).catch((error) => {
        expect(phase).toBe('cleanup');
        expect(error).toBeInstanceOf(WorkflowExecutionFailure);
        return error.result;
      });
      expect(result.reportPath).toBeDefined();
      const summary = readSummary('old-summary.json');
      const [good, bad] = summary.data.results;
      expect(resolve(dirname(summary.path), good.report)).toBe(
        result.reportPath,
      );
      expect(bad.success).toBe(false);
      expect(bad).not.toHaveProperty('report');
      expect(bad).not.toHaveProperty('retryReport');
      expect(bad.attempts).toHaveLength(1);
      expect(bad.attempts[0]).not.toHaveProperty('report');
    },
  );
});
