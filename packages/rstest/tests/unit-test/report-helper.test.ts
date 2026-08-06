import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestStatus } from '@midscene/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  type AgentLike,
  type ReportManifestEntry,
  type RstestTask,
  buildReportMeta,
  collectReport,
  deriveStatus,
  manifestPathFor,
} from '../../src/report-helper';
import { RUN_ID_ENV } from '../../src/utils';

function task(
  name: string,
  result?: RstestTask['result'],
  projectRoot?: string,
): RstestTask {
  return { id: `id-${name}`, name, result, projectRoot };
}

function meta(name: string, filepath: string) {
  return buildReportMeta(task(name), filepath);
}

function agentStub(reportFile: string | null): AgentLike & {
  destroyed: boolean;
} {
  return {
    reportFile,
    destroyed: false,
    async destroy() {
      this.destroyed = true;
    },
  };
}

function readManifest(filepath: string): ReportManifestEntry[] {
  const path = manifestPathFor(filepath);
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

describe('deriveStatus', () => {
  it.each<[string, RstestTask['result'], TestStatus]>([
    ['pass → passed', { status: 'pass' }, 'passed'],
    ['fail → failed', { status: 'fail' }, 'failed'],
    [
      'timeout, detected from the error message substring',
      { status: 'fail', errors: [{ message: 'hook timed out in 60000ms' }] },
      'timedOut',
    ],
    ['a missing result → passed', undefined, 'passed'],
    // A test that called `skip()` after the agent had already run still reaches
    // teardown with a report to collect, so the status has to survive the trip.
    ['skip → skipped', { status: 'skip' }, 'skipped'],
    ['todo → skipped', { status: 'todo' }, 'skipped'],
  ])('maps %s', (_label, result, expected) => {
    expect(deriveStatus(result)).toBe(expected);
  });
});

describe('buildReportMeta', () => {
  it('derives groupName from file basename without extension', () => {
    const meta = buildReportMeta(
      task('adds a todo'),
      '/repo/e2e/todo-list.test.ts',
    );
    expect(meta.groupName).toBe('E2E: todo-list.test');
  });

  it('falls back when filepath has no basename', () => {
    const meta = buildReportMeta(task('case'), '');
    expect(meta.groupName).toBe('E2E: UnnamedGroup');
  });

  it('reportFileName embeds basename and task name', () => {
    const meta = buildReportMeta(task('caseA'), '/x/foo.test.ts');
    expect(meta.reportFileName.startsWith('E2E-foo.test-caseA-')).toBe(true);
    // trailing `YYYY-MM-DD_HH-mm-ss-<uuid8>` from `getReportFileName`
    expect(meta.reportFileName).toMatch(
      /-\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}-[0-9a-f]{8}$/,
    );
  });

  it('sanitizes characters that are illegal in a file name', () => {
    const meta = buildReportMeta(
      task('login: happy path <fast> a/b'),
      '/x/foo.test.ts',
    );
    expect(meta.reportFileName).not.toMatch(/[:*?"<>|\\/]/);
    expect(meta.reportFileName).toContain('login--happy-path');
  });
});

describe('buildReportMeta cacheId', () => {
  it.each<[string, string | undefined, string, string]>([
    // Spaces become `-` on the way through `replaceIllegalPathCharsAndSpace`;
    // `/` survives, because the cache file is allowed to nest.
    [
      'the project-relative path, matching the Playwright integration',
      '/repo',
      '/repo/e2e/todo-list.test.ts',
      'e2e/todo-list.test.ts(adds-a-todo)',
    ],
    [
      'the absolute path when the project root is unknown',
      undefined,
      '/repo/e2e/todo.test.ts',
      '/repo/e2e/todo.test.ts(adds-a-todo)',
    ],
    [
      'the basename for a file that is itself the project root',
      '/repo/solo.test.ts',
      '/repo/solo.test.ts',
      'solo.test.ts(adds-a-todo)',
    ],
    [
      'an escaping path for a file outside the project root',
      '/repo',
      '/shared/e2e/todo.test.ts',
      '../shared/e2e/todo.test.ts(adds-a-todo)',
    ],
  ])('is built from %s', (_label, projectRoot, filepath, expected) => {
    const meta = buildReportMeta(
      task('adds a todo', undefined, projectRoot),
      filepath,
    );
    expect(meta.cacheId).toBe(expected);
  });

  // The bug this guards: a basename is not a file identity. Same-named specs
  // under different directories would share one auto-derived cache namespace,
  // and a plan cached by one could be replayed against the other's page.
  it('separates same-named files in different directories', () => {
    const login = buildReportMeta(
      task('smoke', undefined, '/repo'),
      '/repo/e2e/login/smoke.test.ts',
    );
    const checkout = buildReportMeta(
      task('smoke', undefined, '/repo'),
      '/repo/e2e/checkout/smoke.test.ts',
    );
    expect(login.cacheId).not.toBe(checkout.cacheId);
  });

  it('stays stable across re-runs of the same test', () => {
    const first = buildReportMeta(
      task('adds a todo', undefined, '/repo'),
      '/repo/e2e/todo.test.ts',
    );
    const second = buildReportMeta(
      task('adds a todo', undefined, '/repo'),
      '/repo/e2e/todo.test.ts',
    );
    expect(first.cacheId).toBe(second.cacheId);
    // ...unlike reportFileName, which carries a timestamp and a uuid.
    expect(first.reportFileName).not.toBe(second.reportFileName);
  });

  it('is independent of where the project is checked out', () => {
    const here = buildReportMeta(
      task('adds a todo', undefined, '/home/alice/repo'),
      '/home/alice/repo/e2e/todo.test.ts',
    );
    const there = buildReportMeta(
      task('adds a todo', undefined, '/ci/build/42/repo'),
      '/ci/build/42/repo/e2e/todo.test.ts',
    );
    expect(here.cacheId).toBe(there.cacheId);
  });
});

describe('collectReport', () => {
  let runDir: string;

  beforeEach(() => {
    runDir = mkdtempSync(join(tmpdir(), 'midscene-rstest-report-'));
    vi.stubEnv('MIDSCENE_RUN_DIR', runDir);
    // Stands in for the namespace `MidsceneReporter` claims in a real run.
    vi.stubEnv(RUN_ID_ENV, 'run-under-test');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    rmSync(runDir, { recursive: true, force: true });
  });

  it('destroys the agent and records its report', async () => {
    const agent = agentStub('/reports/a.html');
    await collectReport(
      agent,
      meta('case A', '/repo/a.test.ts'),
      task('case A'),
    );

    expect(agent.destroyed).toBe(true);
    const entries = readManifest('/repo/a.test.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0].reportFilePath).toBe('/reports/a.html');
    expect(entries[0].reportAttributes.testTitle).toBe('case A');
    expect(entries[0].reportAttributes.testStatus).toBe('passed');
  });

  it('still destroys the agent when it produced no report', async () => {
    const agent = agentStub(null);
    await collectReport(
      agent,
      meta('case A', '/repo/a.test.ts'),
      task('case A'),
    );

    expect(agent.destroyed).toBe(true);
    expect(readManifest('/repo/a.test.ts')).toHaveLength(0);
  });

  // Only the reporter drains manifests. Without one, writing an entry would
  // grow a file nothing ever reads or truncates.
  it('destroys the agent but writes nothing when no reporter claimed the run', async () => {
    vi.stubEnv(RUN_ID_ENV, '');
    const agent = agentStub('/reports/a.html');
    const reportMeta = { ...meta('case A', '/repo/a.test.ts') };

    await collectReport(agent, reportMeta, task('case A'));

    expect(agent.destroyed).toBe(true);
    vi.stubEnv(RUN_ID_ENV, 'run-under-test');
    expect(readManifest('/repo/a.test.ts')).toHaveLength(0);
  });

  it('appends every test of a file in order', async () => {
    await collectReport(
      agentStub('/reports/1.html'),
      meta('first', '/repo/a.test.ts'),
      task('first'),
    );
    await collectReport(
      agentStub('/reports/2.html'),
      meta('second', '/repo/a.test.ts'),
      task('second'),
    );

    expect(
      readManifest('/repo/a.test.ts').map((e) => e.reportFilePath),
    ).toEqual(['/reports/1.html', '/reports/2.html']);
  });

  // The reason merging moved to the reporter: under `isolate: false` a single
  // module instance serves every test file, so per-file state must be keyed by
  // filepath rather than held in module scope.
  it('keeps files separate when one module instance serves both', async () => {
    await collectReport(
      agentStub('/reports/a.html'),
      meta('case A', '/repo/a.test.ts'),
      task('case A'),
    );
    await collectReport(
      agentStub('/reports/b.html'),
      meta('case B', '/repo/b.test.ts'),
      task('case B'),
    );

    expect(
      readManifest('/repo/a.test.ts').map((e) => e.reportFilePath),
    ).toEqual(['/reports/a.html']);
    expect(
      readManifest('/repo/b.test.ts').map((e) => e.reportFilePath),
    ).toEqual(['/reports/b.html']);
  });

  it('records the failed status and a measured duration', async () => {
    await collectReport(
      agentStub('/reports/a.html'),
      {
        ...meta('case A', '/repo/a.test.ts'),
        startTime: performance.now() - 25,
      },
      task('case A', { status: 'fail' }),
    );

    const [entry] = readManifest('/repo/a.test.ts');
    expect(entry.reportAttributes.testStatus).toBe('failed');
    expect(entry.reportAttributes.testDuration).toBeGreaterThanOrEqual(25);
  });

  // `skip()` mid-test aborts the body but still runs fixture teardown, and
  // rstest has already set `result.status` by then — so an agent that ran
  // before the skip contributes a report that must not read as a pass.
  it('records a mid-test skip as skipped rather than passed', async () => {
    await collectReport(
      agentStub('/reports/a.html'),
      meta('case A', '/repo/a.test.ts'),
      task('case A', { status: 'skip' }),
    );

    const [entry] = readManifest('/repo/a.test.ts');
    expect(entry.reportAttributes.testStatus).toBe('skipped');
  });
});
