import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WorkflowExecutionFailure } from '@midscene/core/internal/test-runner';
import { loadTestProject } from '../src/cli/test-project';
import { runTestProject } from '../src/cli/test-project-runner';
import { parseTestCliArgs } from '../src/cli/test-command';
import { validateTestReporters } from '../src/cli/reporter-config';
import { renderTestResultJUnit } from '../src/report/result-junit';
import type { TestRunReportDump } from '@midscene/core';

const dirs: string[] = [];
const project = (reporters?: string) => {
  const dir = mkdtempSync(join(tmpdir(), 'midscene-test-reporters-'));
  dirs.push(dir);
  writeFileSync(join(dir, 'midscene.config.ts'), [
    'export default {',
    reporters ? '  reporters: ' + reporters + ',' : '',
    '  projects: [{name: "default", files: {include: ["missing/**/*.yaml"]}}],',
    '  nodes: [],',
    '};',
  ].join('\n'));
  return dir;
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe('test reporters', () => {
  it('defaults to no extra reporters and validates independently configured reporters', async () => {
    const plain = await loadTestProject(join(project(), 'midscene.config.ts'));
    expect(plain.reporters).toEqual([]);
    const configured = await loadTestProject(join(
      project('[["junit", {outputFile: "ci/junit.xml"}], "json"]'),
      'midscene.config.ts',
    ));
    expect(configured.reporters).toEqual([
      ['junit', { outputFile: 'ci/junit.xml' }],
      'json',
    ]);
    expect(() => validateTestReporters([['junit', { outputFile: '' }]])).toThrow('outputFile');
    expect(() => validateTestReporters(['unknown'])).toThrow('not a supported reporter');
    expect(() => validateTestReporters([['junit', { enabled: true }]])).toThrow('enabled');
  });

  it('accepts repeatable CLI file reporters without changing terminal reporter mode', () => {
    expect(parseTestCliArgs(['--reporter', 'verbose', '--reporter=junit', '--reporter=json']))
      .toMatchObject({ reporter: 'verbose', reporters: ['junit', 'json'] });
    expect(() => parseTestCliArgs(['nodes', '--reporter=junit']))
      .toThrow('not supported by nodes');
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
    expect(existsSync(join(dirname(result.summaryPath), 'junit.xml'))).toBe(false);
    expect(existsSync(result.markdownPath!)).toBe(true);
    expect(existsSync(result.summaryPath)).toBe(true);
  });

  it('continues publishing after a custom reporter fails and sets a nonzero exit code', async () => {
    const cwd = project();
    const events: string[] = [];
    const reporters = [
      {
        name: 'broken',
        onEvent: (event: { type: string }) => events.push(event.type),
        onFinished: () => { throw new Error('Reporter failed'); },
      },
      'junit' as const,
    ];
    let result;
    try {
      result = await runTestProject({ cwd, reporters });
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowExecutionFailure);
      result = (error as WorkflowExecutionFailure).result;
    }
    expect(events).toContain('run-start');
    expect(result!.exitCode).toBe(1);
    expect(result!.errors?.length).toBeGreaterThan(0);
    expect(readFileSync(result!.junitPath!, 'utf8')).toContain('<testsuites');
    expect(JSON.parse(readFileSync(result!.summaryPath, 'utf8')).reporters)
      .toContainEqual({ name: 'junit', path: 'junit.xml' });
  });

  it('isolates event callback exceptions from other reporters', async () => {
    const cwd = project();
    let received = 0;
    let result;
    try {
      result = await runTestProject({
        cwd,
        reporters: [
          { name: 'broken-event', onEvent: () => { throw new Error('event failed'); } },
          { name: 'healthy', onEvent: () => { received++; } },
          'junit',
        ],
      });
    } catch (error) {
      expect(error).toBeInstanceOf(WorkflowExecutionFailure);
      result = (error as WorkflowExecutionFailure).result;
    }
    expect(received).toBeGreaterThan(0);
    expect(result!.exitCode).toBe(1);
    expect(existsSync(result!.junitPath!)).toBe(true);
  });

  it('escapes XML and preserves case failure, skip, retry and infrastructure outcomes', () => {
    const caseOf = (name: string, status: 'success' | 'failed' | 'not-run') => ({
      name, status,
      notRunReason: status === 'not-run' ? 'bail' : undefined,
      attempts: status === 'not-run' ? [] : [{
        durationMs: 12,
        beforeEach: [], steps: status === 'failed'
          ? [{ status: 'failed', phase: 'steps', title: 'click', error: { message: '<bad & error>' } }]
          : [],
        afterEach: [], teardownErrors: [], hostErrors: [],
      }],
    });
    const dump = {
      startedAt: '2026-11-09T00:00:00.000Z',
      durationMs: 120,
      projects: [{
        name: 'default',
        collectionErrors: [],
        documents: [{
          sourcePath: 'checkout.yaml',
          startedAt: '2026-11-09T00:00:00.000Z',
          durationMs: 120,
          beforeAll: [], afterAll: [], teardownErrors: [], hostErrors: [],
          cases: [
            caseOf('good & recovered', 'success'),
            caseOf('bad <case>', 'failed'),
            caseOf('not run', 'not-run'),
          ],
        }],
      }],
      diagnostics: [{ code: 'run-infrastructure-error', message: 'report <failed>' }],
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
