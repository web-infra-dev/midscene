import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  type RstestTestApi,
  createSuiteRuntime,
  defineMidsceneCaseTest,
  registerMidsceneSuite,
} from '../../src/runtime';
import type { MidsceneFrameworkConfig } from '../../src/types';

const ENV_RESULT_DIR = 'MIDSCENE_FRAMEWORK_RESULT_DIR';

afterEach(() => {
  delete process.env[ENV_RESULT_DIR];
});

interface RegisteredTest {
  name: string;
  fn: () => Promise<void> | void;
  options?: { timeout?: number; retry?: number };
}

const createFakeRstest = () => {
  const beforeAlls: Array<() => Promise<void> | void> = [];
  const afterAlls: Array<() => Promise<void> | void> = [];
  const tests: RegisteredTest[] = [];

  const api: RstestTestApi = {
    beforeAll: (fn) => beforeAlls.push(fn),
    afterAll: (fn) => afterAlls.push(fn),
    test: (name, fn, options) => tests.push({ name, fn, options }),
  };

  const run = async () => {
    for (const hook of beforeAlls) await hook();
    const outcomes: Array<{ name: string; ok: boolean; error?: unknown }> = [];
    for (const test of tests) {
      try {
        await test.fn();
        outcomes.push({ name: test.name, ok: true });
      } catch (error) {
        outcomes.push({ name: test.name, ok: false, error });
      }
    }
    for (const hook of afterAlls) await hook();
    return outcomes;
  };

  return { api, tests, beforeAlls, afterAlls, run };
};

const makeProject = (yamlByName: Record<string, string>): string => {
  const root = mkdtempSync(join(tmpdir(), 'midscene-runtime-'));
  const e2e = join(root, 'e2e');
  mkdirSync(e2e, { recursive: true });
  for (const [name, body] of Object.entries(yamlByName)) {
    writeFileSync(join(e2e, name), body);
  }
  return root;
};

