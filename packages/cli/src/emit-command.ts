import { emitRstestProject } from '@midscene/testing-framework';

export interface EmitCommandDeps {
  emit: typeof emitRstestProject;
}

const readFlag = (args: string[], name: string): string | undefined => {
  const index = args.indexOf(name);
  return index !== -1 && index + 1 < args.length ? args[index + 1] : undefined;
};

const firstPositional = (args: string[]): string | undefined => {
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg.startsWith('-')) {
      // `--flag value` consumes the following token as its value, so skip it
      // (but not `--flag=value`, which is self-contained).
      const next = args[index + 1];
      if (!arg.includes('=') && next !== undefined && !next.startsWith('-')) {
        index += 1;
      }
      continue;
    }
    return arg;
  }
  return undefined;
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
  const outDir = firstPositional(args);
  if (!outDir) {
    console.error('Usage: midscene emit <out-dir> [--config <path>]');
    return 1;
  }

  const result = await deps.emit({
    outDir,
    configPath: readFlag(args, '--config'),
  });
  console.log(
    `Emitted native Rstest project to ${result.outDir} (${result.caseFiles.length} case(s))`,
  );
  return 0;
}
