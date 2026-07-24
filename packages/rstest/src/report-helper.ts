import { appendFileSync } from 'node:fs';
import { basename, extname, join } from 'node:path';
import type { ReportFileWithAttributes, TestStatus } from '@midscene/core';
import { getReportFileName } from '@midscene/core/agent';
import { replaceIllegalPathCharsAndSpace } from '@midscene/shared/utils';
import { getManifestDir, manifestKey } from './utils';

export interface RstestTask {
  id: string;
  name: string;
  result?: {
    status: 'pass' | 'fail' | 'skip' | 'todo';
    errors?: Array<{ message?: string }>;
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
  /** Absolute path of the test file, i.e. which manifest to append to. */
  filepath: string;
  /** `performance.now()` at fixture setup, for the reported test duration. */
  startTime: number;
}

/**
 * One test's collected report, handed from the worker to the reporter and fed
 * straight into `ReportMergingTool.append`.
 */
export type ReportManifestEntry = ReportFileWithAttributes;

/**
 * Per-test-file manifest the worker appends to and the reporter drains.
 * One JSON object per line, in teardown order.
 */
export function manifestPathFor(filepath: string): string {
  return join(getManifestDir(), `${manifestKey(filepath)}.jsonl`);
}

function deriveStatus(result: RstestTask['result']): TestStatus {
  // TODO: rstest may eventually surface a structured timeout flag. Until then
  // we substring-match the error message the way Vitest does.
  if (result?.errors?.[0]?.message?.includes('timed out')) return 'timedOut';
  return result?.status === 'fail' ? 'failed' : 'passed';
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
  agent: AgentLike,
  meta: ReportMeta,
  task: RstestTask,
): Promise<void> {
  const status = deriveStatus(task.result);

  await agent.destroy();

  const reportFile = agent.reportFile;
  if (!reportFile) return;

  const entry: ReportManifestEntry = {
    reportFilePath: reportFile,
    reportAttributes: {
      testId: task.id,
      testTitle: task.name,
      testDescription: '',
      testDuration: Math.round(performance.now() - meta.startTime),
      testStatus: status,
    },
  };

  appendFileSync(manifestPathFor(meta.filepath), `${JSON.stringify(entry)}\n`);
}

/**
 * Rstest doesn't expose the surrounding `describe` name in the test context,
 * so we derive `groupName` from the file basename.
 */
export function buildReportMeta(
  task: RstestTask,
  filepath: string,
): ReportMeta {
  const base = basename(filepath, extname(filepath)) || 'UnnamedGroup';
  const taskName = task.name;
  return {
    groupName: `E2E: ${base}`,
    // Test names routinely contain characters that are illegal in a filename
    // (`login: happy path`), and the report generator rejects path separators
    // outright, so the name is sanitized before it reaches the file system.
    // `getReportFileName` appends the timestamp and a uuid, and lets
    // `MIDSCENE_REPORT_TAG_NAME` override the tag like every other integration.
    reportFileName: getReportFileName(
      sanitizeForFileName(`E2E-${base}-${taskName}`),
    ),
    cacheId: replaceIllegalPathCharsAndSpace(`${base}(${taskName})`),
    filepath,
    startTime: performance.now(),
  };
}

/**
 * `replaceIllegalPathCharsAndSpace` deliberately preserves `/` and `\` so that
 * group names can carry hierarchy. File names cannot, so strip those too.
 */
export function sanitizeForFileName(value: string): string {
  return replaceIllegalPathCharsAndSpace(value).replace(/[\\/]/g, '-');
}

export { deriveStatus };
