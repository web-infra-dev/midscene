import { emitRstestProject } from '@midscene/testing-framework';
import { dependencies } from '../package.json';

export interface EmitCommandDeps {
  emit: typeof emitRstestProject;
  rstestVersion?: string;
}

interface ParsedEmitArgs {
  outDir?: string;
  configPath?: string;
  error?: string;
  help?: boolean;
}

const usage = 'Usage: midscene emit <out-dir> [--config <path>]';
const help = `${usage}

Options:
  --config <path>  Path to the source midscene.config file
  -h, --help       Show this help message`;

const normalizePackageVersion = (
  packageVersion: string | undefined,
  fallbackVersion: string,
): string => {
  if (!packageVersion || packageVersion.startsWith('workspace:')) {
    return fallbackVersion;
  }
  return packageVersion;
};

const defaultRstestVersion = normalizePackageVersion(
  dependencies['@rstest/core'],
  'latest',
);

const parseEmitArgs = (args: string[]): ParsedEmitArgs => {
  let outDir: string | undefined;
  let configPath: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];

    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }

    if (arg === '--config') {
      const value = args[index + 1];
      if (!value || value.startsWith('-')) {
        return { error: '--config requires a path value' };
      }
      configPath = value;
      index += 1;
      continue;
    }

    if (arg.startsWith('--config=')) {
      const value = arg.slice('--config='.length);
      if (!value) {
        return { error: '--config requires a path value' };
      }
      configPath = value;
      continue;
    }

    if (arg.startsWith('-')) {
      return { error: `Unknown option: ${arg}` };
    }

    if (!outDir) {
      outDir = arg;
      continue;
    }

    return { error: `Unexpected argument: ${arg}` };
  }

  return { outDir, configPath };
};

/**
 * `midscene emit <out-dir> [--config <path>]` — export a self-contained native
 * Rstest project (`rstest.config.ts` + `e2e/*.test.ts` + `package.json`) from a
 * `midscene.config.ts`. Thin CLI wrapper around `@midscene/testing-framework`'s
 * `emitRstestProject`.
 */
export async function runEmitCommand(
  args: string[],
  deps: EmitCommandDeps = { emit: emitRstestProject },
): Promise<number> {
  const {
    outDir,
    configPath,
    error,
    help: shouldShowHelp,
  } = parseEmitArgs(args);
  if (shouldShowHelp) {
    console.log(help);
    return 0;
  }

  if (error) {
    console.error(`${error}\n${usage}`);
    return 1;
  }

  if (!outDir) {
    console.error(usage);
    return 1;
  }

  const result = await deps.emit({
    outDir,
    configPath,
    rstestVersion: deps.rstestVersion ?? defaultRstestVersion,
  });
  console.log(
    `Emitted native Rstest project to ${result.outDir} (${result.caseFiles.length} case(s))`,
  );
  return 0;
}
