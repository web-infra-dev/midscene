import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Command } from 'commander';
import terminalLink from 'terminal-link';
import c from 'tinyrainbow';
import { loadTestcases, resolveDatasetDirectory } from '../core';
import { printHeader, printResult, write } from './output';

/** The prepare command and viewer/run use the same acquisition and validation. */
export async function prepareTestcases({
  directory,
  names,
}: { directory?: string; names?: string[] } = {}) {
  printHeader('PREPARE');
  const root =
    directory === undefined
      ? await resolveDatasetDirectory((message) => write(c.dim(` ${message}`)))
      : path.resolve(directory);
  write(
    ` Dataset: ${c.cyan(root)}`,
    c.dim(' Checking testcase data, hashes, screenshots and ground truth.'),
    '',
  );
  const testcases = await loadTestcases({
    directory: root,
    names,
    onProgress: ({ name, filename, testcaseSha256, error }) => {
      const link = terminalLink(name, pathToFileURL(filename).href, {
        fallback: () => filename,
      });
      printResult(
        error ? 'FAIL' : 'PASS',
        error
          ? error.message.replace(name, () => link)
          : `${link} ${c.dim(`SHA-256 ${testcaseSha256}`)}`,
      );
    },
  }).catch((error: unknown) => {
    if (error instanceof AggregateError)
      throw new Error(error.message.split('\n')[0], { cause: error });
    throw error;
  });
  write(
    '',
    ` ${c.bold('Preparation complete:')} ${c.green(`${testcases.length} passed`)}, ${c.dim(`0 failed (${testcases.length} total).`)}`,
    '',
  );
  return { directory: root, testcases };
}

export function prepareCommand() {
  return new Command('prepare')
    .description('Download the dataset if needed and validate testcase files.')
    .option(
      '--testcases <directory>',
      'Local testcase directory; skips the default dataset download.',
    )
    .option('--names <name...>', 'Exact testcase names to validate.')
    .action(async (options) => {
      await prepareTestcases({
        directory: options.testcases,
        names: options.names,
      });
    });
}
