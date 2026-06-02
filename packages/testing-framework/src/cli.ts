#!/usr/bin/env node
import { emitRstestProject } from './emit';
import { runMidsceneTest } from './runner';

const readFlag = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  if (index !== -1 && index + 1 < args.length) {
    return args[index + 1];
  }
  return undefined;
};

const firstPositional = (args: string[]): string | undefined =>
  args.find((arg) => !arg.startsWith('-'));

const USAGE = `midscene-testing-framework <command>

Commands:
  test [--config <path>]            Run the suite in-process via Rstest (mode A)
  emit <out-dir> [--config <path>]  Export a native Rstest project (mode B)
`;

export async function runCli(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;

  if (command === 'emit') {
    const outDir = firstPositional(rest);
    if (!outDir) {
      throw new Error(
        'emit requires an output directory: midscene-testing-framework emit <out-dir>',
      );
    }
    const result = await emitRstestProject({
      outDir,
      configPath: readFlag(rest, '--config'),
    });
    console.log(
      `Emitted native Rstest project to ${result.outDir} (${result.caseFiles.length} case(s))`,
    );
    return;
  }

  if (command === 'test' || command === undefined) {
    await runMidsceneTest({ configPath: readFlag(rest, '--config') });
    return;
  }

  if (command === '--help' || command === '-h' || command === 'help') {
    console.log(USAGE);
    return;
  }

  throw new Error(`unknown command: ${command}\n\n${USAGE}`);
}

runCli(process.argv.slice(2)).catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});
