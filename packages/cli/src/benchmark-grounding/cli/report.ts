import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { getDebug } from '@midscene/shared/logger';
import { Command } from 'commander';
import open from 'open';
import c from 'tinyrainbow';
import { type ReportBundle, createReport, stringifyReportData } from '../core';
import { formatDuration, printHeader, printResult, write } from './output';

const warn = getDebug('benchmark-grounding:cli', { console: true });

/** Report commands share the same publication and browser-opening behavior. */
export async function saveReport({
  report,
  directory,
  startedAt,
  openReport = true,
}: {
  report: ReportBundle;
  directory: string;
  startedAt: number;
  openReport?: boolean;
}) {
  const previous = await lstat(directory).catch(
    (error: NodeJS.ErrnoException) => {
      if (error.code !== 'ENOENT') throw error;
      return undefined;
    },
  );
  if (previous && !previous.isDirectory())
    throw new Error(`Report output must be a directory: ${directory}`);
  if (previous) {
    const entries = await readdir(directory);
    if (entries.length) {
      const format = entries.includes('index.html')
        ? (await readFile(path.join(directory, 'index.html'), 'utf8')).match(
            /"reportFormat":"(static-v[12])"/,
          )?.[1]
        : undefined;
      const expected = [
        'index.html',
        'brief.html',
        'metrics.json',
        'screenshots',
        '.DS_Store',
      ];
      if (format === 'static-v1') expected.push('static', 'results');
      if (!format || entries.some((entry) => !expected.includes(entry)))
        throw new Error(
          `Report output directory contains other files: ${directory}`,
        );
    }
  }

  await mkdir(path.dirname(directory), { recursive: true });
  const staging = await mkdtemp(
    path.join(path.dirname(directory), '.midscene-report-'),
  );
  const next = path.join(staging, 'next');
  const backup = path.join(staging, 'previous');
  let retainBackup = false;
  try {
    await mkdir(path.join(next, 'screenshots'), { recursive: true });
    for (const [relative, contents] of report.files) {
      await writeFile(path.join(next, relative), contents);
    }
    await writeFile(path.join(next, 'index.html'), report.html);
    await writeFile(path.join(next, 'brief.html'), report.briefHtml);
    await writeFile(
      path.join(next, 'metrics.json'),
      `${stringifyReportData(report.metrics)}\n`,
    );
    if (previous) {
      await rename(directory, backup);
      retainBackup = true;
    }
    try {
      await rename(next, directory);
    } catch (error) {
      if (retainBackup) await rename(backup, directory);
      retainBackup = false;
      throw error;
    }
    retainBackup = false;
  } finally {
    if (!retainBackup) await rm(staging, { recursive: true, force: true });
  }

  const filename = path.join(directory, 'index.html');
  printResult(
    'PASS',
    `Report generated ${c.dim(`(${formatDuration(performance.now() - startedAt)})`)}`,
  );
  write(
    ` Folder: ${c.cyan(directory)}`,
    ` Report: ${c.cyan(filename)}`,
    `  Brief: ${c.cyan(path.join(directory, 'brief.html'))}`,
    `Metrics: ${c.cyan(path.join(directory, 'metrics.json'))}`,
    '',
  );
  if (openReport) {
    try {
      await open(pathToFileURL(filename).href);
    } catch {
      warn(`Could not open the browser. Open the report manually: ${filename}`);
    }
  }
}

export async function writeReport({
  runDirectory,
  output,
  openReport = true,
}: {
  runDirectory: string;
  output?: string;
  openReport?: boolean;
}) {
  const directory = path.resolve(runDirectory);
  write('', c.dim(' Generating static report...'));
  const startedAt = performance.now();
  const report = await createReport({ runDirectory: directory });
  await saveReport({
    report,
    directory: path.resolve(
      output ?? path.join(directory, `report-${report.evaluationId}`),
    ),
    startedAt,
    openReport,
  });
}

export function reportCommand() {
  return new Command('report')
    .description('Generate and open a static report from a saved run.')
    .argument(
      '<run-directory>',
      'Run directory containing snapshots and results.',
    )
    .option(
      '--output <directory>',
      'Report output directory (defaults to <run-directory>/report-<evaluationId>).',
    )
    .option('--no-open', 'Do not open a browser.')
    .action(async (runDirectory, options) => {
      printHeader('REPORT');
      await writeReport({
        runDirectory,
        output: options.output,
        openReport: options.open,
      });
    });
}
