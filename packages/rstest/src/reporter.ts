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
import { getManifestDir } from './utils';

/**
 * Merges each test file's Midscene reports and prints the result.
 *
 * Merging lives here rather than in a worker-side `afterAll` so it stays
 * correct under `isolate: false`, where the package module is evaluated once
 * per worker instead of once per test file. `onTestFileResult` fires per file
 * in the main process either way.
 */
export default class MidsceneReporter implements Reporter {
  onTestRunStart(): void {
    // Pre-clean in case a previous run crashed mid-flight.
    rmSync(getManifestDir(), { recursive: true, force: true });
  }

  onTestFileResult(file: TestFileResult): void {
    let raw: string;
    try {
      raw = readFileSync(manifestPathFor(file.testPath), 'utf8');
    } catch {
      // No agent ran in this file, so there is nothing to merge.
      return;
    }

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
    // Fall back to the first report so a path is still printed if the merger
    // declines to produce a new file.
    const report = merged ?? entries[0].reportFilePath;
    if (report) {
      printReportMsg(report);
    }
  }
}
