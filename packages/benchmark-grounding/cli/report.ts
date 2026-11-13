import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createReport } from '@midscene/benchmark-grounding';
import { getDebug } from '@midscene/shared/logger';
import { Command } from 'commander';
import open from 'open';

const warn = getDebug('benchmark-grounding:cli', { console: true });

/** Both CLI entry points use exactly the same generation, write and open path. */
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
  const filename = path.resolve(output ?? path.join(directory, 'report.html'));
  const html = await createReport({ runDirectory: directory });
  await mkdir(path.dirname(filename), { recursive: true });
  await writeFile(filename, html);
  process.stdout.write(`Report: ${filename}\n`);
  if (openReport) {
    try {
      await open(pathToFileURL(filename).href);
    } catch {
      warn(`Could not open the browser. Open the report manually: ${filename}`);
    }
  }
}

export function reportCommand() {
  return new Command('report')
    .description('Generate and open a standalone report from a saved run.')
    .argument(
      '<run-directory>',
      'Run directory containing snapshots and results.',
    )
    .option(
      '--output <file>',
      'HTML output file (defaults to <run-directory>/report.html).',
    )
    .option('--no-open', 'Do not open a browser.')
    .action(async (runDirectory, options) => {
      await writeReport({
        runDirectory,
        output: options.output,
        openReport: options.open,
      });
    });
}