describe('FrameworkSuiteRuntime.runCase', () => {
  it('runs a case and returns a success result without throwing', async () => {
    const root = makeProject({ 'case.yaml': 'flow:\n  - aiAct: do it\n' });
    const resultFile = join(root, 'result.json');
    const agent = { runYaml: vi.fn(async () => ({ result: {} })) };
    const runtime = createSuiteRuntime({
      config: {
        testDir: './e2e',
        include: ['**/*.yaml'],
        setup: async () => ({ agent }),
      },
      projectDir: root,
    });

    await runtime.setup();
    const result = await runtime.runCase(
      join(root, 'e2e/case.yaml'),
      resultFile,
    );
    await runtime.teardown();

    expect(result.success).toBe(true);
    expect(result.testName).toBe('e2e/case.yaml');
    expect(agent.runYaml).toHaveBeenCalledTimes(1);
    expect(JSON.parse(readFileSync(resultFile, 'utf8')).success).toBe(true);
  });

  it('returns a failed result (no throw) when a case fails', async () => {
    const root = makeProject({ 'case.yaml': 'flow:\n  - aiAct: do it\n' });
    const resultFile = join(root, 'result.json');
    const agent = {
      runYaml: vi.fn(async () => {
        throw new Error('boom');
      }),
    };
    const runtime = createSuiteRuntime({
      config: {
        testDir: './e2e',
        include: ['**/*.yaml'],
        setup: async () => ({ agent }),
      },
      projectDir: root,
    });
    await runtime.setup();
    const result = await runtime.runCase(
      join(root, 'e2e/case.yaml'),
      resultFile,
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');
    expect(JSON.parse(readFileSync(resultFile, 'utf8')).error).toContain(
      'boom',
    );
  });
});

describe('registerMidsceneSuite', () => {
  const baseConfig = (
    agent: { runYaml: ReturnType<typeof vi.fn> },
    teardown: ReturnType<typeof vi.fn>,
    extra?: Partial<MidsceneFrameworkConfig>,
  ): MidsceneFrameworkConfig => ({
    testDir: './e2e',
    include: ['**/*.yaml'],
    env: { enabled: false },
    setup: async () => ({ agent, teardown }),
    ...extra,
  });

  it('discovers yaml cases, shares one agent, and writes per-case results + summary', async () => {
    const root = makeProject({
      'a.yaml': 'flow:\n  - aiAct: do a\n',
      'b.yaml': 'flow:\n  - aiAct: do b\n',
    });
    const resultDir = join(root, 'results');
    const agent = { runYaml: vi.fn(async () => ({})) };
    const teardown = vi.fn(async () => {});
    const { api, tests, run } = createFakeRstest();

    await registerMidsceneSuite({
      config: baseConfig(agent, teardown, {
        output: { summary: './midscene_run/summary.json' },
        testRunner: { testTimeout: 4242, retry: 2 },
      }),
      projectDir: root,
      rstest: api,
      resultDir,
    });

    expect(tests.map((t) => t.name)).toEqual(['e2e/a.yaml', 'e2e/b.yaml']);
    expect(tests[0].options).toEqual({ timeout: 4242, retry: 2 });

    await run();

    expect(agent.runYaml).toHaveBeenCalledTimes(2);
    expect(teardown).toHaveBeenCalledTimes(1);
    expect(existsSync(join(resultDir, '001-e2e-a.json'))).toBe(true);
    expect(existsSync(join(resultDir, '002-e2e-b.json'))).toBe(true);

    const summary = JSON.parse(
      readFileSync(join(root, 'midscene_run', 'summary.json'), 'utf8'),
    );
    expect(summary).toMatchObject({ total: 2, passed: 2, failed: 0 });
  });

  it('throws inside the test when a case fails but still records it in the summary', async () => {
    const root = makeProject({ 'a.yaml': 'flow:\n  - aiAct: do a\n' });
    const agent = {
      runYaml: vi.fn(async () => {
        throw new Error('kaboom');
      }),
    };
    const teardown = vi.fn(async () => {});
    const { api, run } = createFakeRstest();

    await registerMidsceneSuite({
      config: baseConfig(agent, teardown, {
        output: { summary: './summary.json' },
      }),
      projectDir: root,
      rstest: api,
      resultDir: join(root, 'results'),
    });

    const outcomes = await run();
    expect(outcomes[0].ok).toBe(false);

    const summary = JSON.parse(
      readFileSync(join(root, 'summary.json'), 'utf8'),
    );
    expect(summary).toMatchObject({ total: 1, passed: 0, failed: 1 });
  });

  it('counts a retried case once in the summary (overwrites the failed attempt)', async () => {
    const root = makeProject({ 'a.yaml': 'flow:\n  - aiAct: do a\n' });
    let attempt = 0;
    const agent = {
      runYaml: vi.fn(async () => {
        attempt += 1;
        if (attempt === 1) throw new Error('flaky');
      }),
    };
    const { api, tests, beforeAlls, afterAlls } = createFakeRstest();

    await registerMidsceneSuite({
      config: baseConfig(agent, vi.fn(), {
        output: { summary: './summary.json' },
        testRunner: { retry: 1 },
      }),
      projectDir: root,
      rstest: api,
      resultDir: join(root, 'results'),
    });

    for (const hook of beforeAlls) await hook();
    // Simulate Rstest retry: first attempt throws, second succeeds.
    await expect(tests[0].fn()).rejects.toThrow('flaky');
    await tests[0].fn();
    for (const hook of afterAlls) await hook();

    const summary = JSON.parse(
      readFileSync(join(root, 'summary.json'), 'utf8'),
    );
    expect(summary).toMatchObject({ total: 1, passed: 1, failed: 0 });
  });

  it('omits per-test options when testRunner has no timeout/retry', async () => {
    const root = makeProject({ 'a.yaml': 'flow:\n  - aiAct: do a\n' });
    const { api, tests } = createFakeRstest();
    await registerMidsceneSuite({
      config: baseConfig({ runYaml: vi.fn(async () => ({})) }, vi.fn(), {}),
      projectDir: root,
      rstest: api,
    });
    expect(tests[0].options).toBeUndefined();
  });
});

describe('defineMidsceneCaseTest', () => {
  it('registers one test with its own setup/teardown lifecycle', async () => {
    const root = makeProject({ 'a.yaml': 'flow:\n  - aiAct: do a\n' });
    const agent = { runYaml: vi.fn(async () => ({})) };
    const teardown = vi.fn(async () => {});
    const { api, tests, run } = createFakeRstest();

    defineMidsceneCaseTest({
      config: {
        testDir: './e2e',
        include: ['**/*.yaml'],
        env: { enabled: false },
        setup: async () => ({ agent, teardown }),
      },
      projectDir: root,
      yamlFile: join(root, 'e2e/a.yaml'),
      rstest: api,
    });

    expect(tests).toHaveLength(1);
    expect(tests[0].name).toBe('e2e/a.yaml');

    await run();
    expect(agent.runYaml).toHaveBeenCalledTimes(1);
    expect(teardown).toHaveBeenCalledTimes(1);
  });
});
