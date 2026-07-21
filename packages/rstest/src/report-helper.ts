import { appendFileSync, mkdirSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { TestStatus } from '@midscene/core';
import { replaceIllegalPathCharsAndSpace } from '@midscene/shared/utils';
import { generateTimestamp, getManifestDir, manifestKey } from './utils';

export interface RstestTestContext {
  task: {
    id: string;
    name: string;
    result?: {
      status: 'pass' | 'fail' | 'skip' | 'todo';
      errors?: Array<{ message?: string }>;
    };
  };
}

export interface AgentLike {
  reportFile?: string | null;
  destroy(): Promise<void>;
}

export interface ReportMeta {
  groupName: string;
  reportFileName: string;
  /**
   * Stable cache id derived from `${file}(${task.name})`. Unlike
   * `reportFileName` this carries no timestamp, so retries and re-runs of the
   * same test reuse the same cache namespace.
   */
  cacheId: string;
}

/**
 * One test's collected report, handed from the worker to the reporter.
 * Shaped to be spread straight into `ReportMergingTool.append`.
 */
export interface ReportManifestEntry {
  reportFilePath: string;
  reportAttributes: {
    testId: string;
    testTitle: string;
    testDescription: string;
    testDuration: number;
    testStatus: TestStatus;
  };
}

/**
 * Per-test-file manifest the worker appends to and the reporter drains.
 * One JSON object per line, in teardown order.
 */
export function manifestPathFor(filepath: string): string {
  return join(getManifestDir(), `${manifestKey(filepath)}.jsonl`);
}

const STATUS_MAP: Record<string, TestStatus> = {
  pass: 'passed',
  fail: 'failed',
};

function deriveStatus(result: RstestTestContext['task']['result']): TestStatus {
  // TODO: rstest may eventually surface a structured timeout flag. Until then
  // we substring-match the error message the way Vitest does.
  if (result?.errors?.[0]?.message?.includes('timed out')) return 'timedOut';
  return STATUS_MAP[result?.status ?? ''] ?? 'passed';
}

/**
 * Destroy the agent and record its report in the file's manifest.
 *
 * Merging deliberately does NOT happen here. A worker has no per-file teardown
 * hook that survives `isolate: false`: with a shared module registry this
 * module is evaluated once for the whole worker, so a module-level `afterAll`
 * would only ever fire for the first test file and every later file would
 * silently lose its report. `MidsceneReporter` merges instead, because
 * `onTestFileResult` fires per file in the main process regardless of
 * `isolate`.
 */
export async function collectReport(
  agent: AgentLike | undefined,
  startTime: number | undefined,
  testCtx: RstestTestContext,
  filepath: string,
): Promise<void> {
  const status = deriveStatus(testCtx.task.result);

  await agent?.destroy();

  const reportFile = agent?.reportFile;
  if (!reportFile) return;

  const entry: ReportManifestEntry = {
    reportFilePath: reportFile,
    reportAttributes: {
      testId: testCtx.task.id,
      testTitle: testCtx.task.name,
      testDescription: '',
      testDuration:
        startTime !== undefined ? Math.round(performance.now() - startTime) : 0,
      testStatus: status,
    },
  };

  mkdirSync(getManifestDir(), { recursive: true });
  appendFileSync(manifestPathFor(filepath), `${JSON.stringify(entry)}\n`);
}

/**
 * Rstest doesn't expose the surrounding `describe` name in the test context,
 * so we derive `groupName` from the file basename.
 */
export function buildReportMeta(
  testCtx: RstestTestContext,
  filepath: string,
): ReportMeta {
  const base = basename(filepath, extname(filepath)) || 'UnnamedGroup';
  const taskName = testCtx.task.name;
  return {
    groupName: `E2E: ${base}`,
    // Test names routinely contain characters that are illegal in a filename
    // (`login: happy path`), and the report generator rejects path separators
    // outright, so the name is sanitized before it reaches the file system.
    reportFileName: sanitizeForFileName(
      `E2E-${base}-${taskName}-${generateTimestamp()}`,
    ),
    cacheId: replaceIllegalPathCharsAndSpace(`${base}(${taskName})`),
  };
}

/**
 * `replaceIllegalPathCharsAndSpace` deliberately preserves `/` and `\` so that
 * group names can carry hierarchy. File names cannot, so strip those too.
 */
function sanitizeForFileName(value: string): string {
  return replaceIllegalPathCharsAndSpace(value).replace(/[\\/]/g, '-');
}

export { deriveStatus };
