import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  type FrameworkRstestProject,
  runMidsceneSuite,
} from '../../src/runner';
import { createSuiteRuntime } from '../../src/runtime';
import type { FrameworkCaseResult } from '../../src/types';

const createProject = (configBody: string): string => {
  const root = mkdtempSync(join(tmpdir(), 'midscene-framework-runner-'));
  writeFileSync(join(root, 'midscene.config.ts'), configBody);
  const e2e = join(root, 'e2e');
  mkdirSync(e2e, { recursive: true });
  writeFileSync(join(e2e, 'a.yaml'), 'flow:\n  - aiAct: do a\n');
  writeFileSync(join(e2e, 'b.yaml'), 'flow:\n  - aiAct: do b\n');
  return root;
};

// Emulate Rstest by writing a success result file for every generated case.
const passingRunner = (project: FrameworkRstestProject) => {
  const source =
    project.virtualModules['virtual:midscene-framework/suite.test.ts'];
  const regex = /runCase\((".*?"),\s*(".*?")\)/g;
  let match: RegExpExecArray | null;
  // biome-ignore lint/suspicious/noAssignInExpressions: test parsing loop
  while ((match = regex.exec(source)) !== null) {
    const filePath = JSON.parse(match[1]);
    const resultFile = JSON.parse(match[2]);
    const result: FrameworkCaseResult = {
      file: filePath,
      testName: filePath,
      success: true,
      duration: 5,
    };
    mkdirSync(join(resultFile, '..'), { recursive: true });
    writeFileSync(resultFile, JSON.stringify(result));
  }
  return Promise.resolve({ ok: true });
};

describe('runMidsceneSuite', () => {
  it('maps each yaml case to one Rstest test and passes testRunner options', async () => {
    const root = createProject(
      `export default {\n  testDir: './e2e',\n  include: ['**/*.yaml'],\n  testRunner: { maxConcurrency: 3, bail: 1, testTimeout: 4242, retry: 2 },\n};\n`,
    );
    const rstestRunner = vi.fn(passingRunner);

    const summary = await runMidsceneSuite({
      configPath: join(root, 'midscene.config.ts'),
      outputDir: join(root, '.out'),
      rstestRunner,
    });

    expect(rstestRunner).toHaveBeenCalledTimes(1);
    const project = rstestRunner.mock.calls[0][0] as FrameworkRstestProject;
    expect(project.root).toBe(root);
    expect(project.include).toEqual([
      'virtual:midscene-framework/suite.test.ts',
    ]);
    expect(project.maxConcurrency).toBe(3);
    expect(project.bail).toBe(1);
    expect(project.testTimeout).toBe(4242);
    expect(project.retry).toBe(2);

    const source =
      project.virtualModules['virtual:midscene-framework/suite.test.ts'];
    expect(source).toContain('beforeAll');
    expect(source).toContain('afterAll');
    expect((source.match(/test\(/g) || []).length).toBe(2);
    expect(source).toContain('e2e/a.yaml');
    expect(source).toContain('e2e/b.yaml');

    expect(summary).toMatchObject({ total: 2, passed: 2, failed: 0 });
  });

  it('writes the summary file to output.summary', async () => {
    const root = createProject(
      `export default {\n  testDir: './e2e',\n  include: ['**/*.yaml'],\n  output: { summary: './midscene_run/output/summary.json' },\n};\n`,
    );
    await runMidsceneSuite({
      configPath: join(root, 'midscene.config.ts'),
      outputDir: join(root, '.out'),
      rstestRunner: passingRunner,
    });

    const summaryPath = join(root, 'midscene_run', 'output', 'summary.json');
    expect(existsSync(summaryPath)).toBe(true);
    const written = JSON.parse(readFileSync(summaryPath, 'utf8'));
    expect(written.total).toBe(2);
    expect(written.passed).toBe(2);
  });

  it('reports cases that produced no result as failed', async () => {
    const root = createProject(
      `export default {\n  testDir: './e2e',\n  include: ['**/*.yaml'],\n};\n`,
    );
    const summary = await runMidsceneSuite({
      configPath: join(root, 'midscene.config.ts'),
      outputDir: join(root, '.out'),
      rstestRunner: async () => ({ ok: false }),
    });
    expect(summary.failed).toBe(2);
    expect(summary.passed).toBe(0);
  });

  it('includes discovered .test.ts files alongside the yaml suite', async () => {
    const root = createProject(
      `export default {\n  testDir: './e2e',\n  include: ['**/*.yaml', '**/*.test.ts'],\n};\n`,
    );
    writeFileSync(join(root, 'e2e', 'extra.test.ts'), 'export {};\n');
    const rstestRunner = vi.fn(passingRunner);
    await runMidsceneSuite({
      configPath: join(root, 'midscene.config.ts'),
      outputDir: join(root, '.out'),
      rstestRunner,
    });
    const project = rstestRunner.mock.calls[0][0] as FrameworkRstestProject;
    expect(project.include).toContain(
      'virtual:midscene-framework/suite.test.ts',
    );
    expect(project.include.some((id) => id.endsWith('extra.test.ts'))).toBe(
      true,
    );
  });
});

describe('FrameworkSuiteRuntime.runCase', () => {
  it('runs a case against the suite agent and writes a result file', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-framework-case-'));
    const e2e = join(root, 'e2e');
    mkdirSync(e2e, { recursive: true });
    const yamlFile = join(e2e, 'case.yaml');
    writeFileSync(yamlFile, 'flow:\n  - aiAct: do it\n');
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
    await runtime.runCase(yamlFile, resultFile);
    await runtime.teardown();

    expect(agent.runYaml).toHaveBeenCalledTimes(1);
    const result = JSON.parse(readFileSync(resultFile, 'utf8'));
    expect(result.success).toBe(true);
    expect(result.testName).toBe('e2e/case.yaml');
  });

  it('writes a failed result and rethrows when a case fails', async () => {
    const root = mkdtempSync(join(tmpdir(), 'midscene-framework-case-fail-'));
    const e2e = join(root, 'e2e');
    mkdirSync(e2e, { recursive: true });
    const yamlFile = join(e2e, 'case.yaml');
    writeFileSync(yamlFile, 'flow:\n  - aiAct: do it\n');
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
    await expect(runtime.runCase(yamlFile, resultFile)).rejects.toThrow('boom');
    const result = JSON.parse(readFileSync(resultFile, 'utf8'));
    expect(result.success).toBe(false);
    expect(result.error).toContain('boom');
  });
});
