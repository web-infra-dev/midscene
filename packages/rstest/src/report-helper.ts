import { appendFileSync } from 'node:fs';
import { basename, extname, join, relative, sep } from 'node:path';
import type { ReportFileWithAttributes, TestStatus } from '@midscene/core';
import { getReportFileName } from '@midscene/core/agent';
import { getDebug } from '@midscene/shared/logger';
import { replaceIllegalPathCharsAndSpace } from '@midscene/shared/utils';
import { currentRunId, getManifestDir, manifestKey } from './utils';

const debug = getDebug('rstest:report', { console: true });

let warnedMissingReporter = false;

export interface RstestTask {
  id: string;
  name: string;
  /**
   * Absolute path of the project root, used to keep the derived cache id
   * independent of where the repository is checked out. Optional because
   * rstest only started reporting it recently; the absolute path is the
   * fallback, which is still collision-free, just not portable.
   */
  projectRoot?: string;
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
   * Stable cache id derived from `${projectRelativeFile}(${task.name})`, the
   * same shape `@midscene/web/playwright` builds from Playwright's
   * `titlePath`. Unlike `reportFileName` this carries no timestamp, so retries
   * and re-runs of the same test reuse the same cache namespace.
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

/**
 * Map rstest's status onto Midscene's `TestStatus`, the way
 * `@midscene/web/playwright`'s reporter passes Playwright's status through
 * verbatim. Every status rstest defines today gets its own case, because
 * folding the unrecognized ones onto `passed` is what let a dynamically
 * skipped test — `skip()` called after the agent had already produced a
 * report — show up as a pass and inflate the pass rate. `default` covers a
 * result that has not been set yet, and would cover a status added upstream.
 */
function deriveStatus(result: RstestTask['result']): TestStatus {
  // TODO: rstest may eventually surface a structured timeout flag. Until then
  // we substring-match the error message the way Vitest does.
  if (result?.errors?.[0]?.message?.includes('timed out')) return 'timedOut';
  switch (result?.status) {
    case 'fail':
      return 'failed';
    case 'skip':
    case 'todo':
      return 'skipped';
    case 'pass':
      return 'passed';
    default:
      return 'passed';
  }
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

  if (!currentRunId()) {
    // Only `MidsceneReporter` drains manifests, so without one this entry
    // would be written to a file nothing ever reads or truncates. Say so once
    // instead of growing that file for the life of the project.
    if (!warnedMissingReporter) {
      warnedMissingReporter = true;
      debug(
        "no MidsceneReporter is configured, so per-file report merging is off. Add `new MidsceneReporter()` to `reporters` in your rstest config to merge each test file's Midscene reports. Individual reports are still written.",
      );
    }
    return;
  }

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
 * Identify a test file the way `@midscene/web/playwright` does, by the path
 * that leads to it rather than its basename alone — a basename is not an
 * identity, and two files sharing one would share a cache namespace.
 *
 * Separators are normalized because cache files outlive the machine that wrote
 * them. The `/` survives `replaceIllegalPathCharsAndSpace` on purpose:
 * `TaskCache` creates the nested cache directory, as it already does for the
 * Playwright integration.
 */
function fileIdentity(filepath: string, projectRoot?: string): string {
  const relativePath = projectRoot ? relative(projectRoot, filepath) : filepath;
  // `relative` yields '' for the root itself and a '..'-prefixed path for a
  // file outside it. Both are stable ids; only the empty one is unusable.
  return (relativePath || basename(filepath)).split(sep).join('/');
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
    cacheId: replaceIllegalPathCharsAndSpace(
      `${fileIdentity(filepath, task.projectRoot)}(${taskName})`,
    ),
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
