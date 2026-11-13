#!/usr/bin/env node
import { realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { Command, CommanderError } from 'commander';
import c from 'tinyrainbow';
import { z } from 'zod';
import { version } from '../package.json';
import { printHeader } from './output';
import { reportCommand } from './report';
import { runCommand } from './run';
import { validateCommand } from './validate';
import { viewerCommand } from './viewer';

export async function main(argv = process.argv) {
  const program = new Command()
    .name('midscene-benchmark-grounding')
    .description(
      'View and validate testcases, evaluate models and generate standalone reports.',
    )
    .version(version)
    .exitOverride();

  for (const command of [
    validateCommand,
    viewerCommand,
    runCommand,
    reportCommand,
  ])
    program.addCommand(command().copyInheritedSettings(program));

  if (
    argv.length <= 2 ||
    argv[2] === 'help' ||
    argv.includes('--help') ||
    argv.includes('-h')
  )
    printHeader('HELP');
  if (argv.length <= 2) {
    program.outputHelp();
    return 0;
  }
  try {
    await program.parseAsync(argv);
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
    throw error;
  }
  return program.args[0] === 'viewer' ? undefined : 0;
}

if (
  process.argv[1] &&
  import.meta.url ===
    pathToFileURL(realpathSync(path.resolve(process.argv[1]))).href
) {
  main()
    .then(async (code) => {
      if (code === undefined) return;
      // Timed-out model requests may still own sockets. Only the CLI ends its process.
      await Promise.all([
        new Promise<void>((resolve) =>
          process.stdout.write('', () => resolve()),
        ),
        new Promise<void>((resolve) =>
          process.stderr.write('', () => resolve()),
        ),
      ]);
      process.exit(code);
    })
    .catch(async (error: unknown) => {
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
      await new Promise<void>((resolve) =>
        process.stdout.write('', () => resolve()),
      );
      process.stderr.write(
        `\n ${c.red('× ERROR')} ${message.replaceAll('\n', '\n   ')}\n`,
        () => process.exit(1),
      );
    });
}
