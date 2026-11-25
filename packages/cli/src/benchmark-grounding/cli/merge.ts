import { realpath } from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import c from 'tinyrainbow';
import { mergeReports } from '../core';
import { printHeader, write } from './output';
import { saveReport } from './report';

export function mergeCommand() {
  return new Command('merge')
    .description(
      'Merge static reports. Later inputs replace overlapping results.',
    )
    .argument(
      '<reports...>',
      'Local report directories, HTML paths, or HTTP(S) URLs in increasing priority order.',
    )
    .option(
      '--output <directory>',
      'Report output directory (defaults to ./report-<evaluationId>).',
    )
    .option('--no-open', 'Do not open a browser.')
    .action(async (reportFiles: string[], options) => {
      printHeader('MERGE');
      const sources = reportFiles.map((file) =>
        /^https?:\/\//i.test(file) ? new URL(file) : path.resolve(file),
      );
      const localFiles = sources.filter((source) => typeof source === 'string');
      const checkOutput = async (directory: string) => {
        const target = await realpath(directory).catch(
          (error: NodeJS.ErrnoException) => {
            if (error.code !== 'ENOENT') throw error;
            return directory;
          },
        );
        const resolved = await Promise.all(
          localFiles.map((file) => realpath(file)),
        );
        if (
          [...localFiles, ...resolved].some((file) => {
            const relative = path.relative(target, file);
            return (
              relative === '' ||
              (!relative.startsWith(`..${path.sep}`) &&
                relative !== '..' &&
                !path.isAbsolute(relative))
            );
          })
        )
          throw new Error(
            'The merged report must not overwrite an input report.',
          );
      };
      const output =
        options.output === undefined ? undefined : path.resolve(options.output);
      if (output) await checkOutput(output);

      write(
        c.dim(` Merging ${sources.length} reports in the supplied order...`),
      );
      const startedAt = performance.now();
      const report = await mergeReports({ reportFiles: sources });
      const directory = output ?? path.resolve(`report-${report.evaluationId}`);
      if (!output) await checkOutput(directory);
      await saveReport({
        report,
        directory,
        startedAt,
        openReport: options.open,
      });
    });
}
