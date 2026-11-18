import { stat } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import c from 'tinyrainbow';
import { mergeReports } from '../core';
import { printHeader, write } from './output';
import { saveReport } from './report';

export function mergeCommand() {
  return new Command('merge')
    .description(
      'Merge standalone reports; later files replace overlapping results.',
    )
    .argument('<report-files...>', 'HTML reports in increasing priority order.')
    .option('--output <file>', 'HTML output file.', './merged-report.html')
    .option('--no-open', 'Do not open a browser.')
    .action(async (reportFiles: string[], options) => {
      printHeader('MERGE');
      const filename = path.resolve(options.output);
      const sources = reportFiles.map((file) => path.resolve(file));
      const target = await stat(filename).catch(
        (error: NodeJS.ErrnoException) => {
          if (error.code !== 'ENOENT') throw error;
          return undefined;
        },
      );
      if (
        sources.includes(filename) ||
        (target &&
          (await Promise.all(sources.map((file) => stat(file)))).some(
            (source) => source.dev === target.dev && source.ino === target.ino,
          ))
      )
        throw new Error(
          'The merged report must not overwrite an input report.',
        );

      write(
        c.dim(` Merging ${sources.length} reports in the supplied order...`),
      );
      const startedAt = performance.now();
      await saveReport({
        html: await mergeReports({ reportFiles: sources }),
        filename,
        startedAt,
        openReport: options.open,
      });
    });
}
