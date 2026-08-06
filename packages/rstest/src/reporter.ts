import { readFileSync, rmSync } from 'node:fs';
import { basename, extname } from 'node:path';
import { getReportFileName, printReportMsg } from '@midscene/core/agent';
import { ReportMergingTool } from '@midscene/core/report';
import type { Reporter, TestFileResult } from '@rstest/core';
import {
  type ReportManifestEntry,
  manifestPathFor,
  sanitizeForFileName,
} from './report-helper';
import { ensureRunId, manifestDirPath } from './utils';

// Claim this run's manifest namespace when the module loads, not in the
// constructor: importing this module is what the user's config does, and the
// config is evaluated in the main process before any worker exists — workers
// then inherit `process.env` at spawn. Claiming it later would let an
// already-spawned worker write somewhere the reporter never looks, and doing
// it in the constructor would mean merely constructing a reporter mutates
// global process state.
ensureRunId();

/**
 * Merges each test file's Midscene reports and prints the result.
 *
 * Merging lives here rather than in a worker-side `afterAll` so it stays
 * correct under `isolate: false`, where the package module is evaluated once
 * per worker instead of once per test file. `onTestFileResult` fires per file
 * in the main process either way.
 */
export default class MidsceneReporter implements Reporter {
  /** Scoped to this run's namespace, so a concurrent rstest process is left alone. */
  private clearManifestDir(): void {
    rmSync(manifestDirPath(), { recursive: true, force: true });
  }

  onTestRunStart(): void {
    // Pre-clean in case a previous run in this same process (watch mode)
    // crashed mid-flight.
    this.clearManifestDir();
  }

  onTestRunEnd(): void {
    // Every file's manifest is drained as it finishes, so by now this only
    // removes the empty namespace directory itself.
    this.clearManifestDir();
  }

  onTestFileResult(file: TestFileResult): void {
    const manifestPath = manifestPathFor(file.testPath);
    let raw: string;
    try {
      raw = readFileSync(manifestPath, 'utf8');
    } catch (err) {
      // A missing manifest is the ordinary "no agent ran in this file" case.
      // Anything else — a permission error, a truncated read — means reports
      // exist but cannot be merged, which must not pass for silence.
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return;
      throw new Error(
        `@midscene/rstest failed to read the report manifest for ${file.testPath} at ${manifestPath}`,
        { cause: err },
      );
    }
    // Drained into memory — without this the file would linger until the next
    // run's `onTestRunStart` pre-clean.
    rmSync(manifestPath, { force: true });

    const entries: ReportManifestEntry[] = raw
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line));
    if (!entries.length) return;

    const tool = new ReportMergingTool();
    for (const entry of entries) {
      tool.append(entry);
    }

    const base =
      basename(file.testPath, extname(file.testPath)) || 'MergedReport';
    const merged = tool.mergeReports(
      getReportFileName(sanitizeForFileName(`E2E-${base}`)),
      { overwrite: true },
    );
    if (merged) {
      printReportMsg(merged);
    }
  }
}
