import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { TestRunReportDump } from '@midscene/core';
import { WorkflowExecutionFailure } from '@midscene/core/internal/test-runner';
import { afterEach, describe, expect, it } from 'vitest';
import { validateTestReporters } from '../src/cli/reporter-config';
import type { TestReporterEntry } from '../src/cli/reporter-config';
import { parseTestCliArgs, runTestCli } from '../src/cli/test-command';
import { loadTestProject } from '../src/cli/test-project';
import { runTestProject } from '../src/cli/test-project-runner';
import type { TestProjectRunResult } from '../src/cli/types';
import { renderTestResultJUnit } from '../src/report/result-junit';

const dirs: string[] = [];
const project = (reporters?: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'midscene-test-reporters-'));
  dirs.push(dir);
  writeFileSync(
    join(dir, 'midscene.config.ts'),
    [
      'export default {',
      reporters ? `  reporters: ${reporters},` : '',
      '  projects: [{name: "default", files: {include: ["*.yaml"]}}],',
      '  nodes: [{name: "pass", execute() { return {}; }}],',
      '};',
    ].join('\n'),
  );
  return dir;
};
const passingProject = () => {
  const cwd = project();
  writeFileSync(
    join(cwd, 'case.yaml'),
    'cases:\n  - name: passing case\n    steps:\n      - pass: {}\n',
  );
  return cwd;
};

const failedPublication = async (
  cwd: string,
  reporters: readonly TestReporterEntry[],
) => {
  try {
    await runTestProject({ cwd, reporters });
  } catch (error) {
    if (error instanceof WorkflowExecutionFailure)
      return (error as WorkflowExecutionFailure<TestProjectRunResult>).result;
    throw error;
  }
  throw new Error('Expected a reporter publication failure');
};
afterEach(() => {
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});

