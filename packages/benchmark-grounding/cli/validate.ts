import { loadTestcases } from '@midscene/benchmark-grounding';
import { Command } from 'commander';

export function validateCommand() {
  return new Command('validate')
    .description('Validate testcase data, file hashes and ground-truth bounds.')
    .option(
      '--testcases <directory>',
      'Testcase directory (defaults to the bundled dataset).',
    )
    .option('--names <name...>', 'Exact testcase names to validate.')
    .action(async (options) => {
      const testcases = await loadTestcases({
        directory: options.testcases,
        names: options.names,
      });
      process.stdout.write(`Validated ${testcases.length} testcases.\n`);
    });
}
