import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadTestcases } from '@midscene/benchmark-grounding';
import { Command } from 'commander';
import terminalLink from 'terminal-link';
import c from 'tinyrainbow';
import { printHeader, printResult, write } from './output';

export function validateCommand() {
  return new Command('validate')
    .description('Validate testcase data, file hashes and ground-truth bounds.')
    .option(
      '--testcases <directory>',
      'Testcase directory (defaults to the bundled dataset).',
    )
    .option('--names <name...>', 'Exact testcase names to validate.')
    .action(async (options) => {
      const root = options.testcases
        ? path.resolve(options.testcases)
        : path.join(
            path.dirname(
              createRequire(import.meta.url).resolve(
                '@midscene/benchmark-grounding/package.json',
              ),
            ),
            'testcases',
          );
      printHeader('VALIDATE');
      write(
        c.dim(' Checking testcase data, hashes, screenshots and ground truth.'),
        '',
      );
      const testcases = await loadTestcases({
        directory: options.testcases,
        names: options.names,
        onProgress: ({ name, testcaseSha256, error }) => {
          const filename = path.join(root, name, 'index.json');
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
        ` ${c.bold('Validation complete:')} ${c.green(`${testcases.length} passed`)}, ${c.dim(`0 failed (${testcases.length} total).`)}`,
        '',
      );
    });
}
