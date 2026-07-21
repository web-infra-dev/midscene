import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AgentLike,
  type ReportManifestEntry,
  type RstestTestContext,
  buildReportMeta,
  collectReport,
  deriveStatus,
  manifestPathFor,
} from '../../src/report-helper';

function ctx(
  name: string,
  result?: RstestTestContext['task']['result'],
): RstestTestContext {
  return { task: { id: `id-${name}`, name, result } };
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
  it('maps pass → passed', () => {
    expect(deriveStatus({ status: 'pass' })).toBe('passed');
  });

  it('maps fail → failed', () => {
    expect(deriveStatus({ status: 'fail' })).toBe('failed');
  });

  it('detects timeout from error message substring', () => {
    expect(
      deriveStatus({
        status: 'fail',
        errors: [{ message: 'hook timed out in 60000ms' }],
      }),
    ).toBe('timedOut');
  });

  it('falls back to passed when result is missing', () => {
    expect(deriveStatus(undefined)).toBe('passed');
  });

  it('treats skip/todo as passed (no dedicated mapping)', () => {
    expect(deriveStatus({ status: 'skip' })).toBe('passed');
    expect(deriveStatus({ status: 'todo' })).toBe('passed');
  });
});

describe('buildReportMeta', () => {
  it('derives groupName from file basename without extension', () => {
    const meta = buildReportMeta(
      ctx('adds a todo'),
      '/repo/e2e/todo-list.test.ts',
    );
    expect(meta.groupName).toBe('E2E: todo-list.test');
  });

  it('falls back when filepath has no basename', () => {
    const meta = buildReportMeta(ctx('case'), '');
    expect(meta.groupName).toBe('E2E: UnnamedGroup');
  });

  it('reportFileName embeds basename and task name', () => {
    const meta = buildReportMeta(ctx('caseA'), '/x/foo.test.ts');
    expect(meta.reportFileName.startsWith('E2E-foo.test-caseA-')).toBe(true);
    // trailing timestamp
    expect(meta.reportFileName).toMatch(/-\d{8}-\d{9}$/);
  });

  it('sanitizes characters that are illegal in a file name', () => {
    const meta = buildReportMeta(
      ctx('login: happy path <fast> a/b'),
      '/x/foo.test.ts',
    );
    expect(meta.reportFileName).not.toMatch(/[:*?"<>|\\/]/);
    expect(meta.reportFileName).toContain('login--happy-path');
  });
});

describe('collectReport', () => {
  let runDir: string;
  const originalRunDir = process.env.MIDSCENE_RUN_DIR;

  beforeEach(() => {
    runDir = mkdtempSync(join(tmpdir(), 'midscene-rstest-report-'));
    process.env.MIDSCENE_RUN_DIR = runDir;
  });

  afterEach(() => {
    if (originalRunDir === undefined) {
      Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
    } else {
      process.env.MIDSCENE_RUN_DIR = originalRunDir;
    }
    rmSync(runDir, { recursive: true, force: true });
  });

  it('destroys the agent and records its report', async () => {
    const agent = agentStub('/reports/a.html');
    await collectReport(agent, undefined, ctx('case A'), '/repo/a.test.ts');

    expect(agent.destroyed).toBe(true);
    const entries = readManifest('/repo/a.test.ts');
    expect(entries).toHaveLength(1);
    expect(entries[0].reportFilePath).toBe('/reports/a.html');
    expect(entries[0].reportAttributes.testTitle).toBe('case A');
    expect(entries[0].reportAttributes.testStatus).toBe('passed');
  });

  it('still destroys the agent when it produced no report', async () => {
    const agent = agentStub(null);
    await collectReport(agent, undefined, ctx('case A'), '/repo/a.test.ts');

    expect(agent.destroyed).toBe(true);
    expect(readManifest('/repo/a.test.ts')).toHaveLength(0);
  });

  it('appends every test of a file in order', async () => {
    await collectReport(
      agentStub('/reports/1.html'),
      undefined,
      ctx('first'),
      '/repo/a.test.ts',
    );
    await collectReport(
      agentStub('/reports/2.html'),
      undefined,
      ctx('second'),
      '/repo/a.test.ts',
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
      undefined,
      ctx('case A'),
      '/repo/a.test.ts',
    );
    await collectReport(
      agentStub('/reports/b.html'),
      undefined,
      ctx('case B'),
      '/repo/b.test.ts',
    );

    expect(
      readManifest('/repo/a.test.ts').map((e) => e.reportFilePath),
    ).toEqual(['/reports/a.html']);
    expect(
      readManifest('/repo/b.test.ts').map((e) => e.reportFilePath),
    ).toEqual(['/reports/b.html']);
  });

  it('records the failed status and a measured duration', async () => {
    const start = performance.now() - 25;
    await collectReport(
      agentStub('/reports/a.html'),
      start,
      ctx('case A', { status: 'fail' }),
      '/repo/a.test.ts',
    );

    const [entry] = readManifest('/repo/a.test.ts');
    expect(entry.reportAttributes.testStatus).toBe('failed');
    expect(entry.reportAttributes.testDuration).toBeGreaterThanOrEqual(25);
  });
});
