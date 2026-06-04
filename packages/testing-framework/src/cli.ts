/**
 * `midscene-tf` — minimal CLI for the v2 testing framework (Phase 0).
 *
 * Usage:
 *   midscene-tf run [--config <path>] [--root <dir>] [file...]
 */
import { runWithRstest } from './rstest';
import type { RunSummary } from './types';

interface ParsedArgs {
  command: string;
  config?: string;
  root?: string;
  files: string[];
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { command: argv[0] ?? 'run', files: [] };
  for (let i = 1; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--config' || arg === '-c') {
      args.config = argv[++i];
    } else if (arg === '--root' || arg === '-r') {
      args.root = argv[++i];
    } else if (arg.startsWith('-')) {
      throw new Error(`[midscene] Unknown flag: ${arg}`);
    } else {
      args.files.push(arg);
    }
  }
  return args;
}

function printSummary(summary: RunSummary): void {
  console.log('');
  console.log(`Midscene v2 — ${summary.total} case(s)`);
  for (const c of summary.cases) {
    const mark = c.status === 'passed' ? '✓' : '✗';
    console.log(`  ${mark} ${c.name} (${c.durationMs}ms)`);
    for (const step of c.steps) {
      const stepMark =
        step.status === 'passed'
          ? '✓'
          : step.status === 'failed'
            ? '✗'
            : step.status === 'warning'
              ? '!'
              : '·';
      const detail = step.verdict
        ? ` — ${step.verdict.reason}`
        : step.error
          ? ` — ${step.error}`
          : '';
      console.log(`     ${stepMark} [${step.node}]${detail}`);
    }
    for (const w of c.warnings) {
      console.log(`     ! ${w}`);
    }
  }
  console.log('');
  console.log(
    `Passed: ${summary.passed}  Failed: ${summary.failed}  (${summary.durationMs}ms)`,
  );
}

export async function main(argv = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv);

  if (args.command !== 'run') {
    console.error(`[midscene] Unknown command "${args.command}". Try: run`);
    return 2;
  }

  const { summary, exitCode } = await runWithRstest({
    configPath: args.config ?? args.root,
    projectRoot: args.root,
    files: args.files,
  });
  printSummary(summary);
  return summary.failed > 0 ? 1 : exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
