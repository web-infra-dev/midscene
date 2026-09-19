import { createWriteStream, existsSync, statSync } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import * as path from 'node:path';
import { Readable, pipeline } from 'node:stream';
import type { ReadableStream } from 'node:stream/web';
import { type DerivedTaskStatus, deriveTaskStatus } from './dump/task-status';
import { collectDedupedExecutions } from './report';
import type { ReportMeta } from './types';

export const REPORT_EXECUTION_STATUSES = [
  'pass',
  'fail',
  'incomplete',
] as const;

export type ReportExecutionStatus = (typeof REPORT_EXECUTION_STATUSES)[number];

export interface ReadReportMetadataOptions {
  report: string;
}

export interface GetReportMetadataOptions {
  report: string;
}

export interface ReportMetadata extends ReportMeta {
  schemaVersion: 1;
  source: string;
  resolvedHtmlPath: string;
  executionStatus: ReportExecutionStatus;
  lastTaskStatus: DerivedTaskStatus;
  executionCount: number;
  taskCount: number;
}

interface ReportContentMetadata extends ReportMeta {
  executionStatus: ReportExecutionStatus;
  lastTaskStatus: DerivedTaskStatus;
  executionCount: number;
  taskCount: number;
}

export function resolveReportHtmlPath(reportPath: string): string {
  const normalizedPath = path.resolve(reportPath);

  if (!existsSync(normalizedPath)) {
    throw new Error(`Report path does not exist: ${reportPath}`);
  }

  const stats = statSync(normalizedPath);
  if (!stats.isDirectory()) {
    if (!stats.isFile()) {
      throw new Error(`Report path is not a regular file: ${normalizedPath}`);
    }
    return normalizedPath;
  }

  const indexHtmlPath = path.join(normalizedPath, 'index.html');
  if (!existsSync(indexHtmlPath)) {
    throw new Error(
      `"${reportPath}" is not an HTML report file, and no index.html was found under this directory.`,
    );
  }

  return indexHtmlPath;
}

function readReportContentMetadata(
  resolvedHtmlPath: string,
): ReportContentMetadata {
  const { baseDump, executions } = collectDedupedExecutions(resolvedHtmlPath, {
    rejectTruncatedDump: true,
  });
  const tasks = executions.flatMap((execution) => execution.tasks);
  const lastTaskStatus = tasks.length
    ? deriveTaskStatus(tasks[tasks.length - 1])
    : 'unknown';
  const executionStatus: ReportExecutionStatus =
    lastTaskStatus === 'passed' || lastTaskStatus === 'warning'
      ? 'pass'
      : lastTaskStatus === 'failed'
        ? 'fail'
        : 'incomplete';

  return {
    groupName: baseDump.groupName,
    groupDescription: baseDump.groupDescription,
    sdkVersion: baseDump.sdkVersion,
    modelBriefs: baseDump.modelBriefs,
    deviceType: baseDump.deviceType,
    executionStatus,
    lastTaskStatus,
    executionCount: executions.length,
    taskCount: tasks.length,
  };
}

export function readReportMetadata(
  options: ReadReportMetadataOptions,
): ReportMetadata {
  if (!options.report) {
    throw new Error('readReportMetadata: report is required');
  }
  if (/^https?:\/\//i.test(options.report)) {
    throw new Error('readReportMetadata: report must be a local path');
  }

  const source = path.resolve(options.report);
  const resolvedHtmlPath = resolveReportHtmlPath(options.report);

  return {
    schemaVersion: 1,
    source,
    resolvedHtmlPath,
    ...readReportContentMetadata(resolvedHtmlPath),
  };
}

async function downloadReport(report: string): Promise<{
  resolvedHtmlPath: string;
  temporaryDirectory: string;
}> {
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
    path.join(tmpdir(), 'midscene-report-metadata-'),
  );
  const resolvedHtmlPath = path.join(temporaryDirectory, 'report.html');
  try {
    await new Promise<void>((resolve, reject) => {
      pipeline(
        Readable.fromWeb(response.body as ReadableStream),
        createWriteStream(resolvedHtmlPath, { flags: 'wx' }),
        (error) => (error ? reject(error) : resolve()),
      );
    });
  } catch (error) {
    await rm(temporaryDirectory, { recursive: true, force: true });
    throw error;
  }

  return { resolvedHtmlPath, temporaryDirectory };
}

/**
 * Read deterministic metadata from a local report, report directory, or
 * HTTP(S) report URL. Remote reports are downloaded to a temporary local path
 * that is returned for follow-up report-tool actions.
 */
export async function getReportMetadata(
  options: GetReportMetadataOptions,
): Promise<ReportMetadata> {
  if (!options.report) {
    throw new Error('getReportMetadata: report is required');
  }

  if (!/^https?:\/\//i.test(options.report)) {
    return readReportMetadata(options);
  }

  const materialized = await downloadReport(options.report);
  try {
    return {
      schemaVersion: 1,
      source: options.report,
      resolvedHtmlPath: materialized.resolvedHtmlPath,
      ...readReportContentMetadata(materialized.resolvedHtmlPath),
    };
  } catch (error) {
    await rm(materialized.temporaryDirectory, {
      recursive: true,
      force: true,
    });
    throw error;
  }
}
