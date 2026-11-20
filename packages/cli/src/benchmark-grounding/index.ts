import { Command, CommanderError } from 'commander';
import c from 'tinyrainbow';
import { z } from 'zod';
import { version } from '../../package.json';
import { mergeCommand } from './cli/merge';
import { printHeader } from './cli/output';
import { prepareCommand } from './cli/prepare';
import { reportCommand } from './cli/report';
import { runCommand } from './cli/run';
import { viewerCommand } from './cli/viewer';

export async function main(args: string[]) {
  const program = new Command()
    .name('midscene model benchmark-grounding')
    .description(
      'Prepare datasets, view testcases, evaluate models and generate or merge standalone reports.',
    )
    .version(version)
    .exitOverride();

  for (const command of [
    prepareCommand,
    viewerCommand,
    runCommand,
    reportCommand,
    mergeCommand,
  ])
    program.addCommand(command().copyInheritedSettings(program));

  if (
    args.length === 0 ||
    args[0] === 'help' ||
    args.includes('--help') ||
    args.includes('-h')
  )
    printHeader('HELP');
  if (args.length === 0) {
    program.outputHelp();
    return 0;
  }
  try {
    await program.parseAsync(args, { from: 'user' });
  } catch (error) {
    if (
      error instanceof CommanderError &&
      [
        'commander.help',
        'commander.helpDisplayed',
        'commander.version',
      ].includes(error.code)
    )
      return 0;
    const message =
      error instanceof z.ZodError
        ? error.issues
            .map(
              (issue) =>
                `${issue.path.join('.') || 'configuration'}: ${issue.message}`,
            )
            .join('\n')
        : error instanceof Error
          ? error.message
          : String(error);
    process.stderr.write(
      `\n ${c.red('× ERROR')} ${message.replaceAll('\n', '\n   ')}\n`,
    );
    return 1;
  }
  return program.args[0] === 'viewer' ? undefined : 0;
}