describe('test reporters', () => {
  it('defaults to no extra reporters and validates independently configured reporters', async () => {
    const plain = await loadTestProject(join(project(), 'midscene.config.ts'));
    expect(plain.reporters).toEqual([]);
    const configured = await loadTestProject(
      join(
        project('[["junit", {outputFile: "ci/junit.xml"}], "json"]'),
        'midscene.config.ts',
      ),
    );
    expect(configured.reporters).toEqual([
      ['junit', { outputFile: 'ci/junit.xml' }],
      'json',
    ]);
    expect(() =>
      validateTestReporters([['junit', { outputFile: '' }]]),
    ).toThrow('outputFile');
    expect(() => validateTestReporters(['unknown'])).toThrow(
      'not a supported reporter',
    );
    expect(() => validateTestReporters([['junit', { enabled: true }]])).toThrow(
      'enabled',
    );
  });

  it('accepts repeatable CLI file reporters without changing terminal reporter mode', () => {
    expect(
      parseTestCliArgs([
        '--reporter',
        'verbose',
        '--reporter=junit',
        '--reporter=json',
      ]),
    ).toMatchObject({ reporter: 'verbose', reporters: ['junit', 'json'] });
    expect(() => parseTestCliArgs(['nodes', '--reporter=junit'])).toThrow(
      'not supported by nodes',
    );
  });

  it('writes multiple configured file outputs on failed preflight and reports their paths', async () => {
    const cwd = project('[["junit", {outputFile: "ci/test.xml"}], "json"]');
    const result = await runTestProject({ cwd });
    const dir = dirname(result.summaryPath);
    expect(result.exitCode).toBe(1);
    expect(result.junitPath).toBe(join(dir, 'ci/test.xml'));
    expect(readFileSync(result.junitPath!, 'utf8')).toContain('<error');
    expect(readFileSync(result.junitPath!, 'utf8')).toContain('(collection)');
    const summary = JSON.parse(readFileSync(result.summaryPath, 'utf8'));
    expect(summary.junit).toBe('ci/test.xml');
    expect(summary.reporters).toEqual([
      { name: 'junit', path: 'ci/test.xml' },
      { name: 'json', path: 'result.json' },
    ]);
    const json = JSON.parse(readFileSync(join(dir, 'result.json'), 'utf8'));
    expect(json.projects[0].collectionErrors.length).toBeGreaterThan(0);
  });

  it('supports SDK overrides and preserves default outputs when disabled', async () => {
    const cwd = project('["junit"]');
    const result = await runTestProject({ cwd, reporters: [] });
    expect(result.junitPath).toBeUndefined();
    expect(result.reporterArtifacts).toBeUndefined();
    expect(existsSync(join(dirname(result.summaryPath), 'junit.xml'))).toBe(
      false,
    );
    expect(existsSync(result.markdownPath!)).toBe(true);
    expect(existsSync(result.summaryPath)).toBe(true);
  });

  it('publishes JUnit from the CLI for a successful workflow', async () => {
    const cwd = passingProject();
    let result: TestProjectRunResult | undefined;
    const code = await runTestCli(
      [cwd, '--reporter=junit'],
      { log() {}, error() {} },
      (completed) => {
        result = completed;
      },
    );
    expect(code).toBe(0);
    expect(readFileSync(result!.junitPath!, 'utf8')).toContain(
      'tests="1" failures="0" errors="0"',
    );
  });

  it('continues publishing after a custom reporter fails on a passing workflow', async () => {
    const cwd = passingProject();
    const result = await failedPublication(cwd, [
      {
        name: 'broken',
        onFinished() {
          throw new Error('Reporter failed');
        },
      },
      'junit',
    ]);
    expect(result.summary.passed).toBe(1);
    expect(result.exitCode).toBe(1);
    expect(readFileSync(result.junitPath!, 'utf8')).toContain(
      'Reporter failed',
    );
    expect(
      JSON.parse(readFileSync(result.summaryPath, 'utf8')).reporters,
    ).toContainEqual({ name: 'junit', path: 'junit.xml' });
  });

  it('drains async events and isolates both thrown and rejected errors', async () => {
    const cwd = passingProject();
    let observed = false;
    const result = await failedPublication(cwd, [
      {
        name: 'sync',
        onEvent(event) {
          if (event.type === 'run-start') throw new Error('sync event failed');
        },
      },
      {
        name: 'async',
        async onEvent(event) {
          if (event.type === 'project-end') {
            await new Promise((resolve) => setTimeout(resolve, 20));
            observed = true;
            throw new Error('async event failed');
          }
        },
      },
      {
        name: 'healthy',
        onFinished() {
          expect(observed).toBe(true);
        },
      },
      'junit',
    ]);
    expect(result.exitCode).toBe(1);
    expect(result.summary.passed).toBe(1);
    expect(result.errors).toHaveLength(2);
    const xml = readFileSync(result.junitPath!, 'utf8');
    expect(xml).toContain('sync event failed');
    expect(xml).toContain('async event failed');
  });

  it.each([
    'summary.json',
    'plan.json',
    'operations.jsonl',
    'Summary.JSON',
    'records/export.xml',
    'project-0/documents/sample.xml',
    'result.md',
    'junit.xml',
  ])('rejects an output collision with %s before execution', async (file) => {
    let started = false;
    await expect(
      runTestProject({
        cwd: passingProject(),
        reporters: ['junit', ['json', { outputFile: `ci/../${file}` }]],
        onEvent: () => {
          started = true;
        },
      }),
    ).rejects.toThrow('conflicts');
    expect(started).toBe(false);
  });

  it('reports pending file cleanup and failed project cleanup without failing a passed Case', async () => {
    let dump: TestRunReportDump | undefined;
    await runTestProject({
      cwd: passingProject(),
      reporters: [
        {
          name: 'capture',
          onFinished(context) {
            dump = context.dump;
          },
        },
      ],
    });
    const run = dump!;
    const project = run.projects[0];
    const file = project.documents[0];
    file.status = 'failed';
    file.cleanup = { status: 'pending', capturedAt: run.endedAt };
    project.lifecycle = {
      status: 'failed',
      startedAt: run.startedAt,
      endedAt: run.endedAt,
      durationMs: run.durationMs,
      cleanup: {
        status: 'failed',
        capturedAt: run.endedAt,
        error: { name: 'Error', message: 'release failed' },
      },
    };
    project.status = run.status = 'failed';
    const xml = renderTestResultJUnit(run);
    expect(xml).toContain('tests="3" failures="0" errors="2" skipped="0"');
    expect(xml).toContain('cleanup pending');
    expect(xml).toContain('release failed');
    expect(xml).toContain('name="passing case"');
  });

  it('escapes XML and preserves case failure, skip, retry and infrastructure outcomes', () => {
    const caseOf = (
      name: string,
      status: 'success' | 'failed' | 'not-run',
    ) => ({
      name,
      status,
      notRunReason: status === 'not-run' ? 'bail' : undefined,
      attempts:
        status === 'not-run'
          ? []
          : [
              {
                durationMs: 12,
                beforeEach: [],
                steps:
                  status === 'failed'
                    ? [
                        {
                          status: 'failed',
                          phase: 'steps',
                          title: 'click',
                          error: { message: '<bad & error>' },
                        },
                      ]
                    : [],
                afterEach: [],
                teardownErrors: [],
                hostErrors: [],
              },
            ],
    });
    const dump = {
      startedAt: '2026-11-09T00:00:00.000Z',
      durationMs: 120,
      projects: [
        {
          name: 'default',
          collectionErrors: [],
          documents: [
            {
              sourcePath: 'checkout.yaml',
              startedAt: '2026-11-09T00:00:00.000Z',
              durationMs: 120,
              beforeAll: [],
              afterAll: [],
              teardownErrors: [],
              hostErrors: [],
              cases: [
                caseOf('good & recovered', 'success'),
                caseOf('bad <case>', 'failed'),
                caseOf('not run', 'not-run'),
              ],
            },
          ],
        },
      ],
      diagnostics: [
        { code: 'run-infrastructure-error', message: 'report <failed>' },
      ],
    } as unknown as TestRunReportDump;
    const xml = renderTestResultJUnit(dump);
    expect(xml).toContain('tests="4" failures="1" errors="1" skipped="1"');
    expect(xml).toContain('good &amp; recovered');
    expect(xml).toContain('bad &lt;case&gt;');
    expect(xml).toContain('&lt;bad &amp; error&gt;');
    expect(xml).toContain('<skipped');
    expect(xml).toContain('<error');
  });
});
