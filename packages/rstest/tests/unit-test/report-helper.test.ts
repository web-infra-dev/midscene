import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AgentLike,
  type ReportManifestEntry,
  type RstestTask,
  buildReportMeta,
  collectReport,
  deriveStatus,
  manifestPathFor,
} from '../../src/report-helper';
import { resetManifestDirCache } from '../../src/utils';

function task(name: string, result?: RstestTask['result']): RstestTask {
  return { id: `id-${name}`, name, result };
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

describe('collectReport', () => {
  let runDir: string;
  const originalRunDir = process.env.MIDSCENE_RUN_DIR;

  beforeEach(() => {
    runDir = mkdtempSync(join(tmpdir(), 'midscene-rstest-report-'));
    process.env.MIDSCENE_RUN_DIR = runDir;
    resetManifestDirCache();
  });

  afterEach(() => {
    if (originalRunDir === undefined) {
      Reflect.deleteProperty(process.env, 'MIDSCENE_RUN_DIR');
    } else {
      process.env.MIDSCENE_RUN_DIR = originalRunDir;
    }
    resetManifestDirCache();
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
});
