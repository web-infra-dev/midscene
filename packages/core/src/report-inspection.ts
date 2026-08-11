import { createWriteStream, existsSync, statSync } from 'node:fs';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Readable, pipeline } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { deriveTaskStatus } from './dump/task-status';
import { collectDedupedExecutions } from './report';

export const REPORT_STATUSES = ['pass', 'fail', 'incomplete'] as const;

export type ReportStatus = (typeof REPORT_STATUSES)[number];

export interface InspectReportFileOptions {
  htmlPath: string;
}

export interface InspectReportOptions {
  report: string;
}

export interface ReportInspectionResult {
  schemaVersion: 2;
  report: string;
  reportStatus: ReportStatus;
}

export interface PublicReportInspectionResult {
  schemaVersion: 3;
  report: string;
  localReport: string;
  reportStatus: ReportStatus;
}

export function resolveReportHtmlPath(htmlPath: string): string {
  const normalizedPath = path.resolve(htmlPath);

  if (!existsSync(normalizedPath)) {
    throw new Error(`Report path does not exist: ${htmlPath}`);
  }

  const stats = statSync(normalizedPath);
  if (!stats.isDirectory()) {
    return normalizedPath;
  }

  const indexHtmlPath = path.join(normalizedPath, 'index.html');
  if (!existsSync(indexHtmlPath)) {
    throw new Error(
      `"${htmlPath}" is not an HTML report file, and no index.html was found under this directory.`,
    );
  }

  return indexHtmlPath;
}

function inspectResolvedReport(
  resolvedHtmlPath: string,
): ReportInspectionResult {
  const { executions } = collectDedupedExecutions(resolvedHtmlPath, {
    rejectTruncatedDump: true,
  });
  const lastTaskStatus = executions
    .flatMap((execution) => execution.tasks)
    .map(deriveTaskStatus)
    .at(-1);
  const reportStatus: ReportStatus =
    lastTaskStatus === 'passed' || lastTaskStatus === 'warning'
      ? 'pass'
      : lastTaskStatus === 'failed'
        ? 'fail'
        : 'incomplete';

  return {
    schemaVersion: 2,
    report: resolvedHtmlPath,
    reportStatus,
  };
}

export function inspectReportFile(
  options: InspectReportFileOptions,
): ReportInspectionResult {
  if (!options.htmlPath) {
    throw new Error('inspectReportFile: htmlPath is required');
  }

  const resolvedHtmlPath = resolveReportHtmlPath(options.htmlPath);
  return inspectResolvedReport(resolvedHtmlPath);
}

async function materializeReport(report: string): Promise<{
  report: string;
  localReport: string;
  temporaryDirectory: string | null;
}> {
  if (!/^https?:\/\//i.test(report)) {
    const suppliedPath = path.resolve(report);
    let localReport = suppliedPath;
    const suppliedStats = await stat(suppliedPath);
    if (suppliedStats.isDirectory()) {
      localReport = path.join(suppliedPath, 'index.html');
      const reportStats = await stat(localReport);
      if (!reportStats.isFile()) {
        throw new Error(`Report path is not a regular file: ${localReport}`);
      }
    } else if (!suppliedStats.isFile()) {
      throw new Error(`Report path is not a regular file: ${suppliedPath}`);
    }
    return {
      report: suppliedPath,
      localReport,
      temporaryDirectory: null,
    };
  }

  const response = await fetch(report, {
    redirect: 'follow',
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok || !response.body) {
    throw new Error(
      `Unable to download report: HTTP ${response.status}${response.statusText ? ` ${response.statusText}` : ''}`,
    );
  }

  const temporaryDirectory = await mkdtemp(
    path.join(tmpdir(), 'midscene-report-'),
  );
  const localReport = path.join(temporaryDirectory, 'report.html');
  try {
    await new Promise<void>((resolve, reject) => {
      pipeline(
        Readable.fromWeb(response.body as ReadableStream),
        createWriteStream(localReport, { flags: 'wx' }),
        (error) => (error ? reject(error) : resolve()),
      );
    });
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }
  return { report, localReport, temporaryDirectory };
}

/**
 * Inspect a local report, report directory, or HTTP(S) report URL. Input,
 * download, and parsing failures throw instead of returning a report result.
 */
export async function inspectReport(
  options: InspectReportOptions,
): Promise<PublicReportInspectionResult> {
  if (!options.report) {
    throw new Error('inspectReport: report is required');
  }

  const materialized = await materializeReport(options.report);

  try {
    const resolved = resolveReportHtmlPath(materialized.localReport);
    const inspection = inspectResolvedReport(resolved);
    return {
      schemaVersion: 3 as const,
      report: materialized.report,
      localReport: resolved,
      reportStatus: inspection.reportStatus,
    };
  } catch (error) {
    if (materialized.temporaryDirectory) {
      await rm(materialized.temporaryDirectory, {
        recursive: true,
        force: true,
      });
    }
    throw error;
  }
}
